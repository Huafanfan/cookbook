import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { DailyMenuRecord, Recipe } from "../src/shared/types.js";
import { dailyMenuRecordSchema, dailyMenuStoreSchema } from "../src/server/lib/schema.js";
import { RecipeRepository } from "../src/server/services/recipe-repository.js";

const directories: string[] = [];
const claim: DailyMenuRecord = {
  date: "2026-10-03", attemptedAt: "2026-10-03T12:00:00.000Z", status: "generating",
  model: "deepseek-flash", promptVersion: "test-v1"
};
const ready: DailyMenuRecord = {
  ...claim, status: "ready", generatedAt: "2026-10-03T12:00:05.000Z", reason: "一荤一素一汤",
  picks: [{ role: "main", recipeId: "meat" }, { role: "vegetable", recipeId: "greens" }, { role: "soup", recipeId: "soup" }]
};
async function setup(): Promise<{ dir: string; repo: RecipeRepository }> {
  const dir = await mkdtemp(join(tmpdir(), "cookbook-daily-store-"));
  directories.push(dir);
  return { dir, repo: RecipeRepository.fromRecipes([], [], null, null, null, new Map(), dir) };
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe("每日菜单持久化预算", () => {
  it("并发认领仅一次，重载也不能再认领当天", async () => {
    const { dir, repo } = await setup();
    const claims = await Promise.all(Array.from({ length: 12 }, () => repo.claimDailyMenu(claim)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    const reloaded = await RecipeRepository.load(dir);
    expect(await reloaded.claimDailyMenu(claim)).toBe(false);
    expect((await reloaded.readDailyMenus()).records[claim.date].status).toBe("generating");
    expect((await stat(join(dir, "recommendations", "daily-menu.json"))).mode & 0o777).toBe(0o600);
  });

  it("成功和失败都保留每日记录，下日可认领，原菜谱字节不变", async () => {
    const { dir, repo } = await setup();
    const recipe: Recipe = { id: "original", name: "原菜", category: "家常菜", servings: 2, difficulty: 1, ingredients: [{ name: "鸡蛋" }], steps: [{ text: "炒熟" }] };
    await mkdir(join(dir, "recipes"));
    const bytes = JSON.stringify(recipe);
    await writeFile(join(dir, "recipes", "original.json"), bytes);
    await repo.claimDailyMenu(claim);
    await repo.finishDailyMenu(ready);
    const tomorrow = { ...claim, date: "2026-10-04", attemptedAt: "2026-10-03T16:05:00.000Z" };
    expect(await repo.claimDailyMenu(tomorrow)).toBe(true);
    await repo.finishDailyMenu({ ...tomorrow, status: "failed", errorCode: "provider" });
    expect(await repo.claimDailyMenu(tomorrow)).toBe(false);
    expect(Object.keys((await repo.readDailyMenus()).records)).toEqual(["2026-10-03", "2026-10-04"]);
    expect(await readFile(join(dir, "recipes", "original.json"), "utf8")).toBe(bytes);
    expect((await readdir(join(dir, "recommendations"))).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });

  it("坏缓存保留原字节，读/认领均失败，不以重写掩盖损坏", async () => {
    const { dir, repo } = await setup();
    await mkdir(join(dir, "recommendations"));
    const file = join(dir, "recommendations", "daily-menu.json");
    await writeFile(file, "{ broken-cache");
    await expect(repo.readDailyMenus()).rejects.toThrow("cache-unavailable");
    await expect(repo.claimDailyMenu(claim)).rejects.toThrow("cache-unavailable");
    expect(await readFile(file, "utf8")).toBe("{ broken-cache");
  });

  it("认领不能写入时拒绝，也不覆盖挡住目录的文件", async () => {
    const { dir, repo } = await setup();
    await writeFile(join(dir, "recommendations"), "preserve");
    await expect(repo.claimDailyMenu(claim)).rejects.toThrow();
    expect(await readFile(join(dir, "recommendations"), "utf8")).toBe("preserve");
  });

  it("不能完成未认领/其他任务，结束后不能再覆盖结果", async () => {
    const { repo } = await setup();
    await expect(repo.finishDailyMenu(ready)).rejects.toThrow("invalid-daily-menu-completion");
    await repo.claimDailyMenu(claim);
    await expect(repo.finishDailyMenu({ ...ready, attemptedAt: "2026-10-03T12:01:00.000Z" })).rejects.toThrow();
    await repo.finishDailyMenu(ready);
    await expect(repo.finishDailyMenu({ ...claim, status: "failed", errorCode: "provider" })).rejects.toThrow();
    expect((await repo.readDailyMenus()).records[claim.date]).toEqual(ready);
  });

  it("日期、预算状态与唯一角色/ID必须真实有效", () => {
    expect(dailyMenuRecordSchema.safeParse({ ...claim, date: "2026-02-30" }).success).toBe(false);
    expect(dailyMenuStoreSchema.safeParse({ version: 1, records: { "2026-10-04": claim } }).success).toBe(false);
    expect(dailyMenuRecordSchema.safeParse({ ...ready, picks: [ready.picks![0], ready.picks![0], ready.picks![2]] }).success).toBe(false);
    expect(dailyMenuRecordSchema.safeParse({ ...claim, status: "ready" }).success).toBe(false);
    expect(dailyMenuRecordSchema.safeParse({ ...claim, status: "failed" }).success).toBe(false);
    expect(dailyMenuRecordSchema.safeParse({ ...claim, errorCode: "provider" }).success).toBe(false);
  });
});
