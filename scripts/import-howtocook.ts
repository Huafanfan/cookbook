/**
 * 从 HowToCook（Anduin2017/HowToCook，Unlicense 公有领域）导入菜谱。
 *
 * 用法：
 *   npx tsx scripts/import-howtocook.ts --source /tmp/howto --limit 5 --dry-run
 *   npx tsx scripts/import-howtocook.ts --source /tmp/howto
 *
 * 这是**构建/导入工具**，不是应用运行时：按架构约定，文件系统访问只允许出现在
 * 应用的四处方与 scripts/ 下的工具脚本里（见 docs/ARCHITECTURE.md）。
 *
 * 设计原则见 docs/features/CB-003-howtocook-import.md：忠实原文、不猜、可重跑。
 */
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { pinyin } from "pinyin-pro";

import { parseHowToCookMarkdown, mapCategory } from "../src/server/lib/howtocook-parse.js";
import { formatContentIssues, lintRecipeContent } from "../src/server/lib/content-lint.js";
import { createRecipeSchema, formatIssues } from "../src/server/lib/schema.js";
import { loadEquipmentList } from "../src/server/lib/equipment.js";

const PROJECT_ROOT = new URL("..", import.meta.url).pathname;
const DATA_DIR = join(PROJECT_ROOT, "data");
const RECIPES_DIR = join(DATA_DIR, "recipes");
const IMAGES_DIR = join(DATA_DIR, "images");
const SOURCE_LABEL = "HowToCook（Unlicense 公有领域）· https://github.com/Anduin2017/HowToCook";
/** 判断一条已有菜谱是不是本导入器上次写的（用于幂等重跑 vs 保护自建菜谱） */
const IMPORTED_SOURCE_PREFIX = "HowToCook";

interface Options {
  source: string;
  limit: number | null;
  dryRun: boolean;
  withImages: boolean;
  /** 显式覆盖已存在的菜谱（默认**拒绝**：网页上的修改不能被导入悄悄吃掉，CB-009 / ADR-0005 §7） */
  overwriteExisting: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    source: "",
    limit: null,
    dryRun: false,
    withImages: true,
    overwriteExisting: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") options.source = argv[++index] ?? "";
    else if (arg === "--limit") options.limit = Number.parseInt(argv[++index] ?? "", 10);
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--no-images") options.withImages = false;
    else if (arg === "--overwrite-existing") options.overwriteExisting = true;
  }

  return options;
}

/** 菜名 → 拼音 id（只用小写字母、数字和连字符，与 schema 约束一致） */
export function toRecipeId(name: string): string {
  const parts = pinyin(name, { toneType: "none", type: "array" }) as string[];
  const slug = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "dish";
}

/**
 * 递归列出菜谱文件。
 *
 * 注意：来源仓库有**两种目录层级** —— `分类/菜名.md`（171 个）与 `分类/菜名/菜名.md`（201 个），
 * 所以必须递归而不能假定固定深度。
 */
async function listDishFiles(sourceDir: string): Promise<string[]> {
  const dishesDir = join(sourceDir, "dishes");
  const files: string[] = [];

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "template") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".md")) files.push(path);
    }
  }

  await walk(dishesDir);
  return files.sort((a, b) => a.localeCompare(b, "zh"));
}

/**
 * 找成品图。
 *
 * 优先用 markdown 里引用的那张；仓库里还有大量图片**没有写进 markdown**，
 * 但按约定以「菜名.jpg / 菜名.png」放在菜品同目录下 —— 这种也认。
 */
async function findCoverImage(
  markdownFile: string,
  referenced: string | null,
  dishName: string
): Promise<string | null> {
  const directory = dirname(markdownFile);

  if (referenced) {
    const candidate = join(directory, referenced.replace(/^\.\//, ""));
    const exists = await stat(candidate).catch(() => null);
    if (exists?.isFile()) return candidate;
  }

  const entries = await readdir(directory).catch(() => [] as string[]);
  const wanted = [dishName, basename(markdownFile, ".md")];

  for (const name of wanted) {
    for (const extension of [".jpg", ".jpeg", ".png", ".webp", ".JPG"]) {
      if (entries.includes(`${name}${extension}`)) return join(directory, `${name}${extension}`);
    }
  }

  // 目录里只有一张图 → 用它（多于一张通常是 1.jpeg/2.jpeg 这类步骤图，不猜）
  const imageFiles = entries.filter((name) => /\.(jpe?g|png|webp)$/i.test(name));
  if (imageFiles.length === 1) return join(directory, imageFiles[0]);

  return null;
}

/**
 * 读取已有菜谱的 id → source。
 *
 * **自建菜谱优先**：导入前必须先知道哪些 id 已被占用，
 * 否则 371 道菜里与自建菜谱同名的（如"西红柿炒鸡蛋"拼音 id 完全相同）
 * 会**静默覆盖用户自己的菜谱** —— 首次全量导入时正是这样丢了 2 道自建菜谱。
 */
async function loadExistingRecipes(): Promise<Map<string, string | undefined>> {
  const existing = new Map<string, string | undefined>();
  const entries = await readdir(RECIPES_DIR).catch(() => [] as string[]);

  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const raw = await readFile(join(RECIPES_DIR, name), "utf8").catch(() => null);
    if (raw === null) continue;
    try {
      const parsed = JSON.parse(raw) as { id?: string; source?: string };
      if (parsed.id) existing.set(parsed.id, parsed.source);
    } catch {
      // 坏文件交给 check:data 报告，这里跳过
    }
  }

  return existing;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.source) {
    console.error("必须指定 --source <HowToCook 仓库目录>");
    process.exit(1);
  }

  const sourceStat = await stat(options.source).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    console.error(`--source 不是目录：${options.source}`);
    process.exit(1);
  }

  const equipment = await loadEquipmentList(DATA_DIR);
  const schema = createRecipeSchema({ allowedTools: equipment.tools });

  const files = await listDishFiles(options.source);
  const targets = options.limit ? files.slice(0, options.limit) : files;

  console.log(
    `${options.dryRun ? "[dry-run] " : ""}来源共 ${files.length} 个菜谱文件，本次处理 ${targets.length} 个`
  );

  const existingRecipes = await loadExistingRecipes();
  const usedIds = new Set<string>();
  const failures: string[] = [];
  const skipped: string[] = [];
  /** 已存在、按默认策略**没覆盖**的（CB-009 之后已有菜谱可能有网页修改） */
  const skippedExisting: string[] = [];
  const warnings: string[] = [];
  let imported = 0;
  let images = 0;

  if (options.overwriteExisting && !options.dryRun) {
    console.log("⚠️  --overwrite-existing：已存在的菜谱会被**覆盖**（包括你在网页上改过的内容）。");
    console.log("    建议先停服务（docker stop cookbook 或停掉 npm run dev），避免与编辑中的会话打架。");
    console.log("    更好的办法：等 CB-010 的「先比较、后合并」流程落地后再批量同步。");
  }

  if (!options.dryRun) await mkdir(RECIPES_DIR, { recursive: true });

  for (const file of targets) {
    const markdown = await readFile(file, "utf8");
    const categoryDir = relative(join(options.source, "dishes"), file).split("/")[0];
    const outcome = parseHowToCookMarkdown(markdown, {
      category: mapCategory(categoryDir),
      source: SOURCE_LABEL
    });

    if (!outcome.dish) {
      failures.push(`${relative(options.source, file)}: ${outcome.issues.join("；")}`);
      continue;
    }

    // id：拼音
    const base = toRecipeId(outcome.dish.name);

    // 自建菜谱优先：id 被非导入来源占用时**跳过**，绝不覆盖
    const existingSource = existingRecipes.get(base);
    if (existingSource !== undefined && !existingSource?.startsWith(IMPORTED_SOURCE_PREFIX)) {
      skipped.push(`${base}（${outcome.dish.name}）：已有自建菜谱占用了这个 id，保留自建版本`);
      continue;
    }

    // 同一批导入里的重名 → 追加序号；上次导入的 → 直接覆盖（幂等重跑）
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) id = `${base}-${suffix++}`;
    usedIds.add(id);

    const recipe = { id, ...outcome.dish };
    const parsed = schema.safeParse(recipe);
    if (!parsed.success) {
      failures.push(`${relative(options.source, file)}: ${formatIssues(parsed.error)}`);
      continue;
    }

    // 内容检查：错误级问题不进库（警告照收，例如时间段没有计时）
    const issues = lintRecipeContent(recipe);
    const blocking = issues.filter((issue) => issue.severity === "error");
    if (blocking.length > 0) {
      failures.push(`${relative(options.source, file)}: ${formatContentIssues(id, blocking).join("；")}`);
      continue;
    }
    warnings.push(...formatContentIssues(id, issues.filter((issue) => issue.severity === "warning")));

    // 已存在 → **默认不覆盖**（CB-009：那道菜可能已经在网页上改过了）
    const target = join(RECIPES_DIR, `${id}.json`);
    const targetExists = (await stat(target).catch(() => null)) !== null;
    if (targetExists && !options.overwriteExisting) {
      skippedExisting.push(`${id}（${recipe.name}）`);
      continue;
    }

    if (options.dryRun) {
      console.log(`\n--- ${id} ${recipe.name}（${recipe.category}）---`);
      console.log(JSON.stringify(recipe, null, 2).slice(0, 1200));
      imported += 1;
      continue;
    }

    await writeFile(join(RECIPES_DIR, `${id}.json`), `${JSON.stringify(recipe, null, 2)}\n`, "utf8");
    imported += 1;

    // 成品图：按 data/images/<id>/cover.jpg 落盘（界面展示属 M4）
    if (options.withImages) {
      const from = await findCoverImage(file, outcome.imagePath, recipe.name);
      if (from) {
        await mkdir(join(IMAGES_DIR, id), { recursive: true });
        await copyFile(from, join(IMAGES_DIR, id, "cover.jpg"));
        images += 1;
      }
    }
  }

  console.log(
    `\n导入完成：成功 ${imported}，失败 ${failures.length}，跳过（保留自建菜谱）${skipped.length}，` +
      `跳过（已存在，未覆盖）${skippedExisting.length}，成品图 ${images} 张`
  );
  for (const item of skipped) console.log(`  ⏭ ${item}`);
  if (skippedExisting.length > 0) {
    console.log(`已存在而没有覆盖的（前 5 个）：${skippedExisting.slice(0, 5).join("、")}`);
    console.log(
      "  默认不覆盖是为了不弄丢你在网页上的修改；确实要覆盖就加 --overwrite-existing（先停服）。"
    );
  }
  if (warnings.length > 0) {
    console.log(`内容警告 ${warnings.length} 条（不阻止）：`);
    for (const warning of warnings.slice(0, 8)) console.log(`  ${warning}`);
    if (warnings.length > 8) console.log(`  ……还有 ${warnings.length - 8} 条`);
  }
  if (failures.length > 0) {
    console.error("失败明细：");
    for (const failure of failures.slice(0, 20)) console.error(`  ✗ ${failure}`);
    if (failures.length > 20) console.error(`  ……还有 ${failures.length - 20} 条`);
  }
}

await main();
