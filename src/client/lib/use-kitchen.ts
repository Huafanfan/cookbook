import { useCallback, useEffect, useMemo, useRef } from "react";

import { keepKnownTools } from "../../shared/equipment";
import { clearMyTools, readMyTools } from "./kitchen";
import { saveKitchen, useLoadUserState, useUserStateStatus } from "./user-state";

export interface MyKitchen {
  /** 当前使用的厨具清单（服务端从未设置过时为服务端的 defaultOwned） */
  tools: string[];
  /** 用户是否设置过（false = 用的是默认值） */
  configured: boolean;
  /**
   * 用更新函数修改并**保存到服务端**（乐观更新，失败回滚）。
   *
   * 传函数而不是"新的数组"：同一个事件循环里连续调用两次时，
   * 第二次会基于第一次的结果计算，不会互相覆盖。
   *
   * @returns 是否真的保存成功
   */
  apply: (updater: (tools: string[]) => string[]) => Promise<boolean>;
  /** 服务端状态没同步上（此时用默认清单兜底，面板要说清楚） */
  syncFailed: boolean;
}

export interface MyKitchenOptions {
  /** 厨具词表（来自 /api/meta）；空数组表示词表未载入 */
  available: string[];
  /** 未设置过时默认勾选的项（来自 /api/meta） */
  defaultOwned: string[];
}

/** 本地旧值只迁移一次：列表页与详情页各有一个 hook 实例，别重复上传 */
let migrationDone = false;

/**
 * "我的厨具"状态（CB-008：存在服务端，两口子共用一份）。
 *
 * - 只保留词表里的厨具：词表删掉某件后，已存的那件会被忽略。
 * - 服务端没有值但在浏览器里发现旧版本留下的值 → **自动迁移一次**（上传成功后清掉本地键）。
 */
export function useMyKitchen({ available, defaultOwned }: MyKitchenOptions): MyKitchen {
  // 厨具现在随用户状态一起下发：进这个 hook 就拉一次全量
  // （列表页也需要 —— 卡片上的缺件标记要用同一份清单）
  useLoadUserState();
  const status = useUserStateStatus();

  const stored = status.kitchen?.tools ?? null;
  const effective = useMemo(
    () => keepKnownTools(stored ?? defaultOwned, available),
    [stored, defaultOwned, available]
  );

  /** 始终指向最新的厨具列表，避免连续调用读到同一个旧值 */
  const latest = useRef(effective);
  useEffect(() => {
    latest.current = effective;
  }, [effective]);

  // 迁移（CB-008）：服务端从没设置过 + 浏览器里有旧值 → 上传一次。
  // 必须等词表载入再传（否则词表外的名字会被服务端拒掉）。
  useEffect(() => {
    if (migrationDone || !status.loaded || status.kitchen !== null) return;
    if (available.length === 0) return;

    const local = readMyTools();
    if (local === null) return;

    const tools = keepKnownTools(local, available);
    // 本地有值、但一件都不在当前词表里 → 没什么可迁移的
    if (local.length > 0 && tools.length === 0) {
      migrationDone = true;
      return;
    }

    migrationDone = true;
    void saveKitchen(tools).then((ok) => {
      if (ok) clearMyTools();
      else migrationDone = false; // 上传失败：留着本地值，下次打开再试
    });
  }, [status.loaded, status.kitchen, available]);

  const apply = useCallback(
    (updater: (tools: string[]) => string[]): Promise<boolean> => {
      const next = keepKnownTools(updater(latest.current), available);
      latest.current = next;
      return saveKitchen(next);
    },
    [available]
  );

  return {
    tools: effective,
    configured: stored !== null,
    apply,
    syncFailed: status.syncFailed
  };
}
