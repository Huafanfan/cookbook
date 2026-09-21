import type { Recipe } from "../../src/shared/types.js";
import { canonicalRecipe } from "../../src/server/lib/recipe-canonical.js";

/**
 * 三方比较与**机械**合并（CB-010，不调 LLM 的部分）。
 *
 * 三个输入：`baseline`（上次同步/导入时的样子）、`upstream`（上游新版）、`local`（现在本地）。
 * 只在**内容核心**（`recipe-canonical.ts` 的投影）上比较；`tags`/`equipment`/`source`/
 * `sourceRef`/时间戳**一律保留本地**（字段所有权见 ADR-0006 §2b）。
 *
 * 数组（`ingredients`/`steps`/`tips`/`aliases`）按**整体**处理：两边都动了就**不自动合并**，
 * 记为冲突交给人工（LLM 只出提案）—— 复核明确要求"不按下标硬套"。
 */

export type SyncBucket = "unchanged" | "upstream-only" | "local-only" | "both";

export interface ThreeWay {
  baseline: Recipe;
  upstream: Recipe;
  local: Recipe;
}

export interface FieldChange {
  /** 字段路径，如 `ingredients` / `steps` / `name` */
  path: string;
  before: unknown;
  after: unknown;
}

export interface Conflict extends FieldChange {
  /** 三方各自的值（给人和 LLM 看） */
  baseline: unknown;
  upstream: unknown;
  local: unknown;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** 分类：谁改了（用于决定"跳过 / 直接更新 / 保留本地 / 需要合并"） */
export function classifyChange({ baseline, upstream, local }: ThreeWay): SyncBucket {
  const fromBaseline = (recipe: Recipe): Record<string, unknown> => canonicalRecipe(recipe);
  const base = fromBaseline(baseline);
  const up = fromBaseline(upstream);
  const lo = fromBaseline(local);

  const upstreamChanged = !same(base, up);
  const localChanged = !same(base, lo);

  if (!upstreamChanged && !localChanged) return "unchanged";
  if (upstreamChanged && !localChanged) return "upstream-only";
  if (!upstreamChanged && localChanged) return "local-only";
  return "both";
}

/** 逐字段差异（基线 vs 某一侧） */
export function diffFields(baseline: Recipe, other: Recipe): FieldChange[] {
  const base = canonicalRecipe(baseline);
  const next = canonicalRecipe(other);
  const changes: FieldChange[] = [];

  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (same(base[key], next[key])) continue;
    changes.push({ path: key, before: base[key], after: next[key] });
  }

  return changes;
}

/**
 * 机械合并：能确定的字段直接合，两边都改的字段记为**冲突**（保留本地值）。
 *
 * @returns 合并后的菜谱（以本地为底，保留本地拥有的字段）与未解决的冲突
 */
export function mergeFields({ baseline, upstream, local }: ThreeWay): {
  recipe: Recipe;
  conflicts: Conflict[];
  changes: string[];
} {
  const base = canonicalRecipe(baseline);
  const up = canonicalRecipe(upstream);
  const lo = canonicalRecipe(local);
  /** 内容核心的覆盖项（以本地为底，保住 tags/厨具/来源/时间戳等本地拥有的字段） */
  const overrides: Record<string, unknown> = {};
  const conflicts: Conflict[] = [];
  const changes: string[] = [];

  for (const key of new Set([...Object.keys(base), ...Object.keys(lo), ...Object.keys(up)])) {
    const b = base[key];
    const u = up[key];
    const l = lo[key];

    if (same(u, l)) continue; // 两边一样 → 不动
    if (same(b, l)) {
      // 只有上游改 → 采用上游
      overrides[key] = u;
      changes.push(`采用上游的 ${key}`);
      continue;
    }
    if (same(b, u)) continue; // 只有本地改 → 保留本地
    // 两边都改且结果不同 → 冲突
    conflicts.push({
      path: key,
      before: b,
      after: u,
      baseline: b,
      upstream: u,
      local: l
    });
  }

  // `overrides` 的键都来自 `canonicalRecipe` 的投影（即 `Recipe` 自己的字段），
  // 值又直接取自上游菜谱同一字段 → 展开到本地这份上仍是合法的 `Recipe`
  return { recipe: { ...local, ...overrides }, conflicts, changes };
}

/**
 * "两边都没有、只出现在提案里"的内容（复核要求的人审清单）。
 *
 * 只做**值级**启发：把提案里的字符串/数字叶子摊平，凡是三方都没有过的值就列出来
 * —— 这是"不得新增事实"能被自动查的那一半；语义判断仍然靠人。
 */
export function unexpectedValues(proposal: Recipe, ...sources: Recipe[]): string[] {
  const collect = (recipe: Recipe): Set<string> => {
    const values = new Set<string>();
    const walk = (node: unknown): void => {
      if (typeof node === "string") {
        if (node.trim()) values.add(node.trim());
        return;
      }
      if (typeof node === "number") {
        values.add(String(node));
        return;
      }
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (node && typeof node === "object") {
        for (const value of Object.values(node as Record<string, unknown>)) walk(value);
      }
    };
    walk(canonicalRecipe(recipe));
    return values;
  };

  const known = new Set<string>();
  for (const source of sources) for (const value of collect(source)) known.add(value);

  return [...collect(proposal)].filter((value) => !known.has(value)).sort();
}

/** 合并后的内容里，数组字段是否被改动过（用于提示"步骤/食材动过"） */
export function changedArrayFields(baseline: Recipe, other: Recipe): string[] {
  const arrays = ["ingredients", "steps", "tips", "aliases"];
  return diffFields(baseline, other)
    .filter((change) => arrays.includes(change.path))
    .map((change) => change.path);
}
