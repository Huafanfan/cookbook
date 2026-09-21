import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/server/index.js";
import type { RecipeDetail, RecipeHistoryListResponse, RecipeHistoryRecord } from "../src/shared/types.js";

// CB-009 的 HTTP 层：400 / 409 / 413 / 415 / 403 / 404 / 503 的语义与历史接口
process.env.COOKBOOK_LOG_LEVEL = "silent";

const EQUIPMENT = JSON.stringify({ tools: ["炒锅", "烤箱"], defaultOwned: ["炒锅"] });
const TAGS = JSON.stringify({ tags: ["快手", "下饭"] });

function recipeJson(id: string, name = "测试菜"): string {
  return `${JSON.stringify(
    {
      id,
      name,
      category: "家常菜",
      difficulty: 1,
      servings: 2,
      ingredients: [{ name: "盐", amount: 2, unit: "g" }],
      steps: [{ text: "随便炒炒" }]
    },
    null,
    2
  )}\n`;
}

let root: string;
let app: FastifyInstance;

async function detail(id: string): Promise<RecipeDetail> {
  const response = await app.inject({ method: "GET", url: `/api/recipes/${id}` });
  expect(response.statusCode).toBe(200);
  return response.json<RecipeDetail>();
}

function putBody(recipe: Record<string, unknown>, baseRevision: string, extra: Record<string, unknown> = {}) {
  return { recipe, baseRevision, ...extra };
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cookbook-write-route-"));
  const dataDir = join(root, "data");
  await mkdir(join(dataDir, "recipes"), { recursive: true });
  await writeFile(join(dataDir, "equipment.json"), EQUIPMENT);
  await writeFile(join(dataDir, "tags.json"), TAGS);
  await writeFile(join(dataDir, "recipes", "test-dish.json"), recipeJson("test-dish"));
  app = await createApp({ host: "127.0.0.1", port: 0, dataDir, webDir: null });
});

afterAll(async () => {
  await app.close();
  await rm(root, { recursive: true, force: true });
});

describe("GET 详情带 revision", () => {
  it("revision 是文件字节的 sha256", async () => {
    const body = await detail("test-dish");
    expect(body.revision).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("PUT /api/recipes/:id", () => {
  it("保存成功 → 200 + revision 变化 + 历史多一条", async () => {
    const before = await detail("test-dish");
    const response = await app.inject({
      method: "PUT",
      url: "/api/recipes/test-dish",
      payload: putBody(
        {
          id: "test-dish",
          name: "改过的菜",
          category: "家常菜",
          difficulty: 1,
          servings: 2,
          ingredients: [{ name: "盐", amount: 2, unit: "g" }],
          steps: [{ text: "随便炒炒" }]
        },
        before.revision,
        { note: "改名", source: "manual" }
      )
    });

    expect(response.statusCode).toBe(200);
    const saved = response.json<{ recipe: RecipeDetail; revision: string }>();
    expect(saved.recipe.name).toBe("改过的菜");
    expect(saved.revision).not.toBe(before.revision);

    expect((await detail("test-dish")).name).toBe("改过的菜");

    const history = await app.inject({ method: "GET", url: "/api/recipes/test-dish/history" });
    expect(history.statusCode).toBe(200);
    const items = history.json<RecipeHistoryListResponse>().items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]).toMatchObject({ note: "改名", outcome: "replaced" });
  });

  it("未知字段 → 400 invalid_body（严格请求体）", async () => {
    const before = await detail("test-dish");
    const response = await app.inject({
      method: "PUT",
      url: "/api/recipes/test-dish",
      payload: putBody(
        {
          id: "test-dish",
          name: "x",
          category: "家常菜",
          difficulty: 1,
          servings: 2,
          ingredients: [{ name: "盐" }],
          steps: [{ text: "炒" }]
        },
        before.revision,
        { force: true }
      )
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe("invalid_body");
  });

  it("字段不合法 → 400 invalid_recipe，并给出可定位的问题", async () => {
    const before = await detail("test-dish");
    const response = await app.inject({
      method: "PUT",
      url: "/api/recipes/test-dish",
      payload: putBody(
        {
          id: "test-dish",
          name: "x",
          category: "家常菜",
          difficulty: 1,
          servings: 2,
          ingredients: [{ name: "" }], // ← 空食材名
          steps: [{ text: "炒" }]
        },
        before.revision
      )
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: string; issues: string[] }>();
    expect(body.error).toBe("invalid_recipe");
    expect(body.issues.join("\n")).toContain("ingredients");
  });

  it("baseRevision 过期 → 409，带上服务端当前版本，且内容不变", async () => {
    const before = await detail("test-dish");
    const response = await app.inject({
      method: "PUT",
      url: "/api/recipes/test-dish",
      payload: putBody(
        {
          id: "test-dish",
          name: "不该写进去",
          category: "家常菜",
          difficulty: 1,
          servings: 2,
          ingredients: [{ name: "盐" }],
          steps: [{ text: "炒" }]
        },
        "sha256:0000000000000000"
      )
    });

    expect(response.statusCode).toBe(409);
    const body = response.json<{ error: string; currentRevision: string; current: unknown }>();
    expect(body.error).toBe("revision_conflict");
    expect(body.currentRevision).toBe(before.revision);
    expect(body.current).not.toBeNull();

    expect((await detail("test-dish")).name).not.toBe("不该写进去");
  });

  it("不存在的菜谱 → 404", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/recipes/no-such-dish",
      payload: putBody(
        { id: "no-such-dish", name: "x", category: "家常菜", difficulty: 1, servings: 2, ingredients: [{ name: "盐" }], steps: [{ text: "炒" }] },
        "sha256:1111111111111111"
      )
    });

    expect(response.statusCode).toBe(404);
  });

  it("跨站请求（Sec-Fetch-Site: cross-site）→ 403", async () => {
    const before = await detail("test-dish");
    const response = await app.inject({
      method: "PUT",
      url: "/api/recipes/test-dish",
      headers: { "sec-fetch-site": "cross-site" },
      payload: putBody(
        { id: "test-dish", name: "x", category: "家常菜", difficulty: 1, servings: 2, ingredients: [{ name: "盐" }], steps: [{ text: "炒" }] },
        before.revision
      )
    });

    expect(response.statusCode).toBe(403);
  });

  it("Content-Type 不是 JSON → 415", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/recipes/test-dish",
      headers: { "content-type": "text/plain" },
      payload: "hello"
    });

    expect(response.statusCode).toBe(415);
  });

  it("请求体过大 → 413（写接口的 256 KB 上限）", async () => {
    const before = await detail("test-dish");
    const response = await app.inject({
      method: "PUT",
      url: "/api/recipes/test-dish",
      payload: putBody(
        { id: "test-dish", name: "x", category: "家常菜", difficulty: 1, servings: 2, ingredients: [{ name: "盐" }], steps: [{ text: "炒" }] },
        before.revision,
        { note: "x".repeat(300 * 1024) }
      )
    });

    expect(response.statusCode).toBe(413);
  });
});

describe("历史接口", () => {
  it("列表倒序、单条含被替换的内容；伪造 historyId → 404", async () => {
    const before = await detail("test-dish");
    const saved = await app.inject({
      method: "PUT",
      url: "/api/recipes/test-dish",
      payload: putBody(
        {
          id: "test-dish",
          name: "第二版",
          category: "家常菜",
          difficulty: 1,
          servings: 2,
          ingredients: [{ name: "盐" }],
          steps: [{ text: "炒" }]
        },
        before.revision
      )
    });
    expect(saved.statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: "/api/recipes/test-dish/history" });
    const items = list.json<RecipeHistoryListResponse>().items;
    expect(items.length).toBeGreaterThanOrEqual(2);

    // 列表是元数据（不含正文）
    expect(Object.keys(items[0])).not.toContain("beforeRecipe");

    const record = await app.inject({
      method: "GET",
      url: `/api/recipes/test-dish/history/${items[0].historyId}`
    });
    expect(record.statusCode).toBe(200);
    expect(record.json<RecipeHistoryRecord>().beforeRecipe.name).toBeTruthy();

    const missing = await app.inject({
      method: "GET",
      url: "/api/recipes/test-dish/history/20200101T000000Z-beef"
    });
    expect(missing.statusCode).toBe(404);

    // 奇怪字符串（路径穿越尝试）→ 404，不碰文件系统
    const traversal = await app.inject({
      method: "GET",
      url: "/api/recipes/test-dish/history/..%2f..%2f..%2fetc%2fpasswd"
    });
    expect(traversal.statusCode).toBe(404);
  });

  it("保存时的历史快照就是保存前的文件内容（可恢复）", async () => {
    const list = await app.inject({ method: "GET", url: "/api/recipes/test-dish/history" });
    const items = list.json<RecipeHistoryListResponse>().items;

    // 最近一条的 beforeRecipe 应该等于当前文件的上一个版本：用磁盘文件反查
    const record = await app.inject({
      method: "GET",
      url: `/api/recipes/test-dish/history/${items[0].historyId}`
    });
    const before = record.json<RecipeHistoryRecord>().beforeRecipe;
    expect(before.id).toBe("test-dish");
    expect(before.name).toBe("改过的菜");

    const onDisk = JSON.parse(
      await readFile(join(root, "data", "recipes", "test-dish.json"), "utf8")
    ) as { name: string };
    expect(onDisk.name).toBe("第二版");
  });
});
