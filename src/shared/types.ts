/**
 * 菜品数据类型定义。
 *
 * 这里是前端与后端共享的**类型**来源；运行时校验在
 * `src/server/lib/schema.ts`（zod）里，两者必须保持一致。
 */

/** 1 简单 / 2 适中 / 3 有点挑战 */
export type Difficulty = 1 | 2 | 3;

export interface Ingredient {
  /** 食材名，搜索"鸡蛋"靠它命中 */
  name: string;
  /** 数值优先（便于后续做份量换算）；"适量""少许"用字符串 */
  amount?: number | string;
  /** 个 / g / ml / 勺 / 根 / 片 */
  unit?: string;
  /** 主料（默认）/ 调料 / 腌料 / 汤底 */
  group?: string;
  /** 处理说明："切滚刀块""提前泡发" */
  note?: string;
}

export interface Step {
  /** 一句话说清操作，写得短 */
  text: string;
  /** 可选小标题："调汁""收汁" */
  title?: string;
  /** 这一步大概要多久（分钟），**包含等待时间**（腌制 10 分钟就写 10）；同时是详情页一键计时的默认时长 */
  minutes?: number;
  /** 火候："大火""中火""小火""中小火" */
  heat?: string;
  /** 该步骤的小提醒 */
  tip?: string;
}

export interface Recipe {
  id: string;
  name: string;
  aliases?: string[];
  category: string;
  tags?: string[];
  summary?: string;
  difficulty: Difficulty;
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  /** 需要的厨具，如 ["炒锅", "锅铲"]；不填则不显示。语义：这些**全部**要有 */
  equipment?: string[];
  /** 可选：每个子数组是"任选其一"的一组厨具，如 [["炒锅", "砂锅", "空气炸锅"]] */
  equipmentAlternatives?: string[][];
  ingredients: Ingredient[];
  steps: Step[];
  tips?: string[];
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 列表页用的轻量结构：不含食材明细与步骤，避免列表接口过大 */
export interface RecipeSummary {
  id: string;
  name: string;
  category: string;
  tags: string[];
  summary?: string;
  difficulty: Difficulty;
  servings: number;
  totalMinutes?: number;
  /** 食材名列表，用于列表页展示"命中食材" */
  ingredientNames: string[];
  /** 必需厨具（列表页用于标记"缺件"）；缺省为空数组 */
  equipment: string[];
  /** 可替代厨具组；缺省为空数组 */
  equipmentAlternatives: string[][];
  /** 封面图 URL；无图时为 null，客户端显示占位图（CB-007） */
  coverImage: string | null;
  /** 点赞数（服务端用户状态，CB-005） */
  likes: number;
  /** 是否收藏（服务端用户状态，CB-005） */
  favorite: boolean;
}

/**
 * 图片信息（CB-007）：由服务端扫描 `data/images/<recipe-id>/` **推导**得出，
 * 不来自菜谱 JSON（图片不写进 JSON，见 docs/DATA_MODEL.md §4 与 ADR-0002/ADR-0004）。
 */
export interface RecipeMedia {
  /** 封面图 URL（`/images/<id>/cover.jpg`）；无图时 null */
  coverImage: string | null;
  /** 与 `steps` **等长**：下标 i 是第 i+1 步的配图 URL，无图那项为 null */
  stepImages: (string | null)[];
}

/** 详情接口返回：菜谱文件字段 + 图片信息 */
export interface RecipeDetail extends Recipe, RecipeMedia {
  /**
   * 当前**文件字节**的 SHA-256（CB-009 并发守卫）。
   *
   * 保存时必须原样回传 —— 与磁盘不一致就是 409（不静默覆盖）。
   */
  revision: string;
}

/** 修改记录的来源（CB-009） */
export type RecipeHistorySource = "manual" | "llm-merge" | "import" | "restore";

/**
 * 一次保存的修改记录（CB-009），记录的是**被替换掉的那一版**。
 *
 * `historyId` 是历史记录自己的 ID（独立于内容 `revision`：同一内容可以被保存多次）。
 */
export interface RecipeHistoryEntry {
  historyId: string;
  recipeId: string;
  savedAt: string;
  source: RecipeHistorySource;
  note?: string;
  /** 被替换那一版的 revision */
  beforeRevision: string;
  /** 替换后的新 revision；未完成/失败时为 null */
  afterRevision: string | null;
  /** pending = 快照已落盘但结果未确认；replaced = 替换成功；failed = 替换失败 */
  outcome: "pending" | "replaced" | "failed";
}

/** 单条历史记录（含被替换的整份内容） */
export interface RecipeHistoryRecord extends RecipeHistoryEntry {
  beforeRecipe: Recipe;
}

/** `GET /api/recipes/:id/history` 的响应（倒序） */
export interface RecipeHistoryListResponse {
  items: RecipeHistoryEntry[];
}

/**
 * 单道菜的用户状态（点赞、收藏）。
 *
 * **这是用户数据，不是菜谱内容**：存在 `data/user-state.json`（与菜谱文件分开），
 * 由应用运行期写入 —— 本项目唯一的写操作，边界见 ADR-0003。
 */
export interface RecipeUserState {
  likes: number;
  favorite: boolean;
  /** 最后一次变更时间（ISO） */
  updatedAt?: string;
}

/** `GET /api/user-state` 的响应 */
export interface UserStateResponse {
  recipes: Record<string, RecipeUserState>;
  /** 「我的厨具」（CB-008）；从未设置过时为 null（此时用 equipment.json 的 defaultOwned） */
  kitchen: KitchenState | null;
}

/**
 * 「我的厨具」（CB-008）。
 *
 * 与点赞/收藏同一份文件（`data/user-state.json`）、同一条写路径（[ADR-0003](../docs/decisions/ADR-0003-write-operations-user-state.md)）。
 * `tools: []` 表示用户**明确全不选**，与"从未设置过"（`kitchen` 字段缺失）不同。
 */
export interface KitchenState {
  /** 厨具名（只能是词表里的值；去重、顺序按词表） */
  tools: string[];
  /** 最后一次变更时间（ISO） */
  updatedAt?: string;
}

export interface RecipeListResponse {
  total: number;
  items: RecipeSummary[];
  /** 服务端在读取数据时跳过的坏文件（便于前端提示） */
  skipped: string[];
}

export interface RecipeMetaResponse {
  categories: string[];
  tags: string[];
  total: number;
  /** 厨具权威词表（来自 data/equipment.json）；空数组表示未载入 */
  equipment: string[];
  /** 未设置过"我的厨具"时默认勾选的项 */
  defaultOwned: string[];
  /** 词表载入失败的原因（null = 正常） */
  equipmentProblem: string | null;
}

export interface HealthResponse {
  status: "ok";
  recipes: number;
}

export interface SearchParams {
  q?: string;
  category?: string;
  tag?: string;
}
