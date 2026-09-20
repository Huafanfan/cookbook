import type { Ingredient } from "../../shared/types";
import { ingredientAmountText, scaleFactor, servingOptions } from "../lib/scale";

// 按做菜顺序排列：先主料，再腌料，最后调味
const GROUP_ORDER = ["主料", "腌料", "调料", "汤底"];

interface IngredientListProps {
  ingredients: Ingredient[];
  /** 菜谱写明的基准份量（缩放以此为起点） */
  baseServings: number;
  /** 当前选中的人数 */
  servings: number;
  onServingsChange: (servings: number) => void;
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
  baseServings,
  servings,
  onServingsChange
}: IngredientListProps): React.JSX.Element {
  const factor = scaleFactor(servings, baseServings);

  return (
    <section className="section" aria-labelledby="ingredients-title">
      <h2 className="section-title" id="ingredients-title">
        食材
        <span className="section-note">
          {servingOptions(baseServings).map((option) => (
            <button
              key={option}
              type="button"
              className={`chip chip-small${option === servings ? " chip-active" : ""}`}
              aria-pressed={option === servings}
              onClick={() => onServingsChange(option)}
            >
              {option} 人
            </button>
          ))}
        </span>
      </h2>

      {groupIngredients(ingredients).map(([group, items]) => (
        <div className="ingredient-group" key={group}>
          <h3 className="ingredient-group-title">{group}</h3>
          {/* key 让份量变化时重新挂载，触发一次高亮提示"用量变了" */}
          <ul className="ingredient-list" data-scaled={factor === 1 ? "false" : "true"} key={servings}>
            {items.map((ingredient) => (
              <li className="ingredient-item" key={`${group}-${ingredient.name}`}>
                <span className="ingredient-name">{ingredient.name}</span>
                <span className="ingredient-amount">{ingredientAmountText(ingredient, factor).text}</span>
                {ingredient.note && <span className="ingredient-note">{ingredient.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
