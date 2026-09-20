import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { RecipeUserState } from "../../shared/types";
import { fetchUserState, postFavorite, postLike } from "./api";

/**
 * 用户状态（点赞、收藏）的客户端缓存。
 *
 * 服务端是权威（ADR-0003）；本地这份用于**乐观更新**：
 * 点击立刻反映，请求失败则**回滚**并让界面提示 —— 不允许"看起来收藏了其实没保存"。
 */

type StateMap = Record<string, RecipeUserState>;

const EMPTY: RecipeUserState = { likes: 0, favorite: false };

let state: StateMap = {};
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): StateMap {
  return state;
}

/** 首次挂载时拉一次全量（371 道菜的状态很小） */
export function useLoadUserState(): void {
  useEffect(() => {
    if (loaded) return;
    loaded = true;
    fetchUserState()
      .then((response) => {
        state = response.recipes;
        emit();
      })
      .catch(() => {
        loaded = false;
      });
  }, []);
}

export function useUserState(): StateMap {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function userStateOf(map: StateMap, id: string): RecipeUserState {
  return map[id] ?? EMPTY;
}

export interface MutationResult {
  ok: boolean;
}

async function run(
  id: string,
  optimistic: RecipeUserState,
  request: () => Promise<RecipeUserState>
): Promise<MutationResult> {
  const before = state;
  state = { ...state, [id]: optimistic };
  emit();

  try {
    const next = await request();
    state = { ...state, [id]: next };
    emit();
    return { ok: true };
  } catch {
    state = before; // 回滚
    emit();
    return { ok: false };
  }
}

/** 点赞 +1 / -1（下限 0） */
export function useLike(id: string): (delta: 1 | -1) => Promise<MutationResult> {
  const map = useUserState();
  const current = userStateOf(map, id);

  return useCallback(
    (delta: 1 | -1) =>
      run(id, { ...current, likes: Math.max(0, current.likes + delta) }, () => postLike(id, delta)),
    [id, current]
  );
}

/** 收藏开关 */
export function useFavorite(id: string): (favorite: boolean) => Promise<MutationResult> {
  const map = useUserState();
  const current = userStateOf(map, id);

  return useCallback(
    (favorite: boolean) => run(id, { ...current, favorite }, () => postFavorite(id, favorite)),
    [id, current]
  );
}
