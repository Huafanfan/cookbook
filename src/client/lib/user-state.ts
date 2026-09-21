import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { KitchenState, RecipeUserState } from "../../shared/types";
import { fetchUserState, postFavorite, postKitchen, postLike } from "./api";

/**
 * 用户状态（点赞、收藏、我的厨具）的客户端缓存。
 *
 * 服务端是权威（ADR-0003）；本地这份用于**乐观更新**：
 * 点击立刻反映，请求失败则**回滚**并让界面提示 —— 不允许"看起来收藏了其实没保存"。
 */

type StateMap = Record<string, RecipeUserState>;

const EMPTY: RecipeUserState = { likes: 0, favorite: false };

let state: StateMap = {};
let loaded = false;
const listeners = new Set<() => void>();

/** 除点赞/收藏之外的同步状态（CB-008 加入「我的厨具」） */
export interface UserStateStatus {
  /** 服务端全量状态拿到过没有（含 kitchen） */
  loaded: boolean;
  /** 最近一次拉取失败 —— 界面要说清"没同步上"，不能静默用默认值 */
  syncFailed: boolean;
  /** 「我的厨具」；从未设置过时为 null（此时用服务端的 defaultOwned） */
  kitchen: KitchenState | null;
}

let status: UserStateStatus = { loaded: false, syncFailed: false, kitchen: null };

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

function getStatus(): UserStateStatus {
  return status;
}

/** 首次挂载时拉一次全量（371 道菜的状态很小）；厨具也在这份里（CB-008） */
export function useLoadUserState(): void {
  useEffect(() => {
    if (loaded) return;
    loaded = true;
    fetchUserState()
      .then((response) => {
        state = response.recipes;
        status = { loaded: true, syncFailed: false, kitchen: response.kitchen };
        emit();
      })
      .catch(() => {
        // 允许下次挂载再试；同时标记"没同步上"，让厨具面板能说清
        loaded = false;
        status = { ...status, syncFailed: true };
        emit();
      });
  }, []);
}

export function useUserState(): StateMap {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 同步状态（是否已加载 / 最近是否失败 / 我的厨具） */
export function useUserStateStatus(): UserStateStatus {
  return useSyncExternalStore(subscribe, getStatus, getStatus);
}

/**
 * 保存「我的厨具」（CB-008）：乐观更新 + 失败回滚。
 *
 * 不做成 hook：它在 useMyKitchen 与迁移逻辑里都要用，且直接改模块级状态。
 *
 * @returns 是否真的存到服务端了
 */
export async function saveKitchen(tools: string[]): Promise<boolean> {
  const before = status;
  status = { ...status, kitchen: { tools } }; // 乐观：界面立刻变
  emit();

  try {
    const saved = await postKitchen(tools);
    status = { ...status, kitchen: saved }; // 以服务端归一化后的值为准
    emit();
    return true;
  } catch {
    status = before; // 回滚
    emit();
    return false;
  }
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
