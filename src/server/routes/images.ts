import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { join } from "node:path";

/**
 * 注册 `GET/HEAD /images/*`：托管扫描**实际认下**的菜谱图片。
 *
 * 暴露面是一个白名单集合（[ADR-0004](../../../docs/decisions/ADR-0004-image-static-hosting.md)）：
 * 只有启动扫描认下的文件（`<id>/cover.jpg`、`<id>/step-<N>.jpg`，且步骤号不越界）可访问；
 * 其余（`.DS_Store`、`cover.png`、`notes.md`、没有对应菜谱的目录）一律 404。
 * 这样路由与 API 严格一致：API 不给的地址，路由也不提供。
 *
 * 另外两个要点（同样来自 ADR-0004）：
 * 1. 这是 `@fastify/static` 的**第二次**注册（前端产物已经注册过一次），必须
 *    `decorateReply: false`，否则启动时报"sendFile 已存在"。
 * 2. 图片文件名固定（`cover.jpg`），所以**不能**用 `immutable`：换图后要靠重验证才能拿到新内容。
 *    保留 ETag/Last-Modified → 内容没变时只是一个 304。
 */
export async function registerImageRoutes(
  app: FastifyInstance,
  dataDir: string,
  /** 扫描认下的路径，形如 `ke-le-ji-chi/cover.jpg` */
  admitted: ReadonlySet<string>
): Promise<void> {
  await app.register(fastifyStatic, {
    root: join(dataDir, "images"),
    prefix: "/images/",
    decorateReply: false,
    // 根目录还不存在（全新部署）时由扫描结果给出更准确的信息，不刷插件的警告
    suppressWarning: true,
    // 不提供目录列表
    list: false,
    allowedPath: (pathname) => admitted.has(pathname.replace(/^\//, "")),
    setHeaders: (reply) => {
      reply.header("cache-control", "no-cache");
    }
  });
}

/** 是否为图片请求（含无斜杠的 `/images`）；用于把图片 404 与页面兜底分开 */
export function isImageRequest(url: string): boolean {
  const path = url.split("?")[0];
  return path === "/images" || path.startsWith("/images/");
}
