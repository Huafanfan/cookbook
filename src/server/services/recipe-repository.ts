import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { Recipe, RecipeMetaResponse } from "../../shared/types.js";
import { loadEquipmentList, type EquipmentList } from "../lib/equipment.js";
import { loadTagVocabulary, EMPTY_TAG_VOCABULARY, type TagVocabulary } from "../lib/tags.js";
import { createRecipeSchema, formatIssues } from "../lib/schema.js";

export interface LoadFailure {
  /** 文件名，例如 `bad-recipe.json` */
  file: string;
  /** 失败原因，可直接打印给使用者定位问题 */
  reason: string;
}

export interface LoadResult {
  recipes: Recipe[];
  failures: LoadFailure[];
}

/**
 * 读取并校验一个目录下的全部菜谱文件。
 *
 * 单个文件失败**不会**影响其他菜谱：跳过它并把原因记在 failures 里，
 * 由调用方打印告警。见 docs/DATA_MODEL.md「校验规则」。
 *
 * `allowedTools` 是厨具词表：提供后，菜谱里出现词表外的厨具会被当作校验失败。
 */
export async function loadRecipesFromDir(
  recipesDir: string,
  allowedTools?: readonly string[],
  allowedTags?: readonly string[]
): Promise<LoadResult> {
  const schema = createRecipeSchema({ allowedTools, allowedTags });
  let fileNames: string[];
  try {
    fileNames = await readdir(recipesDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        recipes: [],
        failures: [{ file: recipesDir, reason: "菜谱目录不存在" }]
      };
    }
    throw error;
  }

  const jsonFiles = fileNames.filter((name) => name.endsWith(".json")).sort();
  const recipes: Recipe[] = [];
  const failures: LoadFailure[] = [];
  const seenIds = new Set<string>();

  for (const file of jsonFiles) {
    // 读文件本身也要在 per-file 保护里：单个不可读文件（或名为 *.json 的目录）
    // 不能让整次载入失败，否则违反"坏文件不影响其他菜谱"的承诺
    let raw: string;
    try {
      raw = await readFile(join(recipesDir, file), "utf8");
    } catch (error) {
      failures.push({ file, reason: `读取失败：${(error as Error).message}` });
      continue;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      failures.push({ file, reason: `JSON 解析失败：${(error as Error).message}` });
      continue;
    }

    const parsed = schema.safeParse(parsedJson);
    if (!parsed.success) {
      failures.push({ file, reason: formatIssues(parsed.error) });
      continue;
    }

    const expectedId = file.replace(/\.json$/i, "");
    if (parsed.data.id !== expectedId) {
      failures.push({
        file,
        reason: `id 与文件名不一致：文件为 "${expectedId}"，id 为 "${parsed.data.id}"`
      });
      continue;
    }

    if (seenIds.has(parsed.data.id)) {
      failures.push({ file, reason: `id 重复："${parsed.data.id}"` });
      continue;
    }

    seenIds.add(parsed.data.id);
    recipes.push(parsed.data);
  }

  return { recipes, failures };
}

/** 唯一的数据访问入口：其他模块不直接读文件（见 docs/ARCHITECTURE.md） */
export class RecipeRepository {
  readonly #recipes: Recipe[];
  readonly #byId: Map<string, Recipe>;
  readonly #failures: LoadFailure[];
  readonly #equipment: EquipmentList;
  readonly #tagVocabulary: TagVocabulary;

  private constructor(
    recipes: Recipe[],
    failures: LoadFailure[],
    equipment: EquipmentList,
    tagVocabulary: TagVocabulary
  ) {
    this.#recipes = recipes;
    this.#failures = failures;
    this.#equipment = equipment;
    this.#tagVocabulary = tagVocabulary;
    this.#byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  }

  static async load(dataDir: string): Promise<RecipeRepository> {
    // 先读两份词表：菜谱的厨具与 tag 都要按它们校验
    const equipment = await loadEquipmentList(dataDir);
    const tagVocabulary = await loadTagVocabulary(dataDir);
    const { recipes, failures } = await loadRecipesFromDir(
      join(dataDir, "recipes"),
      equipment.tools,
      tagVocabulary.names
    );
    return new RecipeRepository(recipes, failures, equipment, tagVocabulary);
  }

  /** 仅供测试：用内存数据构造仓库 */
  static fromRecipes(
    recipes: Recipe[],
    failures: LoadFailure[] = [],
    equipment: EquipmentList | null = null,
    tagVocabulary: TagVocabulary | null = null
  ): RecipeRepository {
    return new RecipeRepository(
      recipes,
      failures,
      equipment ?? { tools: [], defaultOwned: [], problem: null, warnings: [] },
      tagVocabulary ?? EMPTY_TAG_VOCABULARY
    );
  }

  list(): Recipe[] {
    return this.#recipes;
  }

  get(id: string): Recipe | undefined {
    return this.#byId.get(id);
  }

  failures(): LoadFailure[] {
    return this.#failures;
  }

  equipment(): EquipmentList {
    return this.#equipment;
  }

  tags(): TagVocabulary {
    return this.#tagVocabulary;
  }

  meta(): RecipeMetaResponse {
    const categories = new Set<string>();
    const tags = new Set<string>();

    for (const recipe of this.#recipes) {
      categories.add(recipe.category);
      for (const tag of recipe.tags ?? []) tags.add(tag);
    }

    // tag 顺序跟词表走（而不是字母序），并且只列出真的有菜在用的
    const tagNames = this.#tagVocabulary.names.length > 0
      ? this.#tagVocabulary.names.filter((name) => tags.has(name))
      : [...tags].sort((a, b) => a.localeCompare(b, "zh"));

    return {
      categories: [...categories].sort((a, b) => a.localeCompare(b, "zh")),
      tags: tagNames,
      total: this.#recipes.length,
      equipment: this.#equipment.tools,
      defaultOwned: this.#equipment.defaultOwned,
      equipmentProblem: this.#equipment.problem
    };
  }
}
