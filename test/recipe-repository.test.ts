import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadRecipesFromDir } from "../src/server/services/recipe-repository.js";

const VALID = JSON.stringify({
  id: "good-dish",
  name: "好菜",
  category: "家常菜",
  difficulty: 1,
  servings: 2,
  ingredients: [{ name: "盐", amount: 2, unit: "g" }],
  steps: [{ text: "随便炒炒" }]
});

let tempDir: string | null = null;

async function setupFiles(files: Record<string, string>): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "cookbook-test-"));
  const recipesDir = join(tempDir, "recipes");
  await mkdir(recipesDir, { recursive: true });

  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(recipesDir, name), content, "utf8");
  }

  return recipesDir;
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("loadRecipesFromDir", () => {
  it("载入合法文件", async () => {
    const dir = await setupFiles({ "good-dish.json": VALID });
    const { recipes, failures } = await loadRecipesFromDir(dir);

    expect(failures).toEqual([]);
    expect(recipes).toHaveLength(1);
    expect(recipes[0].name).toBe("好菜");
  });

  it("坏文件被跳过，不影响其他菜谱", async () => {
    const dir = await setupFiles({
      "good-dish.json": VALID,
      "broken-json.json": "{ 这不是 JSON",
      "bad-fields.json": JSON.stringify({ id: "bad-fields", name: "" })
    });

    const { recipes, failures } = await loadRecipesFromDir(dir);

    expect(recipes.map((recipe) => recipe.id)).toEqual(["good-dish"]);
    expect(failures.map((failure) => failure.file).sort()).toEqual([
      "bad-fields.json",
      "broken-json.json"
    ]);
    expect(failures.every((failure) => failure.reason.length > 0)).toBe(true);
  });

  it("id 与文件名不一致时拒绝该文件", async () => {
    const dir = await setupFiles({ "wrong-name.json": VALID });
    const { recipes, failures } = await loadRecipesFromDir(dir);

    expect(recipes).toHaveLength(0);
    expect(failures[0].reason).toContain("id 与文件名不一致");
  });

  it("名为 *.json 的目录被跳过，不影响其他菜谱（读取失败也要被隔离）", async () => {
    const dir = await setupFiles({ "good-dish.json": VALID });
    await mkdir(join(dir, "i-am-a-dir.json"), { recursive: true });

    const { recipes, failures } = await loadRecipesFromDir(dir);

    expect(recipes.map((recipe) => recipe.id)).toEqual(["good-dish"]);
    expect(failures).toHaveLength(1);
    expect(failures[0].file).toBe("i-am-a-dir.json");
    expect(failures[0].reason).toContain("读取失败");
  });

  it("厨具词表外的名字让该文件校验失败（受控词表的强制手段）", async () => {
    const dir = await setupFiles({
      "good-dish.json": VALID,
      "sneaky.json": JSON.stringify({
        id: "sneaky",
        name: "用了词表外的锅",
        category: "家常菜",
        difficulty: 1,
        servings: 2,
        equipment: ["不粘锅"],
        ingredients: [{ name: "盐" }],
        steps: [{ text: "炒" }]
      })
    });

    const { recipes, failures } = await loadRecipesFromDir(dir, ["炒锅"]);

    expect(recipes.map((recipe) => recipe.id)).toEqual(["good-dish"]);
    expect(failures[0].reason).toContain("不在厨具清单里");
  });

  it("目录不存在时返回一条失败记录而不是抛错", async () => {
    const { recipes, failures } = await loadRecipesFromDir("/definitely/not/here");

    expect(recipes).toHaveLength(0);
    expect(failures[0].reason).toBe("菜谱目录不存在");
  });
});
