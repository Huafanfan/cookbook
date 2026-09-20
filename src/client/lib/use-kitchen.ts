import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { keepKnownTools } from "../../shared/equipment";
import { readMyTools, writeMyTools } from "./kitchen";

export interface MyKitchen {
  /** 当前使用的厨具清单（从未设置过时为服务端的 defaultOwned） */
  tools: string[];
  /** 用户是否设置过（false = 用的是默认值） */
  configured: boolean;
  /**
   * 用更新函数修改并持久化。
   *
   * 传函数而不是"新的数组"：同一个事件循环里连续调用两次时，
   * 第二次会基于第一次的结果计算，不会互相覆盖。
   *
   * @returns 是否保存成功
   */
  apply: (updater: (tools: string[]) => string[]) => boolean;
}

export interface MyKitchenOptions {
  /** 厨具词表（来自 /api/meta）；空数组表示词表未载入 */
  available: string[];
  /** 未设置过时默认勾选的项（来自 /api/meta） */
  defaultOwned: string[];
}

/**
 * "我的厨具"状态。
 *
 * - 只保留词表里的厨具：词表删掉某件后，本地残留的会被忽略。
 * - 详情页与列表页共用同一个 hook；因为存在浏览器本地，两个页面各持一份实例。
 */
export function useMyKitchen({ available, defaultOwned }: MyKitchenOptions): MyKitchen {
  const [stored, setStored] = useState<string[] | null>(() => readMyTools());

  const effective = useMemo(
    () => keepKnownTools(stored ?? defaultOwned, available),
    [stored, defaultOwned, available]
  );

  /** 始终指向最新的厨具列表，避免连续调用读到同一个旧值 */
  const latest = useRef(effective);
  useEffect(() => {
    latest.current = effective;
  }, [effective]);

  const apply = useCallback(
    (updater: (tools: string[]) => string[]): boolean => {
      const next = keepKnownTools(updater(latest.current), available);
      latest.current = next;
      setStored(next);
      return writeMyTools(next);
    },
    [available]
  );

  return { tools: effective, configured: stored !== null, apply };
}
