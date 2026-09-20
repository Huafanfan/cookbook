import type { FastifyInstance } from "fastify";

import type { RecipeListResponse, SearchParams } from "../../shared/types.js";
import type { RecipeRepository } from "../services/recipe-repository.js";
import { searchRecipes, toSummary } from "../services/search.js";

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

export function registerRecipeRoutes(app: FastifyInstance, repository: RecipeRepository): void {
  app.get("/api/health", async () => ({
    status: "ok" as const,
    recipes: repository.list().length
  }));

  app.get("/api/meta", async () => repository.meta());

  app.get<{ Querystring: RecipeQuery }>("/api/recipes", async (request) => {
    const params = readParams(request.query);
    const matched = searchRecipes(repository.list(), params);

    const response: RecipeListResponse = {
      total: matched.length,
      items: matched.map(toSummary),
      skipped: repository.failures().map((failure) => failure.file)
    };

    return response;
  });

  app.get<{ Params: { id: string } }>("/api/recipes/:id", async (request, reply) => {
    const recipe = repository.get(request.params.id);
    if (!recipe) {
      return reply.code(404).send({ error: "recipe_not_found", id: request.params.id });
    }
    return recipe;
  });
}
