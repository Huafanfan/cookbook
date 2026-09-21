import { createHash } from "node:crypto";

import type { Recipe } from "../../shared/types.js";

/**
 * 菜谱的**语义投影**与语义哈希（CB-010）。
 *
 * 用途：三方比较（基线 / 上游新 / 本地）时判断"到底改了什么"。
 * 与并发控制用的 `revision`（文件**字节**哈希）是两件事，不能混用。
 *
 * 投影只保留**内容核心**，排除下面这些**本地拥有**的字段：
 *
 * | 排除的字段 | 为什么 |
 * | --- | --- |
 * | `tags` / `equipment` / `equipmentAlternatives` | CB-002/CB-006 由我们补的（上游没有）；用户也在网页上改它们 → 不该参与"上游 vs 本地"的合并 |
 * | `source` | 我们写的人类可读出处说明（上游没有这个字段） |
 * | `sourceRef` | 应用维护的来源信息 |
 * | `createdAt` / `updatedAt` | 应用维护的时间戳 |
 *
 * 意义：导入后我们补过 tag/厨具的菜谱，**不会**被误判成"用户改过"，
 * 否则下次上游一更新，369 道菜全都会掉进"两边都改"那一档、全都要走 LLM。
 *
 * 数组（食材/步骤）**顺序有意义**（那就是做法顺序），所以不做排序；只对字符串去空白、丢掉空项。
 */

/** 解析器/归一化器版本：口径升级后，旧基线能被识别出来（`baseline-drift`） */
export const PARSER_VERSION = "howtocook-parse@1";

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** 去掉 `undefined` / `null` / 空字符串的键，保证投影稳定（同样内容 → 同样 JSON） */
function compact(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    output[key] = value;
  }
  return output;
}

export function canonicalRecipe(recipe: Recipe): Record<string, unknown> {
  const ingredients = recipe.ingredients.map((item) =>
    compact({
      name: text(item.name),
      amount: typeof item.amount === "number" ? item.amount : text(item.amount),
      unit: text(item.unit),
      group: text(item.group),
      note: text(item.note)
    })
  );

  const steps = recipe.steps.map((item) =>
    compact({
      text: text(item.text),
      title: text(item.title),
      minutes: number(item.minutes),
      heat: text(item.heat),
      tip: text(item.tip)
    })
  );

  const aliases = (recipe.aliases ?? []).map((alias) => text(alias)).filter(Boolean);
  const tips = (recipe.tips ?? []).map((tip) => text(tip)).filter(Boolean);

  return compact({
    id: text(recipe.id),
    name: text(recipe.name),
    category: text(recipe.category),
    difficulty: number(recipe.difficulty),
    servings: number(recipe.servings),
    prepMinutes: number(recipe.prepMinutes),
    cookMinutes: number(recipe.cookMinutes),
    aliases,
    summary: text(recipe.summary),
    ingredients,
    steps,
    tips
  });
}

/** 语义哈希：`sha256:<hex>`（canonical 投影的稳定 JSON） */
export function semanticHash(recipe: Recipe): string {
  const json = JSON.stringify(canonicalRecipe(recipe));
  return `sha256:${createHash("sha256").update(json).digest("hex")}`;
}

/** 两道菜的内容核心是否相同（判断"上游改没改 / 本地改没改"） */
export function sameContent(a: Recipe, b: Recipe): boolean {
  return JSON.stringify(canonicalRecipe(a)) === JSON.stringify(canonicalRecipe(b));
}
