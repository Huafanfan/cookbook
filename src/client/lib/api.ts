import type {
  Recipe,
  RecipeListResponse,
  RecipeMetaResponse,
  SearchParams
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

export function fetchRecipe(id: string, signal?: AbortSignal): Promise<Recipe> {
  return getJson<Recipe>(`/api/recipes/${encodeURIComponent(id)}`, signal);
}

export function fetchMeta(signal?: AbortSignal): Promise<RecipeMetaResponse> {
  return getJson<RecipeMetaResponse>("/api/meta", signal);
}
