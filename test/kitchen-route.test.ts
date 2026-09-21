import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/server/index.js";
import type { KitchenState, UserStateResponse } from "../src/shared/types.js";

// 覆盖：POST /api/kitchen 的校验与落盘（CB-008）
process.env.COOKBOOK_LOG_LEVEL = "silent";

const RECIPE = JSON.stringify({
  id: "ke-le-ji-chi",
  name: "可乐鸡翅",
  category: "家常菜",
  difficulty: 1,
  servings: 2,
  ingredients: [{ name: "鸡翅" }],
  steps: [{ text: "焯水" }]
});

const EQUIPMENT = JSON.stringify({
  tools: ["炒锅", "烤箱", "空气炸锅"],
  defaultOwned: ["炒锅"]
});

let root: string;
let app: FastifyInstance;
/** 词表缺失的实例：写入必须被拒绝（503），不能存进无法校验的值 */
let appWithoutCatalog: FastifyInstance;

async function writeRecipe(dataDir: string): Promise<void> {
  await mkdir(join(dataDir, "recipes"), { recursive: true });
  await writeFile(join(dataDir, "recipes", "ke-le-ji-chi.json"), RECIPE);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cookbook-kitchen-route-"));

  const dataDir = join(root, "data");
  await writeRecipe(dataDir);
  await writeFile(join(dataDir, "equipment.json"), EQUIPMENT);
  app = await createApp({ host: "127.0.0.1", port: 0, dataDir, webDir: null });

  const noCatalogDir = join(root, "no-catalog");
  await writeRecipe(noCatalogDir);
  appWithoutCatalog = await createApp({
    host: "127.0.0.1",
    port: 0,
    dataDir: noCatalogDir,
    webDir: null
  });
});

afterAll(async () => {
  await app.close();
  await appWithoutCatalog.close();
  await rm(root, { recursive: true, force: true });
});

describe("POST /api/kitchen", () => {
  it("保存：200 + 按词表顺序归一化 + 真的落盘", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/kitchen",
      payload: { tools: ["烤箱", "炒锅", "烤箱"] }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as KitchenState;
    // 顺序按词表（炒锅 在 烤箱 前）、去重
    expect(body.tools).toEqual(["炒锅", "烤箱"]);
    expect(body.updatedAt).toBeTruthy();

    const state = await app.inject({ method: "GET", url: "/api/user-state" });
    expect((state.json() as UserStateResponse).kitchen?.tools).toEqual(["炒锅", "烤箱"]);

    const raw = await readFile(join(root, "data", "user-state.json"), "utf8");
    expect((JSON.parse(raw) as { kitchen: KitchenState }).kitchen.tools).toEqual(["炒锅", "烤箱"]);
  });

  it("空数组合法（明确全不选），且不等于「从未设置过」", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/kitchen",
      payload: { tools: [] }
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as KitchenState).tools).toEqual([]);

    const state = await app.inject({ method: "GET", url: "/api/user-state" });
    const kitchen = (state.json() as UserStateResponse).kitchen;
    expect(kitchen).not.toBeNull();
    expect(kitchen?.tools).toEqual([]);
  });

  it("非数组 / 非字符串 / 缺字段 → 400", async () => {
    const payloads = [{ tools: "炒锅" }, { tools: [1] }, { tools: [null] }, {}];

    for (const payload of payloads) {
      const response = await app.inject({ method: "POST", url: "/api/kitchen", payload });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json<{ error: string }>().error).toBe("invalid_tools");
    }
  });

  it("词表外的厨具 → 400，并列出可选值（受控词表纪律）", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/kitchen",
      payload: { tools: ["炒锅", "不粘锅"] }
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: string; message: string; allowed: string[] };
    expect(body.error).toBe("unknown_tool");
    expect(body.message).toContain("不粘锅");
    expect(body.allowed).toEqual(["炒锅", "烤箱", "空气炸锅"]);
  });

  it("厨具词表没载入 → 503（不存无法校验的数据）", async () => {
    const response = await appWithoutCatalog.inject({
      method: "POST",
      url: "/api/kitchen",
      payload: { tools: ["炒锅"] }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ error: string }>().error).toBe("catalog_unavailable");
  });

  it("写厨具不会冲掉点赞与收藏", async () => {
    await app.inject({
      method: "POST",
      url: "/api/recipes/ke-le-ji-chi/like",
      payload: { delta: 1 }
    });
    await app.inject({
      method: "POST",
      url: "/api/recipes/ke-le-ji-chi/favorite",
      payload: { favorite: true }
    });
    await app.inject({ method: "POST", url: "/api/kitchen", payload: { tools: ["烤箱"] } });

    const state = await app.inject({ method: "GET", url: "/api/user-state" });
    const body = state.json() as UserStateResponse;

    expect(body.recipes["ke-le-ji-chi"]).toMatchObject({ likes: 1, favorite: true });
    expect(body.kitchen?.tools).toEqual(["烤箱"]);
  });
});
