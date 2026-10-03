import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DailyMenuResponse, Recipe } from "../src/shared/types.js";
import { createApp } from "../src/server/index.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe("每日菜单应用接线", () => {
  it("组装/ready/inject及多次GET只读，不触发已配置模型", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cookbook-daily-app-"));
    directories.push(dir);
    await mkdir(join(dir, "recipes"));
    const recipes: Recipe[] = [
      { id: "chicken", name: "清炒鸡肉", category: "家常菜", difficulty: 1, servings: 2, ingredients: [{ name: "鸡胸肉" }], steps: [{ text: "炒熟" }] },
      { id: "greens", name: "清炒青菜", category: "家常菜", difficulty: 1, servings: 2, ingredients: [{ name: "青菜" }], steps: [{ text: "炒熟" }] },
      { id: "soup", name: "紫菜蛋花汤", category: "汤羹", difficulty: 1, servings: 2, ingredients: [{ name: "紫菜" }, { name: "鸡蛋" }], steps: [{ text: "煮熟" }] }
    ];
    for (const recipe of recipes) await writeFile(join(dir, "recipes", `${recipe.id}.json`), JSON.stringify(recipe));
    const generate = vi.fn();
    const app = await createApp({ host: "127.0.0.1", port: 0, dataDir: dir, webDir: null }, { config: null }, {
      config: { baseUrl: "https://example.test", token: "test-only", model: "deepseek-flash" },
      generate, now: () => new Date("2026-10-03T12:00:00.000Z")
    });
    try {
      await app.ready();
      const responses = await Promise.all(Array.from({ length: 4 }, () => app.inject({ method: "GET", url: "/api/daily-menu" })));
      expect(responses.every(response => response.statusCode === 200)).toBe(true);
      expect(responses[0].headers["cache-control"]).toContain("no-store");
      const body = responses[0].json<DailyMenuResponse>();
      expect(body).toMatchObject({ people: 2, source: "fallback", date: "2026-10-03" });
      expect(body.items.map(item => item.role).sort()).toEqual(["main", "soup", "vegetable"]);
      expect(body.items.every(item => recipes.some(recipe => recipe.id === item.recipe.id))).toBe(true);
      expect(generate).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
