/**
 * 回填 `sourceRef`（CB-010 第 1 段）。
 *
 * 做什么：把已有的导入菜对回上游文件，写入来源信息。
 *   - 能唯一匹配、且**内容还算得出"就是当初那份"** → `baselineStatus: verified`
 *     （同时把基线快照落到 `data/baselines/`，供以后三方合并用）
 *   - 只能匹配到来源、证明不了基线 → `baselineStatus: matched`
 *     （这种**不会**被自动覆盖，只能走人工建立基线）
 *   - 匹配到多个 / 找不到 → **列清单让人决定，不猜**
 *
 * 用法：
 *   npx tsx scripts/backfill-source-ref.ts --source ~/Workspace/HowToCook            # 只报告（默认）
 *   npx tsx scripts/backfill-source-ref.ts --source ~/Workspace/HowToCook --apply    # 真写盘
 *   npx tsx scripts/backfill-source-ref.ts --source ... --only <id> --apply
 *
 * 安全：默认 **dry-run**（复核要求：批量写真实 `data/` 前要显式动作）；写盘前过同一份 zod；
 * 写入是原子替换（临时文件 → rename）。跑之前建议先停服或确认没人在网页上编辑。
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { loadEquipmentList } from "../src/server/lib/equipment.js";
import { PARSER_VERSION, sameContent, semanticHash } from "../src/server/lib/recipe-canonical.js";
import { serializeRecipe } from "../src/server/lib/recipe-revision.js";
import { createRecipeSchema, formatIssues } from "../src/server/lib/schema.js";
import { loadTagVocabulary } from "../src/server/lib/tags.js";
import { loadRecipesFromDir } from "../src/server/services/recipe-repository.js";
import type { Recipe, RecipeSourceRef } from "../src/shared/types.js";
import {
  IMPORTED_SOURCE_PREFIX,
  UPSTREAM_REPO,
  buildUpstreamIndex,
  matchUpstream,
  parseUpstreamRecipe,
  readUpstreamFile,
  resolveUpstreamCommit
} from "./lib/howtocook-source.js";

interface Options {
  source: string;
  dataDir: string;
  /** 默认 false = 只报告 */
  apply: boolean;
  only: string | null;
  limit: number | null;
}

const PROJECT_ROOT = new URL("..", import.meta.url).pathname;

function parseArgs(argv: string[]): Options {
  const options: Options = {
    source: "",
    dataDir: join(PROJECT_ROOT, "data"),
    apply: false,
    only: null,
    limit: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") options.source = argv[++index] ?? "";
    else if (arg === "--data-dir") options.dataDir = argv[++index] ?? options.dataDir;
    else if (arg === "--only") options.only = argv[++index] ?? null;
    else if (arg === "--limit") options.limit = Number.parseInt(argv[++index] ?? "", 10);
    else if (arg === "--apply") options.apply = true;
  }

  return options;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const temp = `${path}.tmp`;
  await writeFile(temp, content, "utf8");
  await rename(temp, path);
}

/** 基线快照 = 我们**确认过**的那份内容（+ 索引），供以后判断"本地改没改" */
async function writeBaseline(
  dataDir: string,
  recipe: Recipe,
  path: string,
  commit: string,
  baselineHash: string
): Promise<void> {
  const dir = join(dataDir, "baselines");
  await mkdir(dir, { recursive: true });
  await writeAtomic(join(dir, `${recipe.id}.json`), serializeRecipe(recipe));

  const indexFile = join(dir, "index.json");
  let index: Record<string, unknown> = {};
  if (existsSync(indexFile)) {
    try {
      index = JSON.parse(await readFile(indexFile, "utf8")) as Record<string, unknown>;
    } catch {
      index = {}; // 坏了就重写一份（这里只是索引，内容在 <id>.json 里）
    }
  }
  index[recipe.id] = { path, commit, parserVersion: PARSER_VERSION, baselineHash, at: today() };
  await writeAtomic(indexFile, `${JSON.stringify(index, null, 2)}\n`);
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

  const commit = await resolveUpstreamCommit(options.source);
  const index = await buildUpstreamIndex(options.source);
  console.log(
    `${options.apply ? "" : "[dry-run] "}上游克隆 ${options.source}\n  commit ${commit}，` +
      `索引 ${index.size} 个菜名；数据目录 ${options.dataDir}`
  );

  const equipment = await loadEquipmentList(options.dataDir);
  const tagVocabulary = await loadTagVocabulary(options.dataDir);
  const { recipes, failures } = await loadRecipesFromDir(
    join(options.dataDir, "recipes"),
    equipment.tools,
    tagVocabulary.names
  );
  const schema = createRecipeSchema({ allowedTools: equipment.tools, allowedTags: tagVocabulary.names });

  const verified: string[] = [];
  const matched: string[] = [];
  const ambiguous: string[] = [];
  const missing: string[] = [];
  const failed: string[] = [];
  let already = 0;
  let manual = 0;
  let written = 0;

  for (const recipe of recipes) {
    if (!(recipe.source ?? "").startsWith(IMPORTED_SOURCE_PREFIX)) {
      manual += 1; // 手工菜：没有上游
      continue;
    }
    if (recipe.sourceRef) {
      already += 1; // 幂等：已经有来源信息的跳过
      continue;
    }
    if (options.only && recipe.id !== options.only) continue;
    if (options.limit !== null && verified.length + matched.length >= options.limit) break;

    const match = matchUpstream(recipe.id, index);
    if (match.status === "missing") {
      missing.push(recipe.id);
      continue;
    }
    if (match.status === "ambiguous") {
      ambiguous.push(`${recipe.id} → ${match.paths.join("  /  ")}`);
      continue;
    }

    const markdown = await readUpstreamFile(options.source, match.path);
    const parsed = parseUpstreamRecipe(markdown, match.path, recipe.id);
    if (!parsed.dish) {
      failed.push(`${recipe.id}: 上游解析失败（${parsed.issues.join("；")}）`);
      continue;
    }

    const upstream = parsed.dish;
    const same = sameContent(upstream, recipe);
    const baselineHash = semanticHash(recipe);
    const sourceRef: RecipeSourceRef = same
      ? {
          repo: UPSTREAM_REPO,
          path: match.path,
          commit,
          baselineStatus: "verified",
          baselineHash,
          parserVersion: PARSER_VERSION,
          lastSyncedAt: today()
        }
      : { repo: UPSTREAM_REPO, path: match.path, baselineStatus: "matched" };

    if (same) verified.push(recipe.id);
    else matched.push(`${recipe.id} → ${match.path}`);

    if (!options.apply) continue;

    const next: Recipe = { ...recipe, sourceRef };
    const valid = schema.safeParse(next);
    if (!valid.success) {
      failed.push(`${recipe.id}: 写入前校验失败 ${formatIssues(valid.error)}`);
      continue;
    }

    await writeAtomic(
      join(options.dataDir, "recipes", `${recipe.id}.json`),
      serializeRecipe(next)
    );
    if (same) await writeBaseline(options.dataDir, recipe, match.path, commit, baselineHash);
    written += 1;
  }

  console.log(
    `\n回填结果：\n` +
      `  基线已验证 verified：${verified.length}\n` +
      `  只匹配到来源 matched ：${matched.length}\n` +
      `  匹配不唯一（待你决定）：${ambiguous.length}\n` +
      `  找不到上游文件（待你决定）：${missing.length}\n` +
      `  已有 sourceRef（跳过）：${already}，手工菜（跳过）：${manual}\n` +
      `  处理失败：${failed.length}` +
      (options.apply ? `，已写盘：${written}` : "（dry-run：**没有写任何文件**）")
  );

  for (const [label, list] of [
    ["匹配不唯一（不猜）", ambiguous],
    ["找不到上游文件", missing],
    ["处理失败", failed]
  ] as const) {
    if (list.length === 0) continue;
    console.log(`\n${label}（前 20 条）：`);
    for (const item of list.slice(0, 20)) console.log(`  - ${item}`);
    if (list.length > 20) console.log(`  ……还有 ${list.length - 20} 条`);
  }

  if (matched.length > 0) {
    console.log(
      `\n说明：${matched.length} 道只能标 matched（内容与上游对不上，可能你改过、也可能只是我们的解析口径不同）——` +
        `它们**不会被自动覆盖**，将来上游更新时会先报告、需要人工建立基线。`
    );
    console.log(`（前 5 条：${matched.slice(0, 5).join("，")}）`);
  }

  if (failures.length > 0) console.error(`\n载入菜谱时有 ${failures.length} 个文件失败（见 npm run check:data）`);
  if (!options.apply) console.log("\n这是 dry-run。确认无误后加 --apply 才会写盘。");
}

await main();
