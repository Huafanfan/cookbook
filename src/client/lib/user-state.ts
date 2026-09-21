import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { KitchenState, RecipeUserState } from "../../shared/types";
import { fetchUserState, initKitchen, postFavorite, postKitchen, postLike } from "./api";
import { createKitchenSync, type KitchenSync, type MigrateOutcome } from "./kitchen-sync";

/**
 * 用户状态（点赞、收藏、我的厨具）的客户端缓存。
 *
 * 服务端是权威（ADR-0003）；本地这份用于**乐观更新**：
 * 点击立刻反映，请求失败则**回滚**并让界面提示 —— 不允许"看起来收藏了其实没保存"。
 *
 * 「我的厨具」的时序（并发保存、回滚、陈旧拉取、迁移竞态）在
 * `kitchen-sync.ts` 里单独实现并单独测试；这里只做适配。
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
  /** 迁移旧本地值没能上传成功（本地键继续留着，下次打开再试） */
  migrateFailed: boolean;
  /** 「我的厨具」；从未设置过时为 null（此时用服务端的 defaultOwned） */
  kitchen: KitchenState | null;
}

function initialStatus(): UserStateStatus {
  return { loaded: false, syncFailed: false, migrateFailed: false, kitchen: null };
}

let status: UserStateStatus = initialStatus();

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

/** 厨具同步器（单一写队列 + 已确认值）；它的快照变化映射到 `status.kitchen` */
function makeKitchenSync(): KitchenSync {
  const sync = createKitchenSync({ replace: postKitchen, initialize: initKitchen });

  sync.subscribe(() => {
    status = { ...status, kitchen: sync.getSnapshot().kitchen };
    emit();
  });

  return sync;
}

let kitchenSync = makeKitchenSync();

/** 首次挂载时拉一次全量（371 道菜的状态很小）；厨具也在这份里（CB-008） */
export function useLoadUserState(): void {
  useEffect(() => {
    if (loaded) return;
    loaded = true;

    const revisionAtRequest = kitchenSync.revision();

    fetchUserState()
      .then((response) => {
        state = response.recipes;
        status = { ...status, loaded: true, syncFailed: false };
        emit();
        // 拉取期间若已有写入落地，hydrate 会丢弃这份数据（服务端已有值，
        // 迁移那边也由 /api/kitchen/init 的原子判定兜住）
        kitchenSync.hydrate(response.kitchen, revisionAtRequest);
      })
      .catch(() => {
        loaded = false; // 允许下次挂载再试
        status = { ...status, syncFailed: true };
        emit();
      });
  }, []);
}

export function useUserState(): StateMap {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 同步状态（是否已加载 / 最近是否失败 / 我的厨具 / 迁移是否失败） */
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
export function saveKitchen(tools: string[]): Promise<boolean> {
  return kitchenSync.save(tools);
}

/**
 * 迁移旧浏览器本地值（CB-008）：**只在服务端尚未设置过时**写入。
 *
 * 走 `/api/kitchen/init`（服务端队列内原子判定），不是"先 GET 再 POST"。
 */
export async function migrateKitchen(tools: string[]): Promise<MigrateOutcome> {
  const outcome = await kitchenSync.migrate(tools);

  if (outcome === "failed") {
    status = { ...status, migrateFailed: true };
    emit();
  }

  return outcome;
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

/**
 * **仅供测试**：把模块级状态恢复成初始值。
 *
 * 组件测试必须靠它在用例之间隔离，否则用例会依赖执行顺序（见
 * `docs/verification/current-review/REVIEW.md` P2-5）。业务代码不得调用。
 */
export function __resetUserStateForTests(): void {
  state = {};
  loaded = false;
  status = initialStatus();
  kitchenSync = makeKitchenSync();
}
