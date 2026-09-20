import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { formatContentIssues, lintRecipeContent } from "./lib/content-lint.js";
import { loadConfig, type CookbookConfig } from "./lib/config.js";
import { isImageRequest, registerImageRoutes } from "./routes/images.js";
import { registerRecipeRoutes } from "./routes/recipes.js";
import { registerUserStateRoutes } from "./routes/user-state.js";
import { RecipeRepository } from "./services/recipe-repository.js";
import { UserStateStore } from "./services/user-state-store.js";

/** 组装应用（不监听端口），便于测试与复用 */
export async function createApp(config: CookbookConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.COOKBOOK_LOG_LEVEL ?? "info"
    }
  });

  const repository = await RecipeRepository.load(config.dataDir);

  app.log.info(
    `菜谱载入完成：成功 ${repository.list().length} 道，跳过 ${repository.failures().length} 个文件`
  );
  for (const failure of repository.failures()) {
    app.log.warn(`菜谱文件 ${failure.file} 未载入：${failure.reason}`);
  }

  // 内容检查只告警：内容问题不该让服务起不来，但要让人看得见
  for (const recipe of repository.list()) {
    for (const issue of formatContentIssues(recipe.id, lintRecipeContent(recipe))) {
      app.log.warn(`内容检查 ${issue}`);
    }
  }

  const { store: userState, warnings: userStateWarnings } = await UserStateStore.load(config.dataDir);
  for (const warning of userStateWarnings) app.log.warn(warning);

  registerRecipeRoutes(app, repository, userState);
  registerUserStateRoutes(app, repository, userState);
  await registerImageRoutes(app, config.dataDir, repository.admittedImages());

  const recipes = repository.list();
  if (repository.imagesMissing()) {
    app.log.info("未找到图片目录（data/images），全部菜谱使用占位图");
  } else {
    const covers = recipes.filter((recipe) => repository.media(recipe.id)?.coverImage).length;
    const steps = recipes.reduce(
      (total, recipe) =>
        total + (repository.media(recipe.id)?.stepImages.filter(Boolean).length ?? 0),
      0
    );
    app.log.info(`图片扫描完成：${covers}/${recipes.length} 道菜有封面，${steps} 张步骤图`);
  }
  for (const warning of repository.imageWarnings()) app.log.warn(`图片检查 ${warning}`);

  // API 数据小且会变：**一律不缓存**，否则改了菜谱/状态后界面看不到
  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api/")) reply.header("cache-control", "no-store");
    return payload;
  });

  if (config.webDir) {
    /**
     * 缓存策略 —— 目标是"发了新版，用户刷新就能拿到，不需要清缓存"。
     *
     * | 资源 | 策略 | 为什么 |
     * | --- | --- | --- |
     * | `index.html` | `no-cache`（每次回服务器确认，ETag 让重验证只是 304） | 它指向带内容哈希的资源；它被缓存住就会一直用旧前端 |
     * | `/assets/*`（Vite 产物，文件名含内容哈希） | `public, max-age=31536000, immutable` | 内容变了文件名就变，可以放心永久缓存 |
     * | `/api/*` | `no-store` | 数据会变，必须每次拿新的 |
     * | `/images/*`（图片，在 routes/images.ts 上设） | `no-cache`（ETag 重验证） | 文件名固定（`cover.jpg`），换图后必须能拿到新内容（[ADR-0004](../../docs/decisions/ADR-0004-image-static-hosting.md) §3） |
     *
     * 之前三者都没有显式头，浏览器按启发式自己猜 → 出现"改完必须手动清缓存"。
     */
    await app.register(fastifyStatic, {
      root: config.webDir,
      prefix: "/",
      index: ["index.html"],
      // 注意：这里的第一个参数是 Fastify 的 reply（不是裸 ServerResponse），
      // 所以用 .header()；写成 .setHeader() 会在请求时抛 TypeError。
      setHeaders: (reply, filePath) => {
        if (filePath.endsWith("index.html")) {
          reply.header("cache-control", "no-cache");
          return;
        }
        if (/[\\/]assets[\\/]/.test(filePath)) {
          reply.header("cache-control", "public, max-age=31536000, immutable");
        }
      }
    });

  } else {
    app.log.warn("未找到前端构建产物（dist/client），仅提供 API；开发模式请用 npm run dev");
  }

  /**
   * 缺失路径的统一兜底。
   *
   * 图片必须返回**真实 404**：交给页面兜底会让浏览器对 `cover.jpg` 收到一坨 HTML，
   * 既看不出是 404，还可能被当成图片缓存下来（[ADR-0004](../../docs/decisions/ADR-0004-image-static-hosting.md) §2）。
   */
  app.setNotFoundHandler(async (request, reply) => {
    if (isImageRequest(request.url)) {
      return reply.code(404).header("cache-control", "no-store").send({ error: "image_not_found" });
    }

    // 前端使用 History 路由：/recipe/xxx 这类路径交给 index.html 处理。
    // HEAD 也交给兜底（Fastify 会复用 GET 处理并丢弃响应体）；
    // 否则 HEAD /recipe/xxx 会 404 而 GET 返回 200，语义不一致
    const isPageRequest = request.method === "GET" || request.method === "HEAD";
    if (!isPageRequest || request.url.startsWith("/api/") || !config.webDir) {
      return reply.code(404).send({ error: "not_found" });
    }

    const html = await readFile(join(config.webDir, "index.html"), "utf8");
    return reply.type("text/html; charset=utf-8").header("cache-control", "no-cache").send(html);
  });

  return app;
}

export async function startServer(): Promise<void> {
  const config = loadConfig();
  const app = await createApp(config);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`收到 ${signal}，正在关闭服务`);
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.host, port: config.port });
  app.log.info(`cookbook 已启动：http://${config.host}:${config.port}`);
}
