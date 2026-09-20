import type {
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
