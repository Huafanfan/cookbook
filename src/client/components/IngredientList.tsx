import type { Ingredient } from "../../shared/types";
import { ingredientAmountText } from "../lib/ingredient-amount";

// 按做菜顺序排列：先主料，再腌料，最后调味
const GROUP_ORDER = ["主料", "腌料", "调料", "汤底"];

interface IngredientListProps {
  ingredients: Ingredient[];
  /** 菜谱写明的原始份量；不做换算 */
  servings: number;
}

function groupIngredients(ingredients: Ingredient[]): [string, Ingredient[]][] {
  const groups = new Map<string, Ingredient[]>();

  for (const ingredient of ingredients) {
    const group = ingredient.group ?? "主料";
    const bucket = groups.get(group);
    if (bucket) bucket.push(ingredient);
    else groups.set(group, [ingredient]);
  }

  return [...groups.entries()].sort((a, b) => {
    const indexA = GROUP_ORDER.indexOf(a[0]);
    const indexB = GROUP_ORDER.indexOf(b[0]);
    return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
  });
}

export function IngredientList({
  ingredients,
  servings
}: IngredientListProps): React.JSX.Element {
  return (
    <section className="section" aria-labelledby="ingredients-title">
      <h2 className="section-title" id="ingredients-title">
        食材
        <span className="section-note">{servings} 人份</span>
      </h2>

      {groupIngredients(ingredients).map(([group, items]) => (
        <div className="ingredient-group" key={group}>
          <h3 className="ingredient-group-title">{group}</h3>
          <ul className="ingredient-list">
            {items.map((ingredient) => (
              <li className="ingredient-item" key={`${group}-${ingredient.name}`}>
                <span className="ingredient-name">{ingredient.name}</span>
                <span className="ingredient-amount">{ingredientAmountText(ingredient)}</span>
                {ingredient.note && <span className="ingredient-note">{ingredient.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
