import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  Recipe,
  RecipeDetail,
  RecipeHistoryEntry,
  RecipeHistoryRecord,
  RecipeHistorySource,
  RecipeMedia,
  RecipeMetaResponse
} from "../../shared/types.js";
import { formatContentIssues, hasBlockingIssues, lintRecipeContent } from "../lib/content-lint.js";
import { loadEquipmentList, type EquipmentList } from "../lib/equipment.js";
import { buildMedia, matchImageFiles } from "../lib/image-media.js";
import {
  historyFileName,
  isHistoryId,
  newHistoryId,
  revisionOfBytes,
  serializeRecipe
} from "../lib/recipe-revision.js";
import { loadTagVocabulary, EMPTY_TAG_VOCABULARY, type TagVocabulary } from "../lib/tags.js";
import { createRecipeSchema, formatIssueList, formatIssues } from "../lib/schema.js";

export interface LoadFailure {
  /** 文件名，例如 `bad-recipe.json` */
  file: string;
  /** 失败原因，可直接打印给使用者定位问题 */
  reason: string;
}

export interface LoadResult {
  recipes: Recipe[];
  failures: LoadFailure[];
  /** 每道菜谱**文件字节**的 revision（CB-009 并发守卫用） */
  revisions: Map<string, string>;
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
        failures: [{ file: recipesDir, reason: "菜谱目录不存在" }],
        revisions: new Map()
      };
    }
    throw error;
  }

  const jsonFiles = fileNames.filter((name) => name.endsWith(".json")).sort();
  const recipes: Recipe[] = [];
  const failures: LoadFailure[] = [];
  const revisions = new Map<string, string>();
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
    // revision 从这里算：就是**读进来的那份字节**的哈希，与磁盘一一对应
    revisions.set(parsed.data.id, revisionOfBytes(Buffer.from(raw, "utf8")));
    recipes.push(parsed.data);
  }

  return { recipes, failures, revisions };
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

/* ---------- 写入协议的类型与错误（CB-009） ---------- */

/** 保存请求（路由已做请求形状校验；这里做字段级校验与写盘） */
export interface SaveRecipeInput {
  /** URL 里的 id；**必须与 recipe.id 一致**（不能靠改 id 另存一道菜） */
  id: string;
  /** 客户端提交的整份菜谱（未校验） */
  recipe: Record<string, unknown>;
  /** 客户端加载时拿到的 revision（并发守卫） */
  baseRevision: string;
  /** 修改来源（默认 manual） */
  source?: RecipeHistorySource;
  /** 一句话说明（可选） */
  note?: string;
}

export interface SaveRecipeResult {
  recipe: Recipe;
  revision: string;
  /** 非致命问题（如历史状态没能回写）；调用方应打日志 */
  warnings: string[];
}

/** 保存时版本不一致（路由 → 409）：带上服务端当前版本供前端选择 */
export class RecipeRevisionConflictError extends Error {
  readonly current: Recipe | null;
  readonly currentRevision: string;

  constructor(current: Recipe | null, currentRevision: string) {
    super("菜谱已被改动（revision 不一致）");
    this.name = "RecipeRevisionConflictError";
    this.current = current;
    this.currentRevision = currentRevision;
  }
}

/** 保存内容不合法（路由 → 400）：zod 或内容检查给出的、可定位的问题 */
export class RecipeWriteValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join("; ") || "内容不合法");
    this.name = "RecipeWriteValidationError";
    this.issues = issues;
  }
}

/** 要保存的菜谱不在内存索引里（路由 → 404） */
export class UnknownRecipeError extends Error {
  constructor(id: string) {
    super(`菜谱不存在：${id}`);
    this.name = "UnknownRecipeError";
  }
}

/** 历史列表用：去掉 `beforeRecipe`（列表只给元数据） */
function toHistoryEntry(record: RecipeHistoryRecord): RecipeHistoryEntry {
  const { beforeRecipe, ...entry } = record;
  void beforeRecipe;
  return entry;
}

/** `updatedAt` 用日期（与既有数据一致：`YYYY-MM-DD`） */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 唯一的数据访问入口：其他模块不直接读文件（见 docs/ARCHITECTURE.md） */
export class RecipeRepository {
  readonly #recipes: Recipe[];
  readonly #byId: Map<string, Recipe>;
  readonly #failures: LoadFailure[];
  readonly #equipment: EquipmentList;
  readonly #tagVocabulary: TagVocabulary;
  readonly #images: ImageScanResult;
  /** 每道菜谱当前文件字节的 revision（并发守卫用） */
  readonly #revisions = new Map<string, string>();
  /** 保存时用的同一份校验规则（含厨具/tag 词表） */
  readonly #recipeSchema: ReturnType<typeof createRecipeSchema>;
  readonly #recipesDir: string;
  readonly #historyDir: string;
  readonly #imagesDir: string;
  /** 每道菜一条保存队列：应用内对同一道菜的写入不会交错（ADR-0005 §1） */
  readonly #writeChains = new Map<string, Promise<unknown>>();

  private constructor(
    recipes: Recipe[],
    failures: LoadFailure[],
    equipment: EquipmentList,
    tagVocabulary: TagVocabulary,
    images: ImageScanResult,
    revisions: Map<string, string>,
    paths: { recipesDir: string; dataDir: string }
  ) {
    this.#recipes = recipes;
    this.#failures = failures;
    this.#equipment = equipment;
    this.#tagVocabulary = tagVocabulary;
    this.#images = images;
    this.#byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    for (const [id, revision] of revisions) this.#revisions.set(id, revision);
    this.#recipeSchema = createRecipeSchema({
      allowedTools: equipment.tools,
      allowedTags: tagVocabulary.names
    });
    this.#recipesDir = paths.recipesDir;
    this.#historyDir = join(paths.dataDir, "history", "recipes");
    this.#imagesDir = join(paths.dataDir, "images");
  }

  static async load(dataDir: string): Promise<RecipeRepository> {
    // 先读两份词表：菜谱的厨具与 tag 都要按它们校验
    const equipment = await loadEquipmentList(dataDir);
    const tagVocabulary = await loadTagVocabulary(dataDir);
    const recipesDir = join(dataDir, "recipes");
    const { recipes, failures, revisions } = await loadRecipesFromDir(
      recipesDir,
      equipment.tools,
      tagVocabulary.names
    );
    // 图片扫描在菜谱载入之后：只需要给已载入的菜谱找图（CB-007）
    const images = await scanRecipeImages(join(dataDir, "images"), recipes);
    return new RecipeRepository(recipes, failures, equipment, tagVocabulary, images, revisions, {
      recipesDir,
      dataDir
    });
  }

  /** 仅供测试：用内存数据构造仓库 */
  static fromRecipes(
    recipes: Recipe[],
    failures: LoadFailure[] = [],
    equipment: EquipmentList | null = null,
    tagVocabulary: TagVocabulary | null = null,
    images: ImageScanResult | null = null,
    /** 测试用：已有菜谱的 revision（保存时要用；真实载入路径会自动填） */
    revisions: Map<string, string> = new Map(),
    /** 测试用：数据目录（决定 recipes/ 与 history/ 的位置） */
    dataDir = "/tmp/cookbook-test-data"
  ): RecipeRepository {
    return new RecipeRepository(
      recipes,
      failures,
      equipment ?? { tools: [], defaultOwned: [], problem: null, warnings: [] },
      tagVocabulary ?? EMPTY_TAG_VOCABULARY,
      images ?? { media: new Map(), admitted: new Set(), warnings: [], missing: true },
      revisions,
      { recipesDir: join(dataDir, "recipes"), dataDir }
    );
  }

  list(): Recipe[] {
    return this.#recipes;
  }

  get(id: string): Recipe | undefined {
    return this.#byId.get(id);
  }

  /** 详情：菜谱文件字段 + 图片信息（CB-007）+ 当前 revision（CB-009 并发守卫） */
  detail(id: string): RecipeDetail | undefined {
    const recipe = this.#byId.get(id);
    if (!recipe) return undefined;

    const media = this.media(id);
    return {
      ...recipe,
      coverImage: media?.coverImage ?? null,
      stepImages: media?.stepImages ?? recipe.steps.map(() => null),
      revision: this.revisionOf(id)
    };
  }

  /** 当前文件字节的 revision（不知道时为 `sha256:unknown`） */
  revisionOf(id: string): string {
    return this.#revisions.get(id) ?? "sha256:unknown";
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

  /* ---------- 写入协议（CB-009，见 ADR-0005） ---------- */

  /**
   * 保存一道菜：整份替换，并留一条历史记录。
   *
   * 顺序（每一步失败都不会留下"半个操作"）：
   * 1. 进**该菜谱的串行队列**（应用内两次保存不会交错）；
   * 2. **重新读盘**并算完整 SHA-256 → 与 `baseRevision` 比对（不一致 → 冲突，不写盘）；
   * 3. zod（含词表）+ 内容检查（content-lint 阻止项）→ 不合法就不写盘；
   * 4. **先写历史快照**（`outcome: pending`）—— 动正文之前保证旧版本已落盘；
   * 5. 原子替换正文（临时文件 → rename）；
   * 6. 更新内存索引与图片信息，最后把历史记录标成 `replaced`（best-effort）。
   *
   * **不保证**外部写者（手工编辑器/脚本/导入）与本次保存互斥：见 ADR-0005 §1 的 TOCTOU 说明。
   */
  saveRecipe(input: SaveRecipeInput): Promise<SaveRecipeResult> {
    return this.#enqueueWrite(input.id, () => this.#saveRecipeNow(input));
  }

  async #saveRecipeNow(input: SaveRecipeInput): Promise<SaveRecipeResult> {
    const { id } = input;
    const current = this.#byId.get(id);
    if (!current) throw new UnknownRecipeError(id);

    const filePath = join(this.#recipesDir, `${id}.json`);

    let diskBytes: Buffer;
    try {
      diskBytes = await readFile(filePath);
    } catch {
      // 文件没了（被外部删除）→ 当冲突处理：本功能不做新建/删除
      throw new RecipeRevisionConflictError(null, "");
    }

    const currentRevision = revisionOfBytes(diskBytes);
    if (currentRevision !== input.baseRevision) {
      throw new RecipeRevisionConflictError(
        this.#parsePossibly(diskBytes) ?? current,
        currentRevision
      );
    }

    const parsed = this.#recipeSchema.safeParse(input.recipe);
    if (!parsed.success) throw new RecipeWriteValidationError(formatIssueList(parsed.error));
    if (parsed.data.id !== id) {
      throw new RecipeWriteValidationError([
        `id 不能改（URL 里是 ${id}，body 里是 ${String(parsed.data.id)}）`
      ]);
    }

    const contentIssues = lintRecipeContent(parsed.data);
    if (hasBlockingIssues(contentIssues)) {
      throw new RecipeWriteValidationError(formatContentIssues(id, contentIssues));
    }

    // 以**磁盘上的原始 JSON** 为底，用校验后的字段覆盖：
    // zod 默认会静默丢掉 schema 之外的键（例如 CB-010 的 sourceRef），不能把它删了
    const currentRaw = this.#parseRaw(diskBytes);
    const next = {
      ...(currentRaw ?? {}),
      ...parsed.data,
      updatedAt: today()
    } as Recipe;

    const nextBytes = Buffer.from(serializeRecipe(next), "utf8");
    const nextRevision = revisionOfBytes(nextBytes);

    const savedAt = new Date().toISOString();
    const entry: RecipeHistoryRecord = {
      historyId: newHistoryId(new Date(savedAt)),
      recipeId: id,
      savedAt,
      source: input.source ?? "manual",
      ...(input.note ? { note: input.note } : {}),
      beforeRevision: currentRevision,
      afterRevision: null,
      outcome: "pending",
      beforeRecipe: current
    };

    // 1) 历史快照先落盘
    const historyFile = await this.#writeHistory(entry);

    // 2) 原子替换正文
    try {
      const temp = `${filePath}.tmp`;
      await writeFile(temp, nextBytes);
      await rename(temp, filePath);
    } catch (error) {
      // 正文没变；把这条历史标成失败（best-effort，失败也保留 pending）
      await this.#setHistoryOutcome(historyFile, entry, "failed").catch(() => undefined);
      throw error;
    }

    // 3) 内存索引 + 图片信息（步骤数变了，stepImages 要重算）
    this.#replaceInMemory(id, next, nextRevision);
    const warnings = await this.#recomputeMedia(id, next.steps.length);

    // 4) 历史状态回写（best-effort：正文已保存成功，这里失败不回滚）
    try {
      await this.#setHistoryOutcome(historyFile, entry, "replaced", nextRevision);
    } catch (error) {
      warnings.push(
        `历史记录 ${entry.historyId} 的状态没能回写（仍是 pending）：${(error as Error).message}`
      );
    }

    return { recipe: next, revision: nextRevision, warnings };
  }

  /** 历史列表（**按 `savedAt` 倒序**）；坏记录跳过 */
  async listHistory(id: string): Promise<RecipeHistoryEntry[]> {
    const dir = join(this.#historyDir, id);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }

    const records: RecipeHistoryRecord[] = [];
    for (const name of names.filter((file) => file.endsWith(".json"))) {
      const record = await this.#readHistoryFile(join(dir, name));
      if (record) records.push(record);
    }

    // 不要按文件名排序：`historyId` 的时间戳只到秒，同一秒的两次保存要靠随机后缀区分，
    // 那种顺序是随机的。记录里的 `savedAt` 是带毫秒的 ISO 时间，才是可信的时间。
    records.sort((a, b) => {
      if (a.savedAt !== b.savedAt) return a.savedAt < b.savedAt ? 1 : -1;
      return a.historyId < b.historyId ? 1 : -1;
    });

    return records.map(toHistoryEntry);
  }

  /** 单条历史（含被替换的整份内容）；找不到返回 null */
  async readHistory(id: string, historyId: string): Promise<RecipeHistoryRecord | null> {
    if (!isHistoryId(historyId)) return null; // 挡住用奇怪字符串拼路径

    const dir = join(this.#historyDir, id);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return null;
    }

    const name = names.find(
      (file) => file.startsWith(`${historyId}-`) && file.endsWith(".json")
    );
    return name ? await this.#readHistoryFile(join(dir, name)) : null;
  }

  /** 同一道菜的保存排队执行（不同菜互不影响） */
  #enqueueWrite<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#writeChains.get(id) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.then(
      () => undefined,
      () => undefined
    );
    this.#writeChains.set(id, settled);
    void settled.then(() => {
      if (this.#writeChains.get(id) === settled) this.#writeChains.delete(id);
    });
    return run;
  }

  /** 历史快照落盘（`wx` 独占创建：撞名就换个 historyId 重试） */
  async #writeHistory(entry: RecipeHistoryRecord): Promise<string> {
    const dir = join(this.#historyDir, entry.recipeId);
    await mkdir(dir, { recursive: true });

    let candidate = entry;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const file = join(dir, historyFileName(candidate.historyId, candidate.source));
      try {
        await writeFile(file, `${JSON.stringify(candidate, null, 2)}\n`, { flag: "wx" });
        return file;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        candidate = { ...candidate, historyId: newHistoryId() };
      }
    }

    throw new Error("历史文件名连续冲突，放弃保存");
  }

  /** 回写历史记录的 outcome（正文替换之后） */
  async #setHistoryOutcome(
    file: string,
    entry: RecipeHistoryRecord,
    outcome: RecipeHistoryRecord["outcome"],
    afterRevision?: string
  ): Promise<void> {
    const next: RecipeHistoryRecord = {
      ...entry,
      outcome,
      ...(afterRevision ? { afterRevision } : {})
    };
    await writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
  }

  #replaceInMemory(id: string, recipe: Recipe, revision: string): void {
    this.#byId.set(id, recipe);
    const index = this.#recipes.findIndex((item) => item.id === id);
    if (index >= 0) this.#recipes[index] = recipe;
    else this.#recipes.push(recipe);
    this.#revisions.set(id, revision);
  }

  /**
   * 重算某道菜的图片信息（保存后调用）。
   *
   * `step-N.jpg` 是**按位置**命名的：步骤数变小后，越界的步骤图自然不再被采纳
   * （`buildMedia` 会忽略并告警），白名单也要按新的集合重建。
   */
  async #recomputeMedia(id: string, stepCount: number): Promise<string[]> {
    let files: Dirent[] = [];
    try {
      files = await readdir(join(this.#imagesDir, id), { withFileTypes: true });
    } catch {
      files = [];
    }

    const names = files
      .filter((file) => file.isFile() || file.isSymbolicLink())
      .map((file) => file.name);
    const built = buildMedia(id, matchImageFiles(names), stepCount);

    for (const key of [...this.#images.admitted]) {
      if (key.startsWith(`${id}/`)) this.#images.admitted.delete(key);
    }
    for (const file of built.files) this.#images.admitted.add(`${id}/${file}`);
    if (built.files.length > 0) this.#images.media.set(id, built.media);
    else this.#images.media.delete(id);

    return built.warnings.map((warning) => `images/${id}/：${warning}`);
  }

  async #readHistoryFile(file: string): Promise<RecipeHistoryRecord | null> {
    try {
      const value: unknown = JSON.parse(await readFile(file, "utf8"));
      if (typeof value !== "object" || value === null) return null;

      const record = value as Partial<RecipeHistoryRecord>;
      if (typeof record.historyId !== "string" || typeof record.savedAt !== "string") return null;
      if (typeof record.beforeRecipe !== "object" || record.beforeRecipe === null) return null;

      return {
        historyId: record.historyId,
        recipeId: typeof record.recipeId === "string" ? record.recipeId : "",
        savedAt: record.savedAt,
        source: (record.source ?? "manual") as RecipeHistorySource,
        ...(typeof record.note === "string" ? { note: record.note } : {}),
        beforeRevision: typeof record.beforeRevision === "string" ? record.beforeRevision : "",
        afterRevision: typeof record.afterRevision === "string" ? record.afterRevision : null,
        outcome:
          record.outcome === "replaced" || record.outcome === "failed" ? record.outcome : "pending",
        beforeRecipe: record.beforeRecipe as Recipe
      };
    } catch {
      return null;
    }
  }

  #parseRaw(bytes: Buffer): Record<string, unknown> | null {
    try {
      const value: unknown = JSON.parse(bytes.toString("utf8"));
      return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  #parsePossibly(bytes: Buffer): Recipe | null {
    const raw = this.#parseRaw(bytes);
    if (!raw) return null;
    const parsed = this.#recipeSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
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
