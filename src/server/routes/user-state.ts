import type { FastifyInstance, FastifyReply } from "fastify";

import { normalizeToolName } from "../../shared/equipment.js";
import { kitchenWriteBodySchema } from "../lib/schema.js";
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

/* ---------- 厨具（CB-008）的请求处理 ---------- */

type KitchenCheck =
  | { ok: true; tools: string[] }
  | { ok: false; status: 400 | 503; error: string; message: string; allowed?: string[] };

/**
 * 严格读 body：只允许恰好 `{ tools }`。
 *
 * **形状与取值都由 `lib/schema.ts` 的 `kitchenWriteBodySchema` 定义**（运行时校验的唯一来源），
 * 这里额外读一次键名，只为把 400 的错误码分清楚：
 * 形状不对（多个键 / 缺键 / 不是对象）→ `invalid_body`；形状对但 `tools` 不合法 → `invalid_tools`。
 */
function readToolsBody(
  body: unknown
): { tools: string[] } | { problem: "invalid_body" | "invalid_tools" } {
  const keys = typeof body === "object" && body !== null ? Object.keys(body) : [];
  if (keys.length !== 1 || keys[0] !== "tools") return { problem: "invalid_body" };

  const parsed = kitchenWriteBodySchema.safeParse(body);
  if (!parsed.success) return { problem: "invalid_tools" };

  return { tools: parsed.data.tools };
}

/** 按厨具词表校验并归一化（去重 + 顺序按词表 —— 存储字节稳定，便于 diff/备份比较） */
function checkTools(repository: RecipeRepository, tools: string[]): KitchenCheck {
  const catalog = repository.equipment();
  if (catalog.problem !== null || catalog.tools.length === 0) {
    // 词表坏了就不接受写入：存进去的值无法校验，下次启动也会被判为非法
    return {
      ok: false,
      status: 503,
      error: "catalog_unavailable",
      message: catalog.problem ?? "厨具清单未载入，先修好 data/equipment.json"
    };
  }

  const known = new Set(catalog.tools.map((tool) => normalizeToolName(tool)));
  const unknown = tools.find((tool) => !known.has(normalizeToolName(tool)));
  if (unknown !== undefined) {
    return {
      ok: false,
      status: 400,
      error: "unknown_tool",
      message: `厨具“${unknown}”不在厨具清单里`,
      allowed: catalog.tools
    };
  }

  const wanted = new Set(tools.map((tool) => normalizeToolName(tool)));
  return { ok: true, tools: catalog.tools.filter((tool) => wanted.has(normalizeToolName(tool))) };
}

/** 两个厨具写接口共用的前半段：读 body + 词表校验。已回复错误时返回 null */
function readKitchenRequest(
  repository: RecipeRepository,
  body: unknown,
  reply: FastifyReply
): string[] | null {
  const parsed = readToolsBody(body);
  if ("problem" in parsed) {
    reply
      .code(400)
      .send(
        parsed.problem === "invalid_body"
          ? { error: "invalid_body", message: "只接受 { tools: string[] }，不接受其他字段" }
          : { error: "invalid_tools", message: "tools 必须是字符串数组" }
      );
    return null;
  }

  const checked = checkTools(repository, parsed.tools);
  if (!checked.ok) {
    reply.code(checked.status).send({
      error: checked.error,
      message: checked.message,
      ...(checked.allowed ? { allowed: checked.allowed } : {})
    });
    return null;
  }

  return checked.tools;
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
    const tools = readKitchenRequest(repository, request.body, reply);
    if (tools === null) return reply;

    try {
      return await userState.setKitchen(tools);
    } catch (error) {
      request.log.error(`厨具写入失败：${(error as Error).message}`);
      return reply.code(503).send({ error: "write_failed", message: "厨具没能保存，请重试" });
    }
  });

  /**
   * 迁移专用：**仅当服务端尚未设置过**时才写入（原子，CB-008）。
   *
   * 已设置 → `created: false` 且**不写盘**，返回现有配置（另一台设备先配好了，不能覆盖）。
   * 客户端不能拿"先 GET 看到 null 再 POST"代替它 —— 那中间有竞态窗口。
   */
  app.post<{ Body: KitchenBody }>("/api/kitchen/init", async (request, reply) => {
    const tools = readKitchenRequest(repository, request.body, reply);
    if (tools === null) return reply;

    try {
      const { kitchen, created } = await userState.initializeKitchen(tools);
      return { kitchen, created };
    } catch (error) {
      request.log.error(`厨具初始化失败：${(error as Error).message}`);
      return reply.code(503).send({ error: "write_failed", message: "厨具没能保存，请重试" });
    }
  });
}
