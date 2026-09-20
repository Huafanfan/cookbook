import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { formatContentIssues, lintRecipeContent } from "./lib/content-lint.js";
import { loadConfig, type CookbookConfig } from "./lib/config.js";
import { registerRecipeRoutes } from "./routes/recipes.js";
import { RecipeRepository } from "./services/recipe-repository.js";

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

  registerRecipeRoutes(app, repository);

  if (config.webDir) {
    const indexFile = join(config.webDir, "index.html");

    await app.register(fastifyStatic, {
      root: config.webDir,
      prefix: "/",
      index: ["index.html"]
    });

    // 前端使用 History 路由：/recipe/xxx 这类路径交给 index.html 处理
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method !== "GET" || request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "not_found" });
      }
      const html = await readFile(indexFile, "utf8");
      return reply.type("text/html; charset=utf-8").send(html);
    });
  } else {
    app.log.warn("未找到前端构建产物（dist/client），仅提供 API；开发模式请用 npm run dev");
  }

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
