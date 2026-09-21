import type {
  KitchenState,
  Recipe,
  RecipeDetail,
  RecipeHistoryListResponse,
  RecipeHistoryRecord,
  RecipeListResponse,
  RecipeMetaResponse,
  RecipeUserState,
  SearchParams,
  UserStateResponse
} from "../../shared/types";

/** 带 HTTP 状态码与服务端错误体的错误，便于页面区分 404 / 400 / 409 等 */
export class ApiError extends Error {
  readonly status: number;
  /** 服务端返回的错误体（如 `issues` / `current` / `currentRevision`），可能为空 */
  readonly payload: unknown;

  constructor(status: number, payload: unknown = null) {
    super(status === 404 ? "没有找到这道菜" : `请求失败（HTTP ${status}）`);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

/** 服务端错误体里的 `issues`（字段级问题）若存在就取出来 */
export function issuesOf(error: ApiError): string[] {
  const payload = error.payload as { issues?: unknown } | null;
  const issues = payload?.issues;
  return Array.isArray(issues) ? issues.filter((item): item is string => typeof item === "string") : [];
}

async function failure(response: Response): Promise<ApiError> {
  const payload: unknown = await response.json().catch(() => null);
  return new ApiError(response.status, payload);
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw await failure(response);
  }

  return (await response.json()) as T;
}

export function buildQuery(params: SearchParams): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (params.tag) search.set("tag", params.tag);
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function fetchRecipes(
  params: SearchParams,
  signal?: AbortSignal
): Promise<RecipeListResponse> {
  return getJson<RecipeListResponse>(`/api/recipes${buildQuery(params)}`, signal);
}

/** 详情 = 菜谱文件字段 + 图片信息（CB-007） */
export function fetchRecipe(id: string, signal?: AbortSignal): Promise<RecipeDetail> {
  return getJson<RecipeDetail>(`/api/recipes/${encodeURIComponent(id)}`, signal);
}

export function fetchMeta(signal?: AbortSignal): Promise<RecipeMetaResponse> {
  return getJson<RecipeMetaResponse>("/api/meta", signal);
}

/** 写操作：失败时抛 ApiError（带错误体），由调用方回滚界面 */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw await failure(response);
  return (await response.json()) as T;
}

export interface SaveRecipePayload {
  /** 整份菜谱；`Recipe`（从修改记录里拿到的旧版）与表单拼出的对象都可以 */
  recipe: Record<string, unknown> | Recipe;
  /** 客户端加载时拿到的 revision（并发守卫；不一致 → 409） */
  baseRevision: string;
  note?: string;
  source?: "manual" | "restore";
}

/** 保存菜谱（CB-009）。网络中断时 fetch 会 reject（结果未确认，页面要如实提示） */
export async function saveRecipe(
  id: string,
  payload: SaveRecipePayload
): Promise<{ recipe: RecipeDetail; revision: string }> {
  const response = await fetch(`/api/recipes/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw await failure(response);
  return (await response.json()) as { recipe: RecipeDetail; revision: string };
}

/** 修改记录列表（倒序，只有元数据） */
export function fetchHistory(id: string, signal?: AbortSignal): Promise<RecipeHistoryListResponse> {
  return getJson<RecipeHistoryListResponse>(
    `/api/recipes/${encodeURIComponent(id)}/history`,
    signal
  );
}

/** 某一条修改记录（含被替换掉的整份内容，供查看与恢复） */
export function fetchHistoryRecord(
  id: string,
  historyId: string,
  signal?: AbortSignal
): Promise<RecipeHistoryRecord> {
  return getJson<RecipeHistoryRecord>(
    `/api/recipes/${encodeURIComponent(id)}/history/${encodeURIComponent(historyId)}`,
    signal
  );
}

export function fetchUserState(signal?: AbortSignal): Promise<UserStateResponse> {
  return getJson<UserStateResponse>("/api/user-state", signal);
}

export function postLike(id: string, delta: 1 | -1): Promise<RecipeUserState> {
  return postJson<RecipeUserState>(`/api/recipes/${encodeURIComponent(id)}/like`, { delta });
}

export function postFavorite(id: string, favorite: boolean): Promise<RecipeUserState> {
  return postJson<RecipeUserState>(`/api/recipes/${encodeURIComponent(id)}/favorite`, {
    favorite
  });
}

/** 保存「我的厨具」（CB-008）；服务端返回**归一化后**的存储值 */
export function postKitchen(tools: string[]): Promise<KitchenState> {
  return postJson<KitchenState>("/api/kitchen", { tools });
}

/**
 * 迁移专用：**仅当服务端尚未设置过**时写入厨具（服务端队列内原子判定）。
 *
 * `created: false` 表示服务端已有配置（可能是另一台设备刚配好的）—— 这时**不能覆盖**。
 */
export function initKitchen(
  tools: string[]
): Promise<{ kitchen: KitchenState; created: boolean }> {
  return postJson<{ kitchen: KitchenState; created: boolean }>("/api/kitchen/init", { tools });
}
