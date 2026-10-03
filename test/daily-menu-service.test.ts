import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { DailyMenuLlmInput, DailyMenuRecord, DailyMenuSelection, Recipe, WorkshopLlmConfig, WorkshopLlmOptions } from "../src/shared/types.js";
import { DailyMenuError } from "../src/server/lib/daily-menu-llm.js";
import { DailyMenuService, beijingDate, nextRefreshDelay } from "../src/server/services/daily-menu-service.js";
import { RecipeRepository } from "../src/server/services/recipe-repository.js";
import { UserStateStore } from "../src/server/services/user-state-store.js";

const CONFIG: WorkshopLlmConfig = { baseUrl: "https://model.example.test/v1", token: "test-only", model: "deepseek-flash" };
const FIXED_NOW = new Date("2026-10-03T04:00:00.000Z");
const roots: string[] = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function recipe(
  id: string,
  name: string,
  category: string,
  ingredients: string[],
  options: Partial<Recipe> = {}
): Recipe {
  return {
    id,
    name,
    category,
    difficulty: 1,
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 10,
    ingredients: ingredients.map((ingredient, index) => ({ name: ingredient, amount: index + 1, unit: "份", note: "只用于原菜谱" })),
    steps: [{ text: "按原菜谱制作。", minutes: 10 }],
    equipment: [category === "汤" ? "汤锅" : "炒锅"],
    equipmentAlternatives: [[category === "汤" ? "汤锅" : "炒锅"]],
    tags: ["下饭"],
    summary: "用于每日菜单的隔离测试菜谱。",
    source: "测试来源，不应发给模型",
    sourceRef: { repo: "https://example.test/recipes", path: `${id}.json`, baselineStatus: "matched" },
    ...options
  };
}

const RECIPES = [
  recipe("hong-shao-rou", "红烧肉", "家常菜", ["五花肉"]),
  recipe("oyster-greens", "蚝油青菜", "家常菜", ["青菜", "蚝油"]),
  recipe("pork-cabbage", "手撕包菜", "家常菜", ["包菜", "五花肉"]),
  recipe("zz-fish-fragrant", "鱼香茄子", "家常菜", ["茄子", "豆瓣酱"]),
  recipe("tomato-soup", "番茄蛋花汤", "汤", ["番茄", "鸡蛋"], { equipment: ["汤锅"] })
];
const VALID_SELECTION: DailyMenuSelection = {
  picks: [
    { role: "main", recipeId: "hong-shao-rou" },
    { role: "vegetable", recipeId: "oyster-greens" },
    { role: "soup", recipeId: "tomato-soup" }
  ],
  reason: "荤素汤搭配。"
};

interface World {
  root: string;
  dataDir: string;
  repository: RecipeRepository;
  state: UserStateStore;
}

async function makeWorld(recipes: Recipe[] = RECIPES, kitchen?: string[]): Promise<World> {
  const root = await mkdtemp(join(tmpdir(), "cookbook-daily-menu-"));
  roots.push(root);
  const dataDir = join(root, "data");
  await mkdir(join(dataDir, "recipes"), { recursive: true });
  await writeFile(join(dataDir, "equipment.json"), JSON.stringify({ tools: ["炒锅", "汤锅"], defaultOwned: ["炒锅"] }));
  await writeFile(join(dataDir, "tags.json"), JSON.stringify({ tags: [{ name: "下饭", when: "适合搭配主食" }] }));
  await Promise.all(recipes.map(item => writeFile(
    join(dataDir, "recipes", `${item.id}.json`), `${JSON.stringify(item, null, 2)}\n`
  )));
  const repository = await RecipeRepository.load(dataDir);
  const { store: state } = await UserStateStore.load(dataDir);
  if (kitchen !== undefined) await state.setKitchen(kitchen);
  return { root, dataDir, repository, state };
}

function inputSelection(input: DailyMenuLlmInput): DailyMenuSelection {
  const ids = new Set(input.candidates.map(candidate => candidate.id));
  const picks = VALID_SELECTION.picks.filter(pick => ids.has(pick.recipeId));
  return { picks, reason: VALID_SELECTION.reason };
}

function serviceOptions(
  generate: (input: DailyMenuLlmInput, config: WorkshopLlmConfig, options?: WorkshopLlmOptions) => Promise<DailyMenuSelection>,
  now: () => Date = () => FIXED_NOW
) {
  return { config: CONFIG, generate, now, warn: () => undefined };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe("DailyMenuService", () => {
  it("uses Beijing calendar boundaries and fills immediately before scheduling 00:05", async () => {
    expect(beijingDate(new Date("2026-10-02T15:59:59.000Z"))).toBe("2026-10-02");
    expect(beijingDate(new Date("2026-10-02T16:00:00.000Z"))).toBe("2026-10-03");
    expect(nextRefreshDelay(new Date("2026-10-02T16:04:59.000Z"))).toBe(1_000);
    expect(nextRefreshDelay(new Date("2026-10-02T16:05:00.000Z"))).toBe(24 * 60 * 60 * 1_000);

    const world = await makeWorld();
    const started = deferred<void>();
    const generate = vi.fn((_input: DailyMenuLlmInput, _config: WorkshopLlmConfig, options?: WorkshopLlmOptions) =>
      new Promise<DailyMenuSelection>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new DailyMenuError("interrupted")), { once: true });
        started.resolve(undefined);
      })
    );
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const service = new DailyMenuService(world.repository, world.state, serviceOptions(generate, () => new Date("2026-10-02T16:04:59.000Z")));

    service.start();
    await started.promise;
    expect(generate).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy.mock.calls.some(call => call[1] === 1_000)).toBe(true);
    expect((await service.getMenu()).status).toBe("updating");
    await service.close();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    const record = (await world.repository.readDailyMenus()).records["2026-10-03"];
    expect(record).toMatchObject({ status: "failed", errorCode: "interrupted" });
  });

  it("sends only minimized recipe candidates and uses the default kitchen only when unset", async () => {
    const world = await makeWorld();
    let received: DailyMenuLlmInput | undefined;
    const generate = vi.fn(async (input: DailyMenuLlmInput) => {
      received = input;
      return inputSelection(input);
    });
    const service = new DailyMenuService(world.repository, world.state, serviceOptions(generate));

    await service.refreshToday();

    expect(received?.ownedTools).toEqual(["炒锅"]);
    expect(received?.people).toBe(2);
    expect(received?.candidates.some(candidate => candidate.id === "tomato-soup")).toBe(true);
    expect(received?.candidates.some(candidate => candidate.id === "oyster-greens")).toBe(true);
    const pork = received?.candidates.find(candidate => candidate.id === "hong-shao-rou");
    expect(pork?.ingredients).toEqual(["五花肉"]);
    expect(Object.keys(pork ?? {}).sort()).toEqual([
      "category", "difficulty", "equipment", "equipmentAlternatives", "id", "ingredients",
      "name", "servings", "tags", "totalMinutes"
    ]);
    const serialized = JSON.stringify(received);
    expect(serialized).not.toMatch(/sourceRef|"source"|"steps"|"images"|"likes"|"draft"|五花肉.*note/);
  });

  it("preserves an intentionally empty kitchen and excludes pork cabbage from fallback vegetables", async () => {
    const world = await makeWorld(RECIPES, []);
    let received: DailyMenuLlmInput | undefined;
    const generate = vi.fn(async (input: DailyMenuLlmInput) => {
      received = input;
      throw new DailyMenuError("provider");
    });
    const service = new DailyMenuService(world.repository, world.state, serviceOptions(generate));

    await service.refreshToday();

    expect(received?.ownedTools).toEqual([]);
    const menu = await service.getMenu();
    expect(menu).toMatchObject({ source: "fallback", status: "fallback" });
    expect(menu.items.map(item => item.role)).toEqual(["main", "vegetable", "soup"]);
    expect(menu.items.find(item => item.role === "vegetable")?.recipe.id).toBe("oyster-greens");
    expect(menu.items.map(item => item.recipe.id)).not.toContain("pork-cabbage");
  });

  it("claims a date once across concurrent services and does not retry a persisted date after restart", async () => {
    const world = await makeWorld();
    const gate = deferred<void>();
    const started = deferred<void>();
    const first = vi.fn(async (input: DailyMenuLlmInput) => {
      started.resolve(undefined);
      await gate.promise;
      return inputSelection(input);
    });
    const second = vi.fn(async (input: DailyMenuLlmInput) => inputSelection(input));
    const one = new DailyMenuService(world.repository, world.state, serviceOptions(first));
    const two = new DailyMenuService(world.repository, world.state, serviceOptions(second));

    const firstRun = one.refreshToday();
    const secondRun = two.refreshToday();
    await started.promise;
    expect(first.mock.calls.length + second.mock.calls.length).toBe(1);
    gate.resolve(undefined);
    await Promise.all([firstRun, secondRun]);
    expect(first.mock.calls.length + second.mock.calls.length).toBe(1);

    const restartedRepository = await RecipeRepository.load(world.dataDir);
    const { store: restartedState } = await UserStateStore.load(world.dataDir);
    const afterRestart = vi.fn(async (input: DailyMenuLlmInput) => inputSelection(input));
    const restartedService = new DailyMenuService(restartedRepository, restartedState, serviceOptions(afterRestart));
    await restartedService.refreshToday();
    expect(afterRestart).not.toHaveBeenCalled();
    const staleService = new DailyMenuService(restartedRepository, restartedState, serviceOptions(afterRestart, () => new Date("2026-10-04T04:00:00.000Z")));
    const stale = await staleService.getMenu();
    expect(stale).toMatchObject({ status: "stale", menuDate: "2026-10-03", source: "llm" });
    await Promise.all([one.close(), two.close(), restartedService.close(), staleService.close()]);
  });

  it("uses a failed-attempt fallback once and leaves an incomplete fallback empty", async () => {
    const world = await makeWorld();
    const failed = vi.fn(async () => { throw new DailyMenuError("provider"); });
    const service = new DailyMenuService(world.repository, world.state, serviceOptions(failed));
    await service.refreshToday();
    await service.refreshToday();
    expect(failed).toHaveBeenCalledTimes(1);
    expect((await world.repository.readDailyMenus()).records["2026-10-03"]).toMatchObject({ status: "failed", errorCode: "provider" });
    expect((await service.getMenu()).items).toHaveLength(3);

    const incomplete = await makeWorld(RECIPES.filter(item => item.id === "hong-shao-rou" || item.id === "pork-cabbage"));
    const generate = vi.fn(async (input: DailyMenuLlmInput) => inputSelection(input));
    const incompleteService = new DailyMenuService(incomplete.repository, incomplete.state, serviceOptions(generate));
    await incompleteService.refreshToday();
    expect(generate).not.toHaveBeenCalled();
    expect((await incompleteService.getMenu()).items).toEqual([]);
    expect((await incomplete.repository.readDailyMenus()).records["2026-10-03"]).toMatchObject({ status: "failed", errorCode: "no-candidates" });
    await Promise.all([service.close(), incompleteService.close()]);
  });

  it("does not call the model when configuration, cache, or claim persistence is unavailable", async () => {
    const unconfigured = await makeWorld();
    const noConfigGenerate = vi.fn(async (input: DailyMenuLlmInput) => inputSelection(input));
    const unconfiguredClaim = vi.spyOn(unconfigured.repository, "claimDailyMenu");
    const noConfigService = new DailyMenuService(unconfigured.repository, unconfigured.state, {
      config: null, generate: noConfigGenerate, now: () => FIXED_NOW, warn: () => undefined
    });
    await noConfigService.refreshToday();
    expect(noConfigGenerate).not.toHaveBeenCalled();
    expect(unconfiguredClaim).not.toHaveBeenCalled();

    const corrupt = await makeWorld();
    await mkdir(join(corrupt.dataDir, "recommendations"), { recursive: true });
    await writeFile(join(corrupt.dataDir, "recommendations", "daily-menu.json"), "not-json");
    const corruptGenerate = vi.fn(async (input: DailyMenuLlmInput) => inputSelection(input));
    const corruptClaim = vi.spyOn(corrupt.repository, "claimDailyMenu");
    const corruptService = new DailyMenuService(corrupt.repository, corrupt.state, serviceOptions(corruptGenerate));
    await corruptService.refreshToday();
    expect(corruptGenerate).not.toHaveBeenCalled();
    expect(corruptClaim).not.toHaveBeenCalled();

    const failedClaim = await makeWorld();
    const claimGenerate = vi.fn(async (input: DailyMenuLlmInput) => inputSelection(input));
    vi.spyOn(failedClaim.repository, "claimDailyMenu").mockRejectedValue(new Error("private disk detail"));
    const claimService = new DailyMenuService(failedClaim.repository, failedClaim.state, serviceOptions(claimGenerate));
    await claimService.refreshToday();
    expect(claimGenerate).not.toHaveBeenCalled();
    await Promise.all([noConfigService.close(), corruptService.close(), claimService.close()]);
  });
});
