import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { mapCategory, parseHowToCookMarkdown } from "../../src/server/lib/howtocook-parse.js";
import { formatIssueList, recipeSchema } from "../../src/server/lib/schema.js";
import type { Recipe } from "../../src/shared/types.js";
import { toRecipeId } from "./recipe-id.js";

/**
 * HowToCook 上游仓库的读取约定（导入器与回填/同步脚本共用，**必须是同一套规则**）。
 *
 * 这里只放"怎么找文件、怎么变成 recipeId"，不碰 `data/`。
 */

const execFileAsync = promisify(execFile);

export const UPSTREAM_REPO = "https://github.com/Anduin2017/HowToCook";
export const SOURCE_LABEL = `HowToCook（Unlicense 公有领域）· ${UPSTREAM_REPO}`;
/** 判断一条已有菜谱是不是本导入器写的（用于幂等重跑 vs 保护自建菜谱） */
export const IMPORTED_SOURCE_PREFIX = "HowToCook";

/** 递归列出 `dishes/**\/*.md`（来源仓库有 `分类/菜名.md` 与 `分类/菜名/菜名.md` 两种层级） */
export async function listDishFiles(sourceDir: string): Promise<string[]> {
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
 * 上游索引：`recipeId`（= 菜名拼音）→ 候选文件路径（相对仓库根）。
 *
 * 同一个 id 可能对应多个文件（不同分类下的重名菜）——那时**不猜**，
 * 由调用方列为"待决定"。
 */
export async function buildUpstreamIndex(sourceDir: string): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>();

  for (const file of await listDishFiles(sourceDir)) {
    const markdown = await readFileText(file);
    const categoryDir = relative(join(sourceDir, "dishes"), file).split("/")[0];
    const outcome = parseHowToCookMarkdown(markdown, {
      category: mapCategory(categoryDir),
      source: SOURCE_LABEL
    });
    if (!outcome.dish) continue;

    const id = toRecipeId(outcome.dish.name);
    const relativePath = relative(sourceDir, file);
    const existing = index.get(id);
    if (existing) existing.push(relativePath);
    else index.set(id, [relativePath]);
  }

  return index;
}

export type UpstreamMatch =
  | { status: "unique"; path: string }
  | { status: "ambiguous"; paths: string[] }
  | { status: "missing" };

/**
 * 把我们的菜谱 id 对到上游文件。
 *
 * 同批次重名时导入器会给后来者加 `-2`/`-3` 后缀，所以先直接查，再把后缀剥掉重试；
 * 候选不唯一一律 `ambiguous`（**不猜**）。
 */
export function matchUpstream(recipeId: string, index: Map<string, string[]>): UpstreamMatch {
  const direct = index.get(recipeId);
  if (direct && direct.length === 1) return { status: "unique", path: direct[0] };
  if (direct && direct.length > 1) return { status: "ambiguous", paths: direct };

  const stripped = recipeId.replace(/-\d+$/, "");
  const candidates = index.get(stripped);
  if (candidates && candidates.length === 1) return { status: "unique", path: candidates[0] };
  if (candidates && candidates.length > 1) return { status: "ambiguous", paths: candidates };

  return { status: "missing" };
}

/** 上游克隆当前的 commit（短 sha）。取不到就抛错——**不猜** */
export async function resolveUpstreamCommit(sourceDir: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: sourceDir
  });
  return stdout.trim();
}

/** 读上游某个文件（路径必须在下游给出的索引里，避免到处拼路径） */
export async function readUpstreamFile(
  sourceDir: string,
  relativePath: string
): Promise<string> {
  return readFileText(join(sourceDir, relativePath));
}

/** 从上游 markdown 解析出菜谱（与导入器同一套参数），并过一遍结构校验 */
export function parseUpstreamRecipe(
  markdown: string,
  relativePath: string,
  id: string
): { dish: Recipe | null; issues: string[] } {
  const categoryDir = relativePath.split("/")[1] ?? "";
  const outcome = parseHowToCookMarkdown(markdown, {
    category: mapCategory(categoryDir),
    source: SOURCE_LABEL
  });
  if (!outcome.dish) return { dish: null, issues: outcome.issues };

  // 结构校验用**同一份** schema（这里不带词表：词表相关的校验由导入器/回填脚本自己做）——
  // 这样返回的就是 `Recipe`，调用方不需要类型断言
  const parsed = recipeSchema.safeParse({ id, ...outcome.dish });
  if (!parsed.success) return { dish: null, issues: formatIssueList(parsed.error) };

  return { dish: parsed.data, issues: outcome.issues };
}

async function readFileText(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
}
