import type { FastifyInstance } from "fastify";

import type { RecipeRepository } from "../services/recipe-repository.js";
import type { UserStateStore } from "../services/user-state-store.js";

/**
 * 用户状态（点赞、收藏）的写接口 —— 本项目第一个写操作。
 *
 * 约定（见 docs/decisions/ADR-0003-write-operations-user-state.md 与 CB-005）：
 * - 只接受 POST + JSON；`id` 不存在 → 404；body 不合法 → 400；**写盘失败 → 503**（可重试，不是 500）
 * - 不做鉴权：局域网自用，与只读接口同一信任模型
 */

interface LikeBody {
  delta?: unknown;
}

interface FavoriteBody {
  favorite?: unknown;
}

export function registerUserStateRoutes(
  app: FastifyInstance,
  repository: RecipeRepository,
  userState: UserStateStore
): void {
  app.get("/api/user-state", async () => userState.snapshot());

  app.post<{ Params: { id: string }; Body: LikeBody }>(
    "/api/recipes/:id/like",
    async (request, reply) => {
      const { id } = request.params;

      if (!repository.get(id)) {
        return reply.code(404).send({ error: "recipe_not_found", id });
      }

      const delta = (request.body ?? {}).delta;
      if (delta !== 1 && delta !== -1) {
        return reply.code(400).send({ error: "invalid_delta", message: "delta 只能是 1 或 -1" });
      }

      try {
        return await userState.like(id, delta);
      } catch (error) {
        request.log.error(`点赞写入失败 ${id}：${(error as Error).message}`);
        return reply.code(503).send({ error: "write_failed", message: "状态没能保存，请重试" });
      }
    }
  );

  app.post<{ Params: { id: string }; Body: FavoriteBody }>(
    "/api/recipes/:id/favorite",
    async (request, reply) => {
      const { id } = request.params;

      if (!repository.get(id)) {
        return reply.code(404).send({ error: "recipe_not_found", id });
      }

      const favorite = (request.body ?? {}).favorite;
      if (typeof favorite !== "boolean") {
        return reply
          .code(400)
          .send({ error: "invalid_favorite", message: "favorite 必须是布尔值" });
      }

      try {
        return await userState.setFavorite(id, favorite);
      } catch (error) {
        request.log.error(`收藏写入失败 ${id}：${(error as Error).message}`);
        return reply.code(503).send({ error: "write_failed", message: "状态没能保存，请重试" });
      }
    }
  );
}
