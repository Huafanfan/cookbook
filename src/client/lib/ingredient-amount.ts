import type { Ingredient } from "../../shared/types";

/** 用量按菜谱原文显示；不推断或换算人数。 */
export function ingredientAmountText(ingredient: Ingredient): string {
  if (ingredient.amount === undefined) {
    return ingredient.unit ? `— ${ingredient.unit}` : "适量";
  }
  return `${ingredient.amount}${ingredient.unit ?? ""}`;
}
