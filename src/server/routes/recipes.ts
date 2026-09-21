import type { FastifyInstance, FastifyRequest } from "fastify";

import type {
  RecipeHistoryListResponse,
  RecipeListResponse,
  SearchParams
} from "../../shared/types.js";
import { formatIssueList, recipeWriteBodySchema } from "../lib/schema.js";
import type { UserStateStore } from "../services/user-state-store.js";
import {
  RecipeRevisionConflictError,
  RecipeWriteValidationError,
  UnknownRecipeError,
  type RecipeRepository
} from "../services/recipe-repository.js";
import { searchRecipes, sortByUserPreference, toSummary } from "../services/search.js";

interface RecipeQuery {
  q?: string;
  category?: string;
  tag?: string;
}

/** 写接口的请求体上限：单道菜 256 KB 足够（超出由 Fastify 返回 413） */
const RECIPE_WRITE_BODY_LIMIT = 256 * 1024;

/**
 * 同源检查（防御性，不是鉴权）：CB-009 §4 / [ADR-0005](../../docs/decisions/ADR-0005-editable-recipes-and-history.md) §2。
 *
 * - `Sec-Fetch-Site` 存在且不是 `same-origin`/`none` → 拒（跳站页面发起的写请求）；
 * - `Origin` 与 `Host` 不一致时**只放行本机回环**（开发模式经 Vite 代理：页面在 5173，后端看到 3000）；
 * - 没有这两个头的客户端（curl / 本地脚本）按局域网信任模型放行（无鉴权是既有约定，见 ADR-0005 §6）。
 */
function isSameOriginRequest(request: FastifyRequest): boolean {
  const site = request.headers["sec-fetch-site"];
  if (typeof site === "string" && site !== "same-origin" && site !== "none") return false;

  const origin = request.headers.origin;
  const host = request.headers.host;
  if (typeof origin !== "string" || !host) return true;

  try {
    const parsed = new URL(origin);
    if (parsed.host === host) return true;
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
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
    // 详情 = 菜谱文件字段 + 图片信息（CB-007）+ revision（CB-009）
    const recipe = repository.detail(request.params.id);
    if (!recipe) {
      return reply.code(404).send({ error: "recipe_not_found", id: request.params.id });
    }
    return recipe;
  });

  /**
   * 保存一道菜（CB-009）。整份替换 + 版本守卫：
   * 400 校验不过 / 409 版本不一致（**不静默覆盖**）/ 404 没有这道菜 / 503 写盘失败。
   */
  app.put<{ Params: { id: string }; Body: unknown }>(
    "/api/recipes/:id",
    { bodyLimit: RECIPE_WRITE_BODY_LIMIT },
    async (request, reply) => {
      if (!isSameOriginRequest(request)) {
        return reply.code(403).send({ error: "cross_origin", message: "写接口只接受同源请求" });
      }

      // 显式要求 JSON（不依赖框架默认）：表单类/纯文本请求连写路径都进不了
      const contentType = request.headers["content-type"] ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        return reply
          .code(415)
          .send({ error: "unsupported_media_type", message: "只接受 application/json" });
      }

      const body = recipeWriteBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.code(400).send({
          error: "invalid_body",
          message: "只接受 { recipe, baseRevision, note?, source? }，不接受其他字段",
          issues: formatIssueList(body.error)
        });
      }

      const { id } = request.params;

      try {
        const saved = await repository.saveRecipe({
          id,
          recipe: body.data.recipe,
          baseRevision: body.data.baseRevision,
          ...(body.data.note ? { note: body.data.note } : {}),
          ...(body.data.source ? { source: body.data.source } : {})
        });

        for (const warning of saved.warnings) request.log.warn(`保存 ${id}：${warning}`);
        return { recipe: repository.detail(id), revision: saved.revision };
      } catch (error) {
        if (error instanceof UnknownRecipeError) {
          return reply.code(404).send({ error: "recipe_not_found", id });
        }
        if (error instanceof RecipeWriteValidationError) {
          return reply
            .code(400)
            .send({ error: "invalid_recipe", message: error.message, issues: error.issues });
        }
        if (error instanceof RecipeRevisionConflictError) {
          return reply.code(409).send({
            error: "revision_conflict",
            message: "服务端上已经是另一个版本",
            current: error.current,
            currentRevision: error.currentRevision
          });
        }

        request.log.error(`菜谱写入失败 ${id}：${(error as Error).message}`);
        return reply.code(503).send({ error: "write_failed", message: "菜谱没能保存，内容未变" });
      }
    }
  );

  /** 修改记录列表（倒序，只有元数据） */
  app.get<{ Params: { id: string } }>("/api/recipes/:id/history", async (request, reply) => {
    if (!repository.get(request.params.id)) {
      return reply.code(404).send({ error: "recipe_not_found", id: request.params.id });
    }

    const response: RecipeHistoryListResponse = {
      items: await repository.listHistory(request.params.id)
    };
    return response;
  });

  /** 单条修改记录（含被替换掉的整份内容，供查看与恢复） */
  app.get<{ Params: { id: string; historyId: string } }>(
    "/api/recipes/:id/history/:historyId",
    async (request, reply) => {
      const record = await repository.readHistory(request.params.id, request.params.historyId);
      if (!record) {
        return reply.code(404).send({ error: "history_not_found", id: request.params.id });
      }
      return record;
    }
  );
}
