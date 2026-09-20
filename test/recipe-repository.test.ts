import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { Recipe } from "../src/shared/types.js";
import { loadRecipesFromDir, scanRecipeImages } from "../src/server/services/recipe-repository.js";

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

function makeRecipe(id: string, stepCount = 2): Recipe {
  return {
    id,
    name: id,
    category: "家常菜",
    difficulty: 1,
    servings: 2,
    ingredients: [{ name: "盐" }],
    steps: Array.from({ length: stepCount }, (_, index) => ({ text: `第 ${index + 1} 步` }))
  };
}

/** 建临时目录：images/<id>/<文件名>，内容随便（扫描只看文件名） */
async function setupImages(files: Record<string, string[]>): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "cookbook-images-test-"));
  const imagesDir = join(tempDir, "images");
  await mkdir(imagesDir, { recursive: true });

  for (const [id, names] of Object.entries(files)) {
    const dir = join(imagesDir, id);
    await mkdir(dir, { recursive: true });
    for (const name of names) await writeFile(join(dir, name), "jpeg-bytes");
  }

  return imagesDir;
}

describe("scanRecipeImages", () => {
  it("把封面与步骤图匹配到菜谱（即使只有部分步骤有图）", async () => {
    const imagesDir = await setupImages({ "ke-le-ji-chi": ["cover.jpg", "step-2.jpg"] });

    const result = await scanRecipeImages(imagesDir, [makeRecipe("ke-le-ji-chi", 3)]);

    expect(result.missing).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.media.get("ke-le-ji-chi")).toEqual({
      coverImage: "/images/ke-le-ji-chi/cover.jpg",
      stepImages: [null, "/images/ke-le-ji-chi/step-2.jpg", null]
    });
  });

  it("图片目录不存在时返回 missing（不是错误，也不影响菜谱）", async () => {
    const result = await scanRecipeImages("/definitely/not/here", [makeRecipe("a")]);

    expect(result).toEqual({ media: new Map(), admitted: new Set(), warnings: [], missing: true });
  });

  it("目录名没有对应菜谱、文件名认不出、步骤号越界：都只告警", async () => {
    const imagesDir = await setupImages({
      "ke-le-ji-chi": ["IMG_0001.jpg", "step-9.jpg"],
      "wrong-name": ["cover.jpg"]
    });

    const result = await scanRecipeImages(imagesDir, [makeRecipe("ke-le-ji-chi", 2)]);
    const warnings = result.warnings.join("\n");

    expect(warnings).toContain("images/wrong-name/：没有对应的菜谱 id");
    expect(warnings).toContain("IMG_0001.jpg：无法识别的文件名");
    expect(warnings).toContain("第 9 步不存在");
    // 认不出的名字与越界的步骤图都不产生 URL，也不进白名单
    expect(result.media.has("ke-le-ji-chi")).toBe(false);
    expect(result.admitted.has("ke-le-ji-chi/IMG_0001.jpg")).toBe(false);
    expect(result.admitted.has("ke-le-ji-chi/step-9.jpg")).toBe(false);
    expect(result.admitted.has("wrong-name/cover.jpg")).toBe(false);
  });

  it("顶层的隐藏文件按约定忽略（.gitkeep 不该刷告警）", async () => {
    const imagesDir = await setupImages({ "ke-le-ji-chi": ["cover.jpg"] });
    await writeFile(join(imagesDir, ".gitkeep"), "");

    const result = await scanRecipeImages(imagesDir, [makeRecipe("ke-le-ji-chi")]);

    expect(result.warnings).toEqual([]);
    expect(result.media.get("ke-le-ji-chi")?.coverImage).toBe(
      "/images/ke-le-ji-chi/cover.jpg"
    );
  });

  it("图片是符号链接时也认（指向图片的链接是合理用法）", async () => {
    const imagesDir = await setupImages({ "ke-le-ji-chi": [] });
    const outside = join(tempDir as string, "outside.jpg");
    await writeFile(outside, "jpeg-bytes");
    await symlink(outside, join(imagesDir, "ke-le-ji-chi", "cover.jpg"));

    const result = await scanRecipeImages(imagesDir, [makeRecipe("ke-le-ji-chi")]);

    expect(result.media.get("ke-le-ji-chi")?.coverImage).toBe(
      "/images/ke-le-ji-chi/cover.jpg"
    );
  });
});
