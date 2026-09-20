import type { Recipe, RecipeSummary, SearchParams } from "../../shared/types.js";

/** 归一化：去空白 + 转小写，让"西红柿 炒蛋"与"西红柿炒蛋"等价 */
export function normalize(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function totalMinutes(recipe: Recipe): number | undefined {
  const total = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  return total > 0 ? total : undefined;
}

export function toSummary(
  recipe: Recipe,
  userState: { likes: number; favorite: boolean } = { likes: 0, favorite: false }
): RecipeSummary {
  return {
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    tags: recipe.tags ?? [],
    summary: recipe.summary,
    difficulty: recipe.difficulty,
    servings: recipe.servings,
    totalMinutes: totalMinutes(recipe),
    ingredientNames: recipe.ingredients.map((ingredient) => ingredient.name),
    equipment: recipe.equipment ?? [],
    equipmentAlternatives: recipe.equipmentAlternatives ?? [],
    // M4 实现图片扫描后改为实际封面地址
    coverImage: null,
    likes: userState.likes,
    favorite: userState.favorite
  };
}

export interface MatchResult {
  matched: boolean;
  /** 命中的字段，用于排序：0 菜名 > 1 别名 > 2 标签/分类 > 3 食材 */
  rank: number;
}

/** 判断关键词是否命中一道菜，并返回命中优先级 */
export function matchKeyword(recipe: Recipe, keyword: string): MatchResult {
  const q = normalize(keyword);
  if (!q) return { matched: true, rank: 0 };

  if (normalize(recipe.name).includes(q)) return { matched: true, rank: 0 };
  if ((recipe.aliases ?? []).some((alias) => normalize(alias).includes(q))) {
    return { matched: true, rank: 1 };
  }
  if (normalize(recipe.category).includes(q)) return { matched: true, rank: 2 };
  if ((recipe.tags ?? []).some((tag) => normalize(tag).includes(q))) {
    return { matched: true, rank: 2 };
  }
  if (recipe.ingredients.some((ingredient) => normalize(ingredient.name).includes(q))) {
    return { matched: true, rank: 3 };
  }
  // 多关键词（空格分隔）逐词尝试：命中任一即算命中
  return { matched: false, rank: 4 };
}

/** 按菜名 / 别名 / 食材 / 标签 / 分类搜索，并叠加分类与标签筛选 */
export function searchRecipes(recipes: Recipe[], params: SearchParams): Recipe[] {
  const keywords = (params.q ?? "")
    .split(/\s+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  const scored: { recipe: Recipe; rank: number }[] = [];

  for (const recipe of recipes) {
    if (params.category && recipe.category !== params.category) continue;
    if (params.tag && !(recipe.tags ?? []).includes(params.tag)) continue;

    if (keywords.length === 0) {
      scored.push({ recipe, rank: 0 });
      continue;
    }

    const results = keywords.map((keyword) => matchKeyword(recipe, keyword));
    if (!results.every((result) => result.matched)) continue;

    scored.push({ recipe, rank: Math.min(...results.map((result) => result.rank)) });
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.recipe.name.localeCompare(b.recipe.name, "zh");
  });

  return scored.map((entry) => entry.recipe);
}

/**
 * 按用户偏好排序：**收藏优先 → 点赞降序 → 名称**。
 *
 * 只在**没有搜索词**时使用（CB-005 §8 风险 3）：搜索时仍按相关度，
 * 否则"搜特定菜"的结果顺序会变得意外。
 */
export function sortByUserPreference(items: RecipeSummary[]): RecipeSummary[] {
  return [...items].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    if (a.likes !== b.likes) return b.likes - a.likes;
    return a.name.localeCompare(b.name, "zh");
  });
}
