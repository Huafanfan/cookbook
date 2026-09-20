import type { Difficulty } from "../../shared/types";

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
