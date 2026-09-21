import type {
  KitchenState,
  RecipeDetail,
  RecipeListResponse,
  RecipeMetaResponse,
  RecipeUserState,
  SearchParams,
  UserStateResponse
} from "../../shared/types";

/** 带 HTTP 状态码的错误，便于页面区分 404 与一般故障 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(status === 404 ? "没有找到这道菜" : `请求失败（HTTP ${status}）`);
    this.name = "ApiError";
    this.status = status;
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw new ApiError(response.status);
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

/** 写操作（本项目唯一的三个）：失败时抛 ApiError，由调用方回滚界面 */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new ApiError(response.status);
  return (await response.json()) as T;
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
