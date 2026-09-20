import type { Ingredient } from "../../shared/types";

/**
 * 份量缩放。
 *
 * 口径由用户给定（2026-09-20）：**多一个人，多 0.5 倍**
 *
 * | 人数 | 2（基准） | 3    | 4    | 5    |
 * | ---- | --------- | ---- | ---- | ---- |
 * | 倍数 | 1.0×      | 1.5× | 2.0× | 2.5× |
 *
 * 这里是"份量怎么算、用量怎么显示"的**唯一权威实现**（见 docs/features/CB-004-serving-scale.md）。
 */

/** 每多一个人增加的倍数 */
export const SCALE_STEP = 0.5;

/** 人数档位：以这道菜自己的基准份量为起点向上排（基准 2 → 2/3/4/5） */
export function servingOptions(base: number): number[] {
  const start = Math.max(1, Math.round(base));
  return [start, start + 1, start + 2, start + 3];
}

/** 缩放倍数；目标不高于基准时返回 1（界面不提供缩小档） */
export function scaleFactor(target: number, base: number): number {
  if (!Number.isFinite(target) || !Number.isFinite(base) || base <= 0) return 1;
  if (target <= base) return 1;
  return 1 + (target - base) * SCALE_STEP;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * 缩放后的用量格式化：数字要"像人写的"。
 *
 * | 范围 | 规则 | 例 |
 * | --- | --- | --- |
 * | ≥ 100 | 取整到 10 | `200 × 1.5 = 300` |
 * | 2 – 100 | 取整 | `3 × 1.5 = 4.5` → `5` |
 * | 1 – 2 | 保留 1 位小数 | `1.5` |
 * | < 1 | 保留 2 位小数 | `0.75` |
 */
export function formatScaledAmount(value: number): string {
  if (!Number.isFinite(value)) return "—";

  if (value >= 100) return String(roundTo(value, 10));
  if (value >= 2) return String(roundTo(value, 1));

  const text = value >= 1 ? value.toFixed(1) : value.toFixed(2);
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/** 原文里的中文数字用量（"一根"的"一"） */
const CHINESE_NUMERALS: Record<string, number> = {
  一: 1,
  两: 2,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  半: 0.5
};

/** 范围写法：`10-15`、`10 - 15`、`10~15`、`10至15` */
const RANGE_SEPARATOR = /\s*[-–—~至到]\s*/;

function parseAmountToken(token: string): number | null {
  const text = token.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number.parseFloat(text);
  return CHINESE_NUMERALS[text] ?? null;
}

export interface AmountDisplay {
  text: string;
  /** 是否为缩放后的结果（界面据此给一次高亮，提示"用量变了"） */
  scaled: boolean;
}

/** 组合"数值 + 单位"；无单位时不加空格（与原文一致：`2个`、`300g`） */
function join(amount: string, unit: string | undefined): string {
  return `${amount}${unit ?? ""}`;
}

/**
 * 用量显示。
 *
 * - `factor === 1`（基准份量）时，**输出与原文完全一致**（连中文数字也不转换）。
 * - 无用量（"适量"）永远不动。
 * - 范围两端同比缩放（不会只缩放一端）。
 * - 中文数字在需要缩放时转成阿拉伯数字（`一根 × 1.5 = 1.5根`）。
 */
export function amountText(
  amount: number | string | undefined,
  unit: string | undefined,
  factor = 1
): AmountDisplay {
  if (amount === undefined) {
    return { text: unit ? `— ${unit}` : "适量", scaled: false };
  }

  if (factor === 1) {
    return { text: join(String(amount), unit), scaled: false };
  }

  if (typeof amount === "number") {
    return { text: join(formatScaledAmount(amount * factor), unit), scaled: true };
  }

  const parts = amount.split(RANGE_SEPARATOR);
  const scaled = parts.map((part) => {
    const value = parseAmountToken(part);
    return value === null ? part : formatScaledAmount(value * factor);
  });

  return { text: join(scaled.join("-"), unit), scaled: true };
}

/** 便捷包装：直接对食材对象做缩放 */
export function ingredientAmountText(ingredient: Ingredient, factor = 1): AmountDisplay {
  return amountText(ingredient.amount, ingredient.unit, factor);
}

/** 界面提示文案：非基准份量时提醒"步骤里的用量按基准写" */
export function servingNotice(base: number, current: number): string | null {
  if (current <= base) return null;
  return `步骤里的用量按 ${base} 人份写，当前显示 ${current} 人份 —— 请按上面的食材表取量`;
}
