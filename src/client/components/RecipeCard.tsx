import type { DailyMenuRole, RecipeCardProps } from "../../shared/types";
import { difficultyText } from "../lib/format";
import { Highlight } from "../lib/highlight";
import { checkEquipment, kitchenVerdict, shortEquipmentLabel } from "../lib/kitchen";
import { navigate } from "../lib/router";
import { STORAGE_KEYS, writeStored } from "../lib/storage";
import { RecipeCover } from "./RecipeCover";

const DAILY_ROLES: Record<DailyMenuRole, string> = { main: "荤菜", vegetable: "素菜", soup: "汤羹" };

export function RecipeCard({
  recipe,
  keyword,
  myTools,
  catalogReady,
  variant = "default",
  dailyRole
}: RecipeCardProps): React.JSX.Element {
  const open = (): void => {
    // 记住列表页的位置与搜索条件，返回时原样恢复
    writeStored(STORAGE_KEYS.homeScroll, String(window.scrollY));
    writeStored(STORAGE_KEYS.homeUrl, window.location.pathname + window.location.search);
    navigate(`/recipe/${recipe.id}`);
  };

  const check = checkEquipment(recipe.equipment, recipe.equipmentAlternatives, myTools);
  const verdict = kitchenVerdict(check);
  const kitchenLabel = catalogReady && (myTools.length > 0 || variant === "daily") ? shortEquipmentLabel(check) : null;

  if (variant === "daily") {
    const roleLabel = dailyRole ? DAILY_ROLES[dailyRole] : recipe.category;
    return (
      <li className="daily-menu-item">
        <button type="button" className="daily-menu-card" aria-label={`${roleLabel}：${recipe.name}`} onClick={open}>
          <span className="daily-menu-photo">
            <RecipeCover src={recipe.coverImage} name={recipe.name} className="daily-menu-cover" />
            <span className="daily-menu-role">{roleLabel}</span>
          </span>
          <span className="daily-menu-caption">
            <strong>{recipe.name}</strong>
            <span className="daily-menu-card-meta">
              {recipe.totalMinutes ? <span>{recipe.totalMinutes} 分钟</span> : null}
              {kitchenLabel && <span className={`daily-menu-equipment badge-kitchen-${verdict}`}>{kitchenLabel}</span>}
            </span>
          </span>
        </button>
      </li>
    );
  }

  if (variant === "featured") {
    return (
      <li className="featured-item">
        <button type="button" className="featured-card" onClick={open}>
          <RecipeCover src={recipe.coverImage} name={recipe.name} className="featured-cover" />
          <span className="featured-caption">
            <strong>{recipe.name}</strong>
            <span>{recipe.totalMinutes ? `${recipe.totalMinutes} 分钟` : recipe.category}</span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <li className="recipe-card">
      <button type="button" className="recipe-card-button" onClick={open}>
        <RecipeCover src={recipe.coverImage} name={recipe.name} className="recipe-card-cover" />

        <span className="recipe-card-body">
          <span className="recipe-card-name">
            <Highlight text={recipe.name} keyword={keyword} />
          </span>

          {recipe.summary && <span className="recipe-card-summary">{recipe.summary}</span>}

          <span className="recipe-card-meta">
            <span>{recipe.category}</span>
            {recipe.favorite && <span className="card-favorite">★ 已收藏</span>}
            {kitchenLabel && (
              <span className={`badge-kitchen card-kitchen badge-kitchen-${verdict}`}>{kitchenLabel}</span>
            )}
            {recipe.tags[0] && <span>{recipe.tags[0]}</span>}
          </span>

          <span className="recipe-card-foot">
            <span>{recipe.totalMinutes ? `${recipe.totalMinutes} 分钟` : "耗时未标注"}</span>
            <span>{difficultyText(recipe.difficulty)}</span>
          </span>
        </span>
      </button>
    </li>
  );
}
