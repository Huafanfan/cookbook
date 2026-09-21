import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  RecipeRepository,
  RecipeRevisionConflictError,
  RecipeWriteValidationError
} from "../src/server/services/recipe-repository.js";
import type { Recipe } from "../src/shared/types.js";

/**
 * CB-009 的**写入协议**（先在临时目录上冻住它，再做界面）。
 *
 * 覆盖复核（Astra）要求的那几档：并发、历史失败、替换失败、409、恢复；
 * 每一条都在 `mkdtemp` 出来的临时目录上跑，**不碰真实 data/**。
 */

const EQUIPMENT = JSON.stringify({ tools: ["炒锅", "烤箱"], defaultOwned: ["炒锅"] });
const TAGS = JSON.stringify({ tags: ["快手", "下饭"] });

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "test-dish",
    name: "测试菜",
    category: "家常菜",
    difficulty: 1,
    servings: 2,
    ingredients: [{ name: "盐", amount: 2, unit: "g" }],
    steps: [{ text: "随便炒炒" }],
    ...overrides
  };
}

let tempDir: string | null = null;

async function makeDataDir(recipes: Recipe[] = [baseRecipe()]): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "cookbook-write-"));
  await mkdir(join(tempDir, "recipes"), { recursive: true });
  await writeFile(join(tempDir, "equipment.json"), EQUIPMENT);
  await writeFile(join(tempDir, "tags.json"), TAGS);

  for (const recipe of recipes) {
    await writeFile(
      join(tempDir, "recipes", `${recipe.id}.json`),
      `${JSON.stringify(recipe, null, 2)}\n`,
      "utf8"
    );
  }

  return tempDir;
}

async function recipeFileBytes(dir: string, id = "test-dish"): Promise<Buffer> {
  return readFile(join(dir, "recipes", `${id}.json`));
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("保存（CB-009 写入协议）", () => {
  it("正文换掉、内存更新、历史留的是**旧版本**（outcome=replaced）", async () => {
    const dir = await makeDataDir();
    const repository = await RecipeRepository.load(dir);
    const before = repository.detail("test-dish");

    const result = await repository.saveRecipe({
      id: "test-dish",
      recipe: { ...baseRecipe(), name: "改过的菜", servings: 3 },
      baseRevision: before?.revision ?? "",
      note: "改了名字"
    });

    // 内存
    expect(repository.get("test-dish")?.name).toBe("改过的菜");
    expect(repository.detail("test-dish")?.revision).toBe(result.revision);
    expect(result.revision).not.toBe(before?.revision);

    // 磁盘
    const saved = JSON.parse(await readFile(join(dir, "recipes", "test-dish.json"), "utf8")) as Recipe;
    expect(saved.name).toBe("改过的菜");
    expect(saved.servings).toBe(3);
    expect(saved.updatedAt).toBe(new Date().toISOString().slice(0, 10));

    // 历史
    const items = await repository.listHistory("test-dish");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: "manual",
      note: "改了名字",
      outcome: "replaced",
      beforeRevision: before?.revision,
      afterRevision: result.revision
    });

    const record = await repository.readHistory("test-dish", items[0].historyId);
    expect(record?.beforeRecipe.name).toBe("测试菜"); // 旧版本保住了
    expect(record?.beforeRecipe.servings).toBe(2);
  });

  it("baseRevision 对不上 → 冲突，且**一个字节都不写**", async () => {
    const dir = await makeDataDir();
    const repository = await RecipeRepository.load(dir);
    const beforeBytes = await recipeFileBytes(dir);

    await expect(
      repository.saveRecipe({
        id: "test-dish",
        recipe: { ...baseRecipe(), name: "偷偷改" },
        baseRevision: "sha256:deadbeefdeadbeef"
      })
    ).rejects.toBeInstanceOf(RecipeRevisionConflictError);

    expect(await recipeFileBytes(dir)).toEqual(beforeBytes);
    await expect(readdir(join(dir, "history"))).rejects.toThrow(); // 连历史目录都没建
  });

  it("厨具不在词表里 → 校验错误，不写盘（与 check:data 同一套规则）", async () => {
    const dir = await makeDataDir();
    const repository = await RecipeRepository.load(dir);
    const beforeBytes = await recipeFileBytes(dir);

    await expect(
      repository.saveRecipe({
        id: "test-dish",
        recipe: { ...baseRecipe(), equipment: ["不粘锅"] },
        baseRevision: repository.revisionOf("test-dish")
      })
    ).rejects.toBeInstanceOf(RecipeWriteValidationError);

    expect(await recipeFileBytes(dir)).toEqual(beforeBytes);
  });

  it("步骤文案的分钟数与 minutes 不一致 → 阻止保存（内容检查也在服务端跑）", async () => {
    const dir = await makeDataDir();
    const repository = await RecipeRepository.load(dir);
    const beforeBytes = await recipeFileBytes(dir);

    const error = await repository
      .saveRecipe({
        id: "test-dish",
        recipe: { ...baseRecipe(), steps: [{ text: "翻炒 3 分钟", minutes: 2 }] },
        baseRevision: repository.revisionOf("test-dish")
      })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(RecipeWriteValidationError);
    expect((error as RecipeWriteValidationError).issues.join("\n")).toContain("minutes");
    expect(await recipeFileBytes(dir)).toEqual(beforeBytes);
  });

  it("body 里的 id 与 URL 不一致 → 校验错误（不能靠改 id 另存一道菜）", async () => {
    const dir = await makeDataDir();
    const repository = await RecipeRepository.load(dir);

    await expect(
      repository.saveRecipe({
        id: "test-dish",
        recipe: { ...baseRecipe(), id: "another-dish" },
        baseRevision: repository.revisionOf("test-dish")
      })
    ).rejects.toBeInstanceOf(RecipeWriteValidationError);
  });

  it("历史快照写不下去 → 整次保存失败，正文不变", async () => {
    const dir = await makeDataDir();
    // 把 history 占成一个**文件**：mkdir 会失败
    await writeFile(join(dir, "history"), "我是一个文件，不是目录", "utf8");
    const repository = await RecipeRepository.load(dir);
    const beforeBytes = await recipeFileBytes(dir);

    await expect(
      repository.saveRecipe({
        id: "test-dish",
        recipe: { ...baseRecipe(), name: "不该写进去" },
        baseRevision: repository.revisionOf("test-dish")
      })
    ).rejects.toThrow();

    expect(await recipeFileBytes(dir)).toEqual(beforeBytes);
  });

  it("正文替换失败 → 历史留一条 outcome=failed，正文不变", async () => {
    const dir = await makeDataDir();
    const repository = await RecipeRepository.load(dir);
    const beforeBytes = await recipeFileBytes(dir);
    // 让 writeFile(recipes/test-dish.json.tmp) 失败
    await mkdir(join(dir, "recipes", "test-dish.json.tmp"));

    await expect(
      repository.saveRecipe({
        id: "test-dish",
        recipe: { ...baseRecipe(), name: "写不进去" },
        baseRevision: repository.revisionOf("test-dish")
      })
    ).rejects.toThrow();

    expect(await recipeFileBytes(dir)).toEqual(beforeBytes);

    const items = await repository.listHistory("test-dish");
    expect(items).toHaveLength(1);
    expect(items[0].outcome).toBe("failed");
    expect(items[0].afterRevision).toBeNull();
  });

  it("schema 之外的键（例如未来的 sourceRef）不会在保存时被丢掉", async () => {
    const withExtra = {
      ...baseRecipe(),
      sourceRef: { repo: "https://example.com/x", path: "汤/菜/菜.md" }
    } as unknown as Recipe;
    const dir = await makeDataDir([withExtra]);
    const repository = await RecipeRepository.load(dir);

    await repository.saveRecipe({
      id: "test-dish",
      recipe: { ...baseRecipe(), name: "改名但别丢来源" },
      baseRevision: repository.revisionOf("test-dish")
    });

    const saved = JSON.parse(await readFile(join(dir, "recipes", "test-dish.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(saved.name).toBe("改名但别丢来源");
    expect(saved.sourceRef).toEqual({ repo: "https://example.com/x", path: "汤/菜/菜.md" });
  });

  it("同一道菜两次并发保存：串行执行，只有一次写盘，另一次 409", async () => {
    const dir = await makeDataDir();
    const repository = await RecipeRepository.load(dir);
    const baseRevision = repository.revisionOf("test-dish");

    const results = await Promise.allSettled([
      repository.saveRecipe({
        id: "test-dish",
        recipe: { ...baseRecipe(), name: "第一次" },
        baseRevision
      }),
      repository.saveRecipe({
        id: "test-dish",
        recipe: { ...baseRecipe(), name: "第二次" },
        baseRevision
      })
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      RecipeRevisionConflictError
    );

    // 只有一次真的写进历史（另一次在写盘前就被挡住）
    expect(await repository.listHistory("test-dish")).toHaveLength(1);
  });

  it("步骤数变小后：越界的步骤图不再被采纳，白名单与 stepImages 一起重算", async () => {
    const dir = await makeDataDir([
      baseRecipe({
        steps: [{ text: "第一步" }, { text: "第二步" }, { text: "第三步" }]
      })
    ]);
    await mkdir(join(dir, "images", "test-dish"), { recursive: true });
    for (const file of ["cover.jpg", "step-1.jpg", "step-3.jpg"]) {
      await writeFile(join(dir, "images", "test-dish", file), "jpeg-bytes", "utf8");
    }

    const repository = await RecipeRepository.load(dir);
    expect(repository.media("test-dish")?.stepImages).toHaveLength(3);

    await repository.saveRecipe({
      id: "test-dish",
      recipe: { ...baseRecipe(), steps: [{ text: "只剩一步" }] },
      baseRevision: repository.revisionOf("test-dish")
    });

    expect(repository.media("test-dish")?.stepImages).toEqual(["/images/test-dish/step-1.jpg"]);
    expect(repository.admittedImages().has("test-dish/step-1.jpg")).toBe(true);
    expect(repository.admittedImages().has("test-dish/step-3.jpg")).toBe(false); // 越界 → 白名单移除
  });
});
