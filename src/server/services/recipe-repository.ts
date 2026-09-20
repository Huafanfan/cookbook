import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { Recipe, RecipeDetail, RecipeMedia, RecipeMetaResponse } from "../../shared/types.js";
import { loadEquipmentList, type EquipmentList } from "../lib/equipment.js";
import { buildMedia, matchImageFiles } from "../lib/image-media.js";
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

export interface ImageScanResult {
  /** 菜谱 id → 图片信息；没有图片的菜不出现在这里 */
  media: Map<string, RecipeMedia>;
  /**
   * 允许对外提供的图片路径（形如 `ke-le-ji-chi/cover.jpg`），供图片路由做白名单。
   *
   * 这就是扫描**实际认下的**那些文件：认不出的名字、越界的步骤号、没有对应菜谱的目录
   * 都不在里面 —— 路由与 API 因此严格一致（API 不给的地址，路由也不提供）。
   */
  admitted: Set<string>;
  /** 扫描发现的问题（目录名对不上、文件名不认识、步骤号越界…） */
  warnings: string[];
  /** `data/images/` 不存在（还没放图片）：不是错误，只是全部走占位图 */
  missing: boolean;
}

/**
 * 扫描 `data/images/<recipe-id>/`，把存在的封面与步骤图匹配到菜谱（CB-007）。
 *
 * 图片**不写进菜谱 JSON**（ADR-0002）；只认约定文件名（`cover.jpg` / `step-<N>.jpg`），
 * 认不出来的名字告警而不猜。任何失败都只影响图片，不影响菜谱载入与服务启动。
 */
export async function scanRecipeImages(
  imagesDir: string,
  recipes: readonly Recipe[]
): Promise<ImageScanResult> {
  const media = new Map<string, RecipeMedia>();
  const admitted = new Set<string>();
  const warnings: string[] = [];

  let entries: Dirent[];
  try {
    entries = await readdir(imagesDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { media, admitted, warnings, missing: true };
    }
    warnings.push(`图片目录 ${imagesDir} 读取失败：${(error as Error).message}`);
    return { media, admitted, warnings, missing: false };
  }

  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  for (const entry of entries) {
    // 顶层只看目录：.gitkeep / .DS_Store 这类隐藏文件按约定忽略
    if (entry.name.startsWith(".")) continue;

    if (!entry.isDirectory()) {
      warnings.push(`images/${entry.name}：不是目录，已忽略（图片应放在 data/images/<菜谱id>/ 里）`);
      continue;
    }

    const recipe = byId.get(entry.name);
    if (!recipe) {
      warnings.push(`images/${entry.name}/：没有对应的菜谱 id，已忽略`);
      continue;
    }

    let files: Dirent[];
    try {
      files = await readdir(join(imagesDir, entry.name), { withFileTypes: true });
    } catch (error) {
      warnings.push(`images/${entry.name}/：目录读取失败（${(error as Error).message}），已忽略`);
      continue;
    }

    // 符号链接也收（指向图片的链接是合理用法）；链接失效由前端降级成占位图
    const names = files
      .filter((file) => file.isFile() || file.isSymbolicLink())
      .map((file) => file.name);

    const built = buildMedia(entry.name, matchImageFiles(names), recipe.steps.length);
    for (const warning of built.warnings) warnings.push(`images/${entry.name}/：${warning}`);

    for (const file of built.files) admitted.add(`${entry.name}/${file}`);
    if (built.files.length > 0) media.set(entry.name, built.media);
  }

  return { media, admitted, warnings, missing: false };
}

/** 唯一的数据访问入口：其他模块不直接读文件（见 docs/ARCHITECTURE.md） */
export class RecipeRepository {
  readonly #recipes: Recipe[];
  readonly #byId: Map<string, Recipe>;
  readonly #failures: LoadFailure[];
  readonly #equipment: EquipmentList;
  readonly #tagVocabulary: TagVocabulary;
  readonly #images: ImageScanResult;

  private constructor(
    recipes: Recipe[],
    failures: LoadFailure[],
    equipment: EquipmentList,
    tagVocabulary: TagVocabulary,
    images: ImageScanResult
  ) {
    this.#recipes = recipes;
    this.#failures = failures;
    this.#equipment = equipment;
    this.#tagVocabulary = tagVocabulary;
    this.#images = images;
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
    // 图片扫描在菜谱载入之后：只需要给已载入的菜谱找图（CB-007）
    const images = await scanRecipeImages(join(dataDir, "images"), recipes);
    return new RecipeRepository(recipes, failures, equipment, tagVocabulary, images);
  }

  /** 仅供测试：用内存数据构造仓库 */
  static fromRecipes(
    recipes: Recipe[],
    failures: LoadFailure[] = [],
    equipment: EquipmentList | null = null,
    tagVocabulary: TagVocabulary | null = null,
    images: ImageScanResult | null = null
  ): RecipeRepository {
    return new RecipeRepository(
      recipes,
      failures,
      equipment ?? { tools: [], defaultOwned: [], problem: null, warnings: [] },
      tagVocabulary ?? EMPTY_TAG_VOCABULARY,
      images ?? { media: new Map(), admitted: new Set(), warnings: [], missing: true }
    );
  }

  list(): Recipe[] {
    return this.#recipes;
  }

  get(id: string): Recipe | undefined {
    return this.#byId.get(id);
  }

  /** 详情：菜谱文件字段 + 图片信息（CB-007；无图时所有图片字段为 null） */
  detail(id: string): RecipeDetail | undefined {
    const recipe = this.#byId.get(id);
    if (!recipe) return undefined;

    const media = this.media(id);
    return {
      ...recipe,
      coverImage: media?.coverImage ?? null,
      stepImages: media?.stepImages ?? recipe.steps.map(() => null)
    };
  }

  /** 某道菜的图片信息；没有图片时为 null */
  media(id: string): RecipeMedia | null {
    return this.#images.media.get(id) ?? null;
  }

  /** 允许对外提供的图片路径白名单（图片路由用，见 ADR-0004） */
  admittedImages(): Set<string> {
    return this.#images.admitted;
  }

  /** 图片扫描发现的问题（启动时告警用，见 CB-007 §5） */
  imageWarnings(): string[] {
    return this.#images.warnings;
  }

  /** `data/images/` 是否存在（不存在只是“还没有图片”，不是错误） */
  imagesMissing(): boolean {
    return this.#images.missing;
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
