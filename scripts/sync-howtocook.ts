/**
 * 上游重新同步（CB-010 第 2/3 段）。
 *
 * 三方比较：基线（上次同步的样子）/ 上游新版 / 本地现在。四档：
 *   都没变 → 跳过；只有上游变 → 可直接更新；只有本地变 → 保留本地；**两边都变 → 需要合并**。
 * 只有最后一档才会请 LLM（`gpt-5.6-luna` + `reasoning_effort: low`），而且**只出提案**：
 * 人工看过提案（json + md）后用 `--apply <proposalId>` 才落地（落前写历史，可回退）。
 *
 * 用法：
 *   npx tsx scripts/sync-howtocook.ts --source ~/Workspace/HowToCook                  # 只报告（默认）
 *   npx tsx scripts/sync-howtocook.ts --source ... --apply-upstream <id>             # 上游独有改动，直接采用
 *   npx tsx scripts/sync-howtocook.ts --source ... --propose --only <id>             # 两边都改 → 生成提案
 *   npx tsx scripts/sync-howtocook.ts --source ... --apply <proposalId>              # 审阅后落地
 *
 * 安全：默认**不写任何文件**；写盘走 `RecipeRepository.saveRecipe`（与网页保存**同一条路径**：
 * 校验 → 历史快照 → 原子替换），因此落地永远留得下回退记录。
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { PARSER_VERSION, semanticHash } from "../src/server/lib/recipe-canonical.js";
import { recipeSchema } from "../src/server/lib/schema.js";
import { RecipeRepository } from "../src/server/services/recipe-repository.js";
import type { Recipe, RecipeSourceRef } from "../src/shared/types.js";
import { UPSTREAM_REPO, parseUpstreamRecipe } from "./lib/howtocook-source.js";
import { loadLlmConfig, proposeMerge } from "./lib/llm-merge.js";
import { classifyChange, mergeFields, type Conflict } from "./lib/sync-merge.js";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = new URL("..", import.meta.url).pathname;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface Options {
  source: string;
  dataDir: string;
  ref: string;
  only: string | null;
  propose: boolean;
  applyUpstream: string | null;
  applyProposal: string | null;
  model: string | undefined;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    source: "",
    dataDir: join(PROJECT_ROOT, "data"),
    ref: "HEAD",
    only: null,
    propose: false,
    applyUpstream: null,
    applyProposal: null,
    model: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") options.source = argv[++index] ?? "";
    else if (arg === "--data-dir") options.dataDir = argv[++index] ?? options.dataDir;
    else if (arg === "--ref") options.ref = argv[++index] ?? "HEAD";
    else if (arg === "--only") options.only = argv[++index] ?? null;
    else if (arg === "--model") options.model = argv[++index] ?? undefined;
    else if (arg === "--propose") options.propose = true;
    else if (arg === "--apply-upstream") options.applyUpstream = argv[++index] ?? null;
    else if (arg === "--apply") options.applyProposal = argv[++index] ?? null;
  }

  return options;
}

/** 取上游某个 ref 下的文件（`git show <ref>:<path>`；取不到就报错，不猜） */
async function readUpstreamAt(sourceDir: string, ref: string, path: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["show", `${ref}:${path}`], {
    cwd: sourceDir,
    maxBuffer: 8 * 1024 * 1024
  });
  return stdout;
}

interface Proposal {
  proposalId: string;
  recipeId: string;
  kind: "merge";
  baseRevision: string;
  baseHash: string;
  upstreamHash: string;
  upstreamCommit: string;
  localHash: string;
  model: string;
  reasoningEffort: string;
  parserVersion: string;
  createdAt: string;
  /** 未解决冲突必须为空才能 --apply */
  conflicts: (Conflict & { resolved: null })[];
  explanation: string;
  /** 两边都没有、只出现在提案里的值（人工逐项核对） */
  suspiciousValues: string[];
  recipe: Recipe;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.source) {
    console.error("必须指定 --source <HowToCook 克隆目录>");
    process.exit(1);
  }
  if (!existsSync(options.dataDir)) {
    console.error(`数据目录不存在：${options.dataDir}`);
    process.exit(1);
  }

  const repository = await RecipeRepository.load(options.dataDir);
  const recipes = repository.list().filter((recipe) => recipe.sourceRef);
  const { stdout: commitStdout } = await execFileAsync("git", ["rev-parse", "--short", options.ref], {
    cwd: options.source
  });
  const upstreamCommit = commitStdout.trim();

  /* ---------- 应用一个已审阅的提案 ---------- */
  if (options.applyProposal) {
    const dir = join(options.dataDir, "sync-proposals");
    const files = existsSync(dir) ? await readdir(dir) : [];
    const file = files.find((name) => name.startsWith(options.applyProposal ?? "") && name.endsWith(".json"));
    if (!file) {
      console.error(`找不到提案：${options.applyProposal}`);
      process.exit(1);
    }

    let proposal: Proposal;
    try {
      // SAFETY: 提案文件由本脚本 --propose 生成；结构不对会在下面的字段检查里被挡下
      proposal = JSON.parse(await readFile(join(dir, file), "utf8")) as Proposal;
    } catch (error) {
      console.error(`提案文件读不出来（${(error as Error).message}）：${file}`);
      process.exit(1);
    }

    if (!proposal.proposalId || !proposal.recipeId || !proposal.baseRevision || !proposal.recipe) {
      console.error(`提案文件缺字段（不是本脚本生成的？）：${file}`);
      process.exit(1);
    }

    if (proposal.conflicts.length > 0) {
      console.error(
        `提案里还有 ${proposal.conflicts.length} 处未解决冲突（${proposal.conflicts
          .map((conflict) => conflict.path)
          .join("、")}）—— 先逐项解决再落地（首版没有一键绕过）。`
      );
      process.exit(1);
    }

    const current = repository.detail(proposal.recipeId);
    if (!current) {
      console.error(`菜谱不存在：${proposal.recipeId}`);
      process.exit(1);
    }
    if (current.revision !== proposal.baseRevision) {
      console.error(
        `本地已经又变过了（revision 不一致）—— 这份提案是基于旧版本生成的，请重新 --propose。`
      );
      process.exit(1);
    }

    const saved = await repository.saveRecipe({
      id: proposal.recipeId,
      recipe: proposal.recipe,
      baseRevision: proposal.baseRevision,
      source: "llm-merge",
      note: `按提案 ${proposal.proposalId} 合并上游 ${proposal.upstreamCommit}`
    });
    for (const warning of saved.warnings) console.warn(`⚠ ${warning}`);

    const sourceRef: RecipeSourceRef = {
      repo: UPSTREAM_REPO,
      path: current.sourceRef?.path ?? "",
      commit: proposal.upstreamCommit,
      baselineStatus: "verified",
      baselineHash: semanticHash(saved.recipe),
      parserVersion: PARSER_VERSION,
      lastSyncedAt: new Date().toISOString().slice(0, 10)
    };
    await writeUpstreamRef(repository, options.dataDir, proposal.recipeId, sourceRef);

    console.log(`✅ 已落地提案 ${proposal.proposalId}（菜谱 ${proposal.recipeId}），历史快照已写，可回退`);
    return;
  }

  /* ---------- 上游独有改动：直接采用 ---------- */
  if (options.applyUpstream) {
    const recipe = repository.get(options.applyUpstream);
    if (!recipe?.sourceRef) {
      console.error(`没有 sourceRef，无法同步：${options.applyUpstream}`);
      process.exit(1);
    }

    const markdown = await readUpstreamAt(options.source, options.ref, recipe.sourceRef.path);
    const parsed = parseUpstreamRecipe(markdown, recipe.sourceRef.path, recipe.id);
    if (!parsed.dish) {
      console.error(`上游解析失败：${parsed.issues.join("；")}`);
      process.exit(1);
    }

    const saved = await repository.saveRecipe({
      id: recipe.id,
      recipe: { ...parsed.dish, tags: recipe.tags, equipment: recipe.equipment, source: recipe.source },
      baseRevision: repository.revisionOf(recipe.id),
      source: "import",
      note: `采用上游 ${upstreamCommit} 的版本`
    });
    for (const warning of saved.warnings) console.warn(`⚠ ${warning}`);

    await writeUpstreamRef(repository, options.dataDir, recipe.id, {
      repo: UPSTREAM_REPO,
      path: recipe.sourceRef.path,
      commit: upstreamCommit,
      baselineStatus: "verified",
      baselineHash: semanticHash(saved.recipe),
      parserVersion: PARSER_VERSION,
      lastSyncedAt: new Date().toISOString().slice(0, 10)
    });

    console.log(`✅ 已采用上游版本：${recipe.id}（历史快照已写，可回退）`);
    return;
  }

  /* ---------- 逐道判断（默认只报告） ---------- */
  const upstreamOnly: string[] = [];
  const localOnly: string[] = [];
  const both: string[] = [];
  const unchanged: string[] = [];
  const problems: string[] = [];

  for (const recipe of recipes) {
    if (options.only && recipe.id !== options.only) continue;
    let baseline: Recipe;
    try {
      baseline = JSON.parse(
        await readFile(join(options.dataDir, "baselines", `${recipe.id}.json`), "utf8")
      ) as Recipe;
    } catch {
      problems.push(`${recipe.id}: 没有基线快照（matched 或未回填）→ 只能人工建立基线`);
      continue;
    }

    let upstream: Recipe;
    try {
      const markdown = await readUpstreamAt(options.source, options.ref, recipe.sourceRef?.path ?? "");
      const parsed = parseUpstreamRecipe(markdown, recipe.sourceRef?.path ?? "", recipe.id);
      if (!parsed.dish) throw new Error(parsed.issues.join("；"));
      upstream = parsed.dish;
    } catch (error) {
      problems.push(`${recipe.id}: 读上游失败（${(error as Error).message.slice(0, 80)}）`);
      continue;
    }

    const bucket = classifyChange({ baseline, upstream, local: recipe });
    if (bucket === "unchanged") unchanged.push(recipe.id);
    else if (bucket === "upstream-only") upstreamOnly.push(recipe.id);
    else if (bucket === "local-only") localOnly.push(recipe.id);
    else both.push(recipe.id);

    if (bucket !== "both" || !options.propose || (options.only && recipe.id !== options.only)) continue;

    /* ---------- 生成合并提案（只有两边都改才会走到这里） ---------- */
    const mechanical = mergeFields({ baseline, upstream, local: recipe });
    const llm = loadLlmConfig(process.env, options.model);
    if (!llm.ok) {
      console.error(`⚠ ${recipe.id}: ${llm.problem}（只报告差异，不生成提案）`);
      continue;
    }

    console.log(`… ${recipe.id}: 请 ${llm.config.model}（low）合并 ${mechanical.conflicts.length} 处冲突`);
    const proposal = await proposeMerge(
      { baseline, upstream, local: recipe, conflicts: mechanical.conflicts, mechanical: mechanical.recipe },
      llm.config
    );
    if (!proposal.ok) {
      console.error(`⚠ ${recipe.id}: ${proposal.reason}`);
      continue;
    }

    // 提案以 LLM 的结果为底，但本地拥有的字段与 id 一定用本地的（LLM 不得决定这些）
    const finalRecipe: Recipe = {
      ...recipe,
      ...proposal.recipe,
      id: recipe.id,
      sourceRef: recipe.sourceRef,
      source: recipe.source,
      tags: recipe.tags,
      equipment: recipe.equipment,
      equipmentAlternatives: recipe.equipmentAlternatives
    };
    const valid = recipeSchema.safeParse(finalRecipe);
    if (!valid.success) {
      console.error(`⚠ ${recipe.id}: 拼好的提案过不了校验，放弃`);
      continue;
    }

    const proposalId = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}-${recipe.id}`;
    const record: Proposal = {
      proposalId,
      recipeId: recipe.id,
      kind: "merge",
      baseRevision: repository.revisionOf(recipe.id),
      baseHash: semanticHash(baseline),
      upstreamHash: semanticHash(upstream),
      upstreamCommit,
      localHash: semanticHash(recipe),
      model: llm.config.model,
      reasoningEffort: llm.config.reasoningEffort,
      parserVersion: PARSER_VERSION,
      createdAt: new Date().toISOString(),
      conflicts: mechanical.conflicts.map((conflict) => ({ ...conflict, resolved: null })),
      explanation: proposal.explanation,
      suspiciousValues: proposal.suspiciousValues,
      recipe: valid.data as Recipe
    };

    const dir = join(options.dataDir, "sync-proposals");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${proposalId}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await writeFile(
      join(dir, `${proposalId}.md`),
      [
        `# 合并提案 ${proposalId}`,
        ``,
        `- 菜谱：\`${recipe.id}\`（${recipe.name}）`,
        `- 上游：${upstreamCommit} · ${recipe.sourceRef?.path ?? ""}`,
        `- 模型：${llm.config.model}（reasoning_effort=${llm.config.reasoningEffort}）`,
        `- 基线/上游/本地 语义哈希：${record.baseHash.slice(0, 14)} / ${record.upstreamHash.slice(0, 14)} / ${record.localHash.slice(0, 14)}`,
        ``,
        `## LLM 的说明`,
        ``,
        proposal.explanation || "（没给说明）",
        ``,
        `## 需要你逐项决定的冲突（${mechanical.conflicts.length}）`,
        ``,
        ...(mechanical.conflicts.length === 0
          ? ["（没有冲突：两边改的是不同字段，机械合并即可）"]
          : mechanical.conflicts.map(
              (conflict, index) =>
                `### ${index + 1}. \`${conflict.path}\`\n\n- 基线：\`${JSON.stringify(conflict.baseline)}\`\n- 上游：\`${JSON.stringify(conflict.upstream)}\`\n- 本地：\`${JSON.stringify(conflict.local)}\``
            )),
        ``,
        `## 两边都没有、只出现在提案里的值（请核对是不是凭空加的）`,
        ``,
        proposal.suspiciousValues.length > 0
          ? proposal.suspiciousValues.map((value) => `- \`${value}\``).join("\n")
          : "（无）",
        ``,
        `## 审阅后落地`,
        ``,
        "```bash",
        `npx tsx scripts/sync-howtocook.ts --source ${options.source} --data-dir ${options.dataDir} --apply ${proposalId}`,
        "```",
        ``,
        `> 落地前会再校验本地 revision；有未解决冲突会被拒绝（首版没有一键绕过）。`
      ].join("\n"),
      "utf8"
    );

    console.log(`📝 提案已生成：data/sync-proposals/${proposalId}.{json,md}`);
    console.log(`   先读 md（冲突逐条 + 可疑值），确认后 --apply ${proposalId}`);
  }

  /* ---------- 报告 ---------- */
  console.log(
    `\n上游 ${options.source} @ ${upstreamCommit} ｜ 数据目录 ${options.dataDir}\n` +
      `有基线可比的菜谱：${recipes.length - problems.length}\n` +
      `  都没变            ：${unchanged.length}\n` +
      `  只有上游变（可直接更新）：${upstreamOnly.length}\n` +
      `  只有本地变（保留本地）  ：${localOnly.length}\n` +
      `  两边都变（需要合并）    ：${both.length}\n` +
      `  没法自动比（缺基线/上游读不到）：${problems.length}`
  );

  for (const [label, list] of [
    ["可直接更新（--apply-upstream <id>）", upstreamOnly],
    ["需要合并（--propose --only <id>）", both],
    ["没法自动比", problems]
  ] as const) {
    if (list.length === 0) continue;
    console.log(`\n${label}（前 10 条）：`);
    for (const item of list.slice(0, 10)) console.log(`  - ${item}`);
    if (list.length > 10) console.log(`  ……还有 ${list.length - 10} 条`);
  }

  if (!options.propose && !options.applyUpstream) {
    console.log("\n（默认只报告，没有写任何文件）");
  }
}

/** 更新 sourceRef（用 saveRecipe 走同一条写路径，保证历史与校验一致） */
async function writeUpstreamRef(
  repository: RecipeRepository,
  dataDir: string,
  id: string,
  sourceRef: RecipeSourceRef
): Promise<void> {
  const recipe = repository.get(id);
  if (!recipe) return;
  await repository.saveRecipe({
    id,
    recipe: { ...recipe, sourceRef },
    baseRevision: repository.revisionOf(id),
    source: "import",
    note: "更新来源信息"
  });
  await sleep(0); // 让队列跑完（saveRecipe 已是串行队列，这里只是明确意图）
  void dataDir;
}

await main();
