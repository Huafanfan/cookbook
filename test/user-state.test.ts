import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { normalizeState, UserStateStore, USER_STATE_FILE_NAME } from "../src/server/services/user-state-store.js";
import { sortByUserPreference } from "../src/server/services/search.js";
import type { RecipeSummary } from "../src/shared/types.js";

let tempDir: string | null = null;

async function makeDir(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "cookbook-state-"));
  return tempDir;
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("UserStateStore · 点赞与收藏", () => {
  it("点赞累加、减回，下限 0", async () => {
    const dir = await makeDir();
    const { store } = await UserStateStore.load(dir);

    expect((await store.like("a", 1)).likes).toBe(1);
    expect((await store.like("a", 1)).likes).toBe(2);
    expect((await store.like("a", -1)).likes).toBe(1);
    expect((await store.like("a", -1)).likes).toBe(0);
    expect((await store.like("a", -1)).likes).toBe(0); // 不会变成负数
  });

  it("收藏开关可反复切换", async () => {
    const dir = await makeDir();
    const { store } = await UserStateStore.load(dir);

    expect((await store.setFavorite("a", true)).favorite).toBe(true);
    expect((await store.setFavorite("a", false)).favorite).toBe(false);
  });

  it("**原子落盘**：写完后文件内容完整可解析", async () => {
    const dir = await makeDir();
    const { store } = await UserStateStore.load(dir);

    await store.like("hong-shao-rou", 1);
    await store.setFavorite("hong-shao-rou", true);

    const raw = await readFile(join(dir, USER_STATE_FILE_NAME), "utf8");
    const parsed = JSON.parse(raw) as { recipes: Record<string, unknown> };
    expect(parsed.recipes["hong-shao-rou"]).toMatchObject({ likes: 1, favorite: true });
  });

  it("重新载入后状态保持", async () => {
    const dir = await makeDir();
    const first = await UserStateStore.load(dir);
    await first.store.like("a", 1);
    await first.store.setFavorite("a", true);

    const second = await UserStateStore.load(dir);
    expect(second.store.get("a")).toMatchObject({ likes: 1, favorite: true });
  });

  it("**串行队列**：并发 10 次 +1 的结果是 10（不互相覆盖）", async () => {
    const dir = await makeDir();
    const { store } = await UserStateStore.load(dir);

    await Promise.all(Array.from({ length: 10 }, () => store.like("a", 1)));

    expect(store.get("a").likes).toBe(10);
  });

  it("文件损坏 → 另存为 .broken 并用空状态启动", async () => {
    const dir = await makeDir();
    await writeFile(join(dir, USER_STATE_FILE_NAME), "{ 这不是 JSON", "utf8");

    const { store, warnings } = await UserStateStore.load(dir);

    expect(store.get("a").likes).toBe(0);
    expect(warnings[0]).toContain("损坏");
    const broken = await readFile(join(dir, `${USER_STATE_FILE_NAME}.broken`), "utf8");
    expect(broken).toContain("这不是 JSON");
  });

  it("文件不存在 → 空状态且不报错", async () => {
    const dir = await makeDir();
    const { store, warnings } = await UserStateStore.load(dir);

    expect(store.snapshot()).toEqual({ recipes: {} });
    expect(warnings).toEqual([]);
  });
});

describe("normalizeState（容错）", () => {
  it("非法字段被规整：负数点赞归 0、非布尔收藏归 false", () => {
    const state = normalizeState({
      recipes: { a: { likes: -5, favorite: "yes" }, b: { likes: 3.7, favorite: true } }
    });

    expect(state.recipes.a).toBeUndefined(); // 全空 → 不保留
    expect(state.recipes.b).toMatchObject({ likes: 3, favorite: true });
  });

  it("结构完全不对时返回空状态", () => {
    expect(normalizeState(null).recipes).toEqual({});
    expect(normalizeState("x").recipes).toEqual({});
    expect(normalizeState({}).recipes).toEqual({});
  });
});

describe("sortByUserPreference（收藏优先 → 点赞降序 → 名称）", () => {
  const base = { category: "家常菜", tags: [], difficulty: 1 as const, servings: 2, ingredientNames: [], equipment: [], equipmentAlternatives: [], coverImage: null };

  const items: RecipeSummary[] = [
    { ...base, id: "c", name: "C 菜", likes: 5, favorite: false },
    { ...base, id: "b", name: "B 菜", likes: 0, favorite: true },
    { ...base, id: "a", name: "A 菜", likes: 5, favorite: false },
    { ...base, id: "d", name: "D 菜", likes: 9, favorite: true }
  ];

  it("收藏排最前；同为收藏时点赞多的在前", () => {
    expect(sortByUserPreference(items).map((item) => item.id)).toEqual(["d", "b", "a", "c"]);
  });

  it("都不收藏时按点赞降序，点赞相同按名称", () => {
    const plain = items.map((item) => ({ ...item, favorite: false }));
    expect(sortByUserPreference(plain).map((item) => item.id)).toEqual(["d", "a", "c", "b"]);
  });

  it("不改动原数组", () => {
    const before = items.map((item) => item.id);
    sortByUserPreference(items);
    expect(items.map((item) => item.id)).toEqual(before);
  });
});
