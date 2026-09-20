import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/server/index.js";
import type { RecipeDetail, RecipeListResponse } from "../src/shared/types.js";

// 测试不需要日志；必须在 createApp 之前设置
process.env.COOKBOOK_LOG_LEVEL = "silent";

/** 1×1 JPEG：这里要验证的是**真实图片字节**，不是随便一段文本 */
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==",
  "base64"
);

function recipeJson(id: string): string {
  return JSON.stringify({
    id,
    name: `菜 ${id}`,
    category: "家常菜",
    difficulty: 1,
    servings: 2,
    ingredients: [{ name: "盐" }],
    steps: [{ text: "焯水" }, { text: "焖" }]
  });
}

let root: string;
/** 有图片的数据目录 + 前端产物（模拟生产模式） */
let app: FastifyInstance;
/** 没有 images/ 目录的数据目录（模拟刚开始用、还没放图片） */
let appWithoutImages: FastifyInstance;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cookbook-route-test-"));

  const dataDir = join(root, "data");
  const webDir = join(root, "web");

  await mkdir(join(dataDir, "recipes"), { recursive: true });
  await mkdir(join(dataDir, "images", "ke-le-ji-chi"), { recursive: true });
  await mkdir(join(dataDir, "images", "wrong-name"), { recursive: true });
  await mkdir(join(webDir, "assets"), { recursive: true });

  await writeFile(join(dataDir, "recipes", "ke-le-ji-chi.json"), recipeJson("ke-le-ji-chi"));
  await writeFile(join(dataDir, "recipes", "wu-tu-pian.json"), recipeJson("wu-tu-pian"));
  await writeFile(join(dataDir, "images", "ke-le-ji-chi", "cover.jpg"), JPEG);
  await writeFile(join(dataDir, "images", "ke-le-ji-chi", "step-2.jpg"), JPEG);
  // 下面这些都在磁盘上，但都**不在扫描认下的白名单**里
  await writeFile(join(dataDir, "images", "ke-le-ji-chi", "notes.md"), "不是图片");
  await writeFile(join(dataDir, "images", "ke-le-ji-chi", ".DS_Store"), "");
  await writeFile(join(dataDir, "images", "ke-le-ji-chi", "cover.png"), "假装是封面");
  await writeFile(join(dataDir, "images", "ke-le-ji-chi", "step-9.jpg"), JPEG);
  await writeFile(join(dataDir, "images", "wrong-name", "cover.jpg"), JPEG);
  // 穿越攻击的"靶子"：数据目录里确实有一个不该被读出去的文件
  await writeFile(join(dataDir, "equipment.json"), '{"tools":["MARKER-EQUIPMENT"]}');

  await writeFile(join(webDir, "index.html"), "<html>app</html>");
  await writeFile(join(webDir, "assets", "app.js"), "console.log(1)");

  app = await createApp({ host: "127.0.0.1", port: 0, dataDir, webDir });

  const noImagesDataDir = join(root, "no-images-data");
  await mkdir(join(noImagesDataDir, "recipes"), { recursive: true });
  await writeFile(join(noImagesDataDir, "recipes", "ke-le-ji-chi.json"), recipeJson("ke-le-ji-chi"));
  appWithoutImages = await createApp({
    host: "127.0.0.1",
    port: 0,
    dataDir: noImagesDataDir,
    webDir: null
  });
});

afterAll(async () => {
  await app.close();
  await appWithoutImages.close();
  await rm(root, { recursive: true, force: true });
});

describe("列表与详情接口带出图片（CB-007）", () => {
  it("列表：有图的菜给 URL，没图的给 null", async () => {
    const response = await app.inject({ method: "GET", url: "/api/recipes" });
    expect(response.statusCode).toBe(200);

    const body = response.json() as RecipeListResponse;
    const byId = new Map(body.items.map((item) => [item.id, item]));

    expect(byId.get("ke-le-ji-chi")?.coverImage).toBe("/images/ke-le-ji-chi/cover.jpg");
    expect(byId.get("wu-tu-pian")?.coverImage).toBeNull();
  });

  it("详情：coverImage + 与步骤等长对齐的 stepImages", async () => {
    const response = await app.inject({ method: "GET", url: "/api/recipes/ke-le-ji-chi" });
    expect(response.statusCode).toBe(200);

    const body = response.json() as RecipeDetail;
    expect(body.steps).toHaveLength(2);
    expect(body.coverImage).toBe("/images/ke-le-ji-chi/cover.jpg");
    // 只有第 2 步有图；越界的 step-9.jpg 不生成地址
    expect(body.stepImages).toEqual([null, "/images/ke-le-ji-chi/step-2.jpg"]);
  });

  it("删除图片文件后详情仍可用（图片字段不影响菜谱本身）", async () => {
    const response = await appWithoutImages.inject({
      method: "GET",
      url: "/api/recipes/ke-le-ji-chi"
    });
    expect(response.statusCode).toBe(200);

    const body = response.json() as RecipeDetail;
    expect(body.coverImage).toBeNull();
    expect(body.stepImages).toEqual([null, null]);
  });
});

describe("GET /images/*：真实字节、缓存语义、白名单", () => {
  it("返回真实图片字节与 no-cache，且可用 ETag 做条件请求（304）", async () => {
    const response = await app.inject({ method: "GET", url: "/images/ke-le-ji-chi/cover.jpg" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/jpeg");
    // 文件名固定（cover.jpg），换图后必须能拿到新内容 → 不能 immutable
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.rawPayload.equals(JPEG)).toBe(true);

    const etag = response.headers.etag;
    expect(typeof etag).toBe("string");

    const revalidated = await app.inject({
      method: "GET",
      url: "/images/ke-le-ji-chi/cover.jpg",
      headers: { "if-none-match": String(etag) }
    });
    expect(revalidated.statusCode).toBe(304);
    expect(revalidated.rawPayload.length).toBe(0);
  });

  it("HEAD 返回 200 且没有响应体", async () => {
    const response = await app.inject({ method: "HEAD", url: "/images/ke-le-ji-chi/step-2.jpg" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/jpeg");
    expect(response.rawPayload.length).toBe(0);
  });

  it("缺失的图片是真 404：不是 200 HTML，也不允许缓存", async () => {
    const response = await app.inject({ method: "GET", url: "/images/ke-le-ji-chi/nope.jpg" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"] ?? "").not.toContain("text/html");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).not.toContain("<html");
  });

  it("/images 与目录请求都不给目录列表", async () => {
    for (const url of ["/images", "/images/", "/images/ke-le-ji-chi/", "/images/ke-le-ji-chi"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(404);
      expect(response.headers["content-type"] ?? "", url).not.toContain("text/html");
    }
  });

  it("磁盘上有、但扫描没认下的文件一律不提供", async () => {
    const urls = [
      "/images/ke-le-ji-chi/notes.md",
      "/images/ke-le-ji-chi/.DS_Store",
      "/images/ke-le-ji-chi/cover.png",
      "/images/ke-le-ji-chi/step-9.jpg"
    ];

    for (const url of urls) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(404);
    }

    // 大小写不同的扩展名：macOS（大小写不敏感）是 403、Linux 是 404，两者都不是 200
    const caseVariant = await app.inject({ method: "GET", url: "/images/ke-le-ji-chi/cover.JPG" });
    expect(caseVariant.statusCode).not.toBe(200);
    expect(caseVariant.rawPayload.equals(JPEG)).toBe(false);

    // 没有对应菜谱的目录同样不可访问
    const orphan = await app.inject({ method: "GET", url: "/images/wrong-name/cover.jpg" });
    expect(orphan.statusCode).toBe(404);
  });

  it("目录穿越：不返回数据目录里的文件，也不返回图片", async () => {
    const urls = [
      "/images/../equipment.json",
      "/images/%2e%2e/equipment.json",
      "/images/ke-le-ji-chi/../../equipment.json",
      "/images/ke-le-ji-chi/%2e%2e/%2e%2e/equipment.json",
      "/images/../recipes/ke-le-ji-chi.json"
    ];

    for (const url of urls) {
      const response = await app.inject({ method: "GET", url });
      // `..` 段通常会被 HTTP 客户端/框架先规范化（变成 /equipment.json，落到 SPA 兜底）
      // 或直接被插件拒掉（403/404）——两种都行，**内容**才是安全性质：
      // 既不能是数据目录里的文件，也不能是图片字节
      expect(response.body, url).not.toContain("MARKER-EQUIPMENT");
      expect(response.rawPayload.equals(JPEG), url).toBe(false);
    }
  });

  it("没有 images/ 目录（全新部署）时服务照常启动，图片请求是 404", async () => {
    const response = await appWithoutImages.inject({
      method: "GET",
      url: "/images/ke-le-ji-chi/cover.jpg"
    });
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"] ?? "").not.toContain("text/html");
  });
});

describe("与前端静态产物共存（生产模式）", () => {
  it("SPA 兜底仍是 200 HTML，/assets/* 仍是长缓存", async () => {
    const page = await app.inject({ method: "GET", url: "/recipe/ke-le-ji-chi" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.headers["cache-control"]).toBe("no-cache");

    const asset = await app.inject({ method: "GET", url: "/assets/app.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["cache-control"]).toContain("immutable");
  });

  it("图片路由没有被 SPA 兜底抢走", async () => {
    const response = await app.inject({ method: "GET", url: "/images/ke-le-ji-chi/cover.jpg" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/jpeg");
  });
});
