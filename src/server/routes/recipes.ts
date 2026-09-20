import type { FastifyInstance } from "fastify";

import type { RecipeListResponse, SearchParams } from "../../shared/types.js";
import type { UserStateStore } from "../services/user-state-store.js";
import type { RecipeRepository } from "../services/recipe-repository.js";
import { searchRecipes, sortByUserPreference, toSummary } from "../services/search.js";

interface RecipeQuery {
  q?: string;
  category?: string;
  tag?: string;
}

function readParams(query: RecipeQuery): SearchParams {
  return {
    q: query.q?.trim() || undefined,
    category: query.category?.trim() || undefined,
    tag: query.tag?.trim() || undefined
  };
}

export function registerRecipeRoutes(
  app: FastifyInstance,
  repository: RecipeRepository,
  userState: UserStateStore
): void {
  app.get("/api/health", async () => ({
    status: "ok" as const,
    recipes: repository.list().length
  }));

  app.get("/api/meta", async () => repository.meta());

  app.get<{ Querystring: RecipeQuery }>("/api/recipes", async (request) => {
    const params = readParams(request.query);
    const matched = searchRecipes(repository.list(), params);

    const summaries = matched.map((recipe) =>
      toSummary(recipe, userState.get(recipe.id), repository.media(recipe.id))
    );

    const response: RecipeListResponse = {
      total: summaries.length,
      // 只有"没有搜索词"时才按收藏/点赞排；搜索时仍按相关度（CB-005 §8）
      items: params.q ? summaries : sortByUserPreference(summaries),
      skipped: repository.failures().map((failure) => failure.file)
    };

    return response;
  });

  app.get<{ Params: { id: string } }>("/api/recipes/:id", async (request, reply) => {
    // 详情 = 菜谱文件字段 + 图片信息（CB-007）
    const recipe = repository.detail(request.params.id);
    if (!recipe) {
      return reply.code(404).send({ error: "recipe_not_found", id: request.params.id });
    }
    return recipe;
  });
}
