import type { RecipeSummary } from "../../shared/types";
import { difficultyStars, difficultyText } from "../lib/format";
import { Highlight } from "../lib/highlight";
import { checkEquipment, kitchenVerdict, shortEquipmentLabel } from "../lib/kitchen";
import { navigate } from "../lib/router";
import { STORAGE_KEYS, writeStored } from "../lib/storage";

interface RecipeCardProps {
  recipe: RecipeSummary;
  keyword?: string;
  /** 我有的厨具；用于标记"缺厨具 / 可用替代" */
  myTools: string[];
  /** 厨具词表是否已载入；未载入时不给标记（避免假结论） */
  catalogReady: boolean;
}

export function RecipeCard({
  recipe,
  keyword,
  myTools,
  catalogReady
}: RecipeCardProps): React.JSX.Element {
  const open = (): void => {
    // 记住列表页的位置与搜索条件，返回时原样恢复
    writeStored(STORAGE_KEYS.homeScroll, String(window.scrollY));
    writeStored(STORAGE_KEYS.homeUrl, window.location.pathname + window.location.search);
    navigate(`/recipe/${recipe.id}`);
  };

  const check = checkEquipment(recipe.equipment, recipe.equipmentAlternatives, myTools);
  const verdict = kitchenVerdict(check);
  const kitchenLabel = catalogReady && myTools.length > 0 ? shortEquipmentLabel(check) : null;

  return (
    <li className="recipe-card">
      <button type="button" className="recipe-card-button" onClick={open}>
        <span className="recipe-card-cover" aria-hidden="true">
          {recipe.name.slice(0, 1)}
        </span>

        <span className="recipe-card-body">
          <span className="recipe-card-name">
            <Highlight text={recipe.name} keyword={keyword} />
          </span>

          {recipe.summary && <span className="recipe-card-summary">{recipe.summary}</span>}

          <span className="recipe-card-meta">
            <span className="badge badge-category">{recipe.category}</span>
            {kitchenLabel && (
              <span className={`badge badge-kitchen badge-kitchen-${verdict}`}>{kitchenLabel}</span>
            )}
            {recipe.tags.map((tag) => (
              <span key={tag} className="badge">
                {tag}
              </span>
            ))}
          </span>

          <span className="recipe-card-foot">
            <span>{recipe.totalMinutes ? `${recipe.totalMinutes} 分钟` : "—"}</span>
            <span title={`难度：${difficultyText(recipe.difficulty)}`}>
              {difficultyStars(recipe.difficulty)} {difficultyText(recipe.difficulty)}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}
