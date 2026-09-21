import type { FastifyInstance } from "fastify";

import { normalizeToolName } from "../../shared/equipment.js";
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

interface KitchenBody {
  tools?: unknown;
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

  /**
   * 「我的厨具」整份替换（CB-008）。
   *
   * 与点赞/收藏同一套约定（ADR-0003）：只接受 POST + JSON、严格校验、写盘失败 503。
   * 额外一条：厨具是**受控词表**，词表外的名字一律 400（与菜谱校验同一纪律）。
   */
  app.post<{ Body: KitchenBody }>("/api/kitchen", async (request, reply) => {
    const tools = (request.body ?? {}).tools;
    if (!Array.isArray(tools) || tools.some((tool) => typeof tool !== "string")) {
      return reply
        .code(400)
        .send({ error: "invalid_tools", message: "tools 必须是字符串数组" });
    }

    const catalog = repository.equipment();
    if (catalog.problem !== null || catalog.tools.length === 0) {
      // 词表坏了就不接受写入：存进去的值无法校验，下次启动也会被判为非法
      return reply.code(503).send({
        error: "catalog_unavailable",
        message: catalog.problem ?? "厨具清单未载入，先修好 data/equipment.json"
      });
    }

    const known = new Set(catalog.tools.map((tool) => normalizeToolName(tool)));
    const unknown = tools.find((tool) => !known.has(normalizeToolName(tool)));
    if (unknown !== undefined) {
      return reply.code(400).send({
        error: "unknown_tool",
        message: `厨具“${unknown}”不在厨具清单里`,
        allowed: catalog.tools
      });
    }

    // 归一化：去重 + 顺序按词表 —— 让存储稳定（同一份配置写出的字节一致，便于 diff/备份比较）
    const wanted = new Set(tools.map((tool) => normalizeToolName(tool)));
    const normalized = catalog.tools.filter((tool) => wanted.has(normalizeToolName(tool)));

    try {
      return await userState.setKitchen(normalized);
    } catch (error) {
      request.log.error(`厨具写入失败：${(error as Error).message}`);
      return reply.code(503).send({ error: "write_failed", message: "厨具没能保存，请重试" });
    }
  });
}
