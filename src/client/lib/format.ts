import type { Difficulty, Ingredient } from "../../shared/types";

export function difficultyText(difficulty: Difficulty): string {
  if (difficulty === 1) return "简单";
  if (difficulty === 2) return "适中";
  return "有点挑战";
}

export function difficultyStars(difficulty: Difficulty): string {
  return "●".repeat(difficulty) + "○".repeat(3 - difficulty);
}

export function minutesText(prep?: number, cook?: number): string | null {
  const total = (prep ?? 0) + (cook ?? 0);
  if (total <= 0) return null;

  const detail: string[] = [];
  if (prep) detail.push(`备料 ${prep}`);
  if (cook) detail.push(`烹饪 ${cook}`);

  return `${total} 分钟（${detail.join(" + ")}）`;
}

/**
 * 食材用量的**唯一权威**显示函数。
 *
 * 只做"原样显示"，**不做任何换算**：`servings` 是这份菜谱写明的家庭基准
 * （两人份 = 一男一女的实际量），不是缩放系数。见 CB-001 §3.2。
 */
export function amountText(amount: number | string | undefined, unit?: string): string {
  const suffix = unit ?? "";

  if (amount === undefined) {
    return unit ? `— ${suffix}` : "适量";
  }

  return `${amount}${suffix}`;
}

/** 便捷包装：直接对食材对象取显示文本 */
export function ingredientAmountText(ingredient: Ingredient): string {
  return amountText(ingredient.amount, ingredient.unit);
}
