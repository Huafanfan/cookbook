import type { KitchenState } from "../../shared/types";

/**
 * 「我的厨具」的客户端同步器（CB-008）。
 *
 * 为什么单独一个模块：这段逻辑有**时序**（乐观更新、失败回滚、响应乱序、陈旧拉取、
 * 迁移与保存并发），必须有独立、可重复的测试。做成不依赖 React、可 `createKitchenSync()`
 * 多次实例化的工厂，测试里每个用例一份全新状态，**不依赖模块级单例与用例顺序**。
 *
 * 三条保证：
 * 1. **单一写队列**：保存与迁移共用一条串行链，同一时刻只有一个请求在飞 → 响应不会乱序落地；
 * 2. **已确认值**（`confirmed`）与乐观值分开：失败只回滚到已确认值；若后面还排着更新的意图，
 *    就显示那个意图（不闪回旧值）；
 * 3. **陈旧拉取丢弃**：`hydrate()` 带修订号 + 在飞计数，拉取期间有写入落地就丢弃这份数据
 *    （顺序问题由队列解决，修订号只用来挡陈旧数据）。
 */

export interface KitchenSyncDeps {
  /** 整份替换（`POST /api/kitchen`） */
  replace: (tools: string[]) => Promise<KitchenState>;
  /** 仅当服务端尚未设置过时写入（`POST /api/kitchen/init`，服务端原子判定） */
  initialize: (tools: string[]) => Promise<{ kitchen: KitchenState; created: boolean }>;
}

export interface KitchenSyncSnapshot {
  /** 当前应展示的值（可能是乐观值）；从未设置过为 null */
  kitchen: KitchenState | null;
  /** 队列里还有写操作在跑 */
  saving: boolean;
}

/** 迁移结果：created=本次创建；existing=服务端已有（不覆盖）；failed=请求失败 */
export type MigrateOutcome = "created" | "existing" | "failed";

export interface KitchenSync {
  getSnapshot: () => KitchenSyncSnapshot;
  subscribe: (listener: () => void) => () => void;
  /** 发起全量拉取**之前**取一次，落地时交回给 `hydrate` */
  revision: () => number;
  /** 服务端全量状态落地（含「我的厨具」）；过于陈旧则丢弃 */
  hydrate: (kitchen: KitchenState | null, revisionAtRequest: number) => void;
  /** 保存（乐观 + 失败回滚）；`true` = 真的写到服务端了 */
  save: (tools: string[]) => Promise<boolean>;
  /** 迁移：只在服务端尚未设置过时写入 */
  migrate: (tools: string[]) => Promise<MigrateOutcome>;
}

const sameTools = (a: KitchenState | null, b: KitchenState | null): boolean =>
  a !== null && b !== null && a.tools.length === b.tools.length && a.tools.every((tool, i) => tool === b.tools[i]);

export function createKitchenSync(deps: KitchenSyncDeps): KitchenSync {
  let snapshot: KitchenSyncSnapshot = { kitchen: null, saving: false };
  /** 最后一次**服务端确认**的值（写成功或全量拉取落地时更新） */
  let confirmed: KitchenState | null = null;
  /** 客户端改动次数（写成功一次 +1）；用于丢弃陈旧的拉取结果 */
  let revision = 0;
  /** 最后一次**发起的**保存意图（判断失败时该显示什么） */
  let lastRequested: KitchenState | null = null;
  let pendingWrites = 0;
  let chain: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  const set = (patch: Partial<KitchenSyncSnapshot>): void => {
    snapshot = { ...snapshot, ...patch };
    emit();
  };

  /** 串行队列：同时只有一个写请求在飞 */
  const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
    pendingWrites += 1;
    const run = chain.then(task, task);
    chain = run.then(
      () => {
        pendingWrites -= 1;
      },
      () => {
        pendingWrites -= 1;
      }
    );
    return run;
  };

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    revision: () => revision,

    hydrate: (kitchen, revisionAtRequest) => {
      // 拉取期间已经有写入落地（修订号变了）或还有写在飞 → 这份数据已经落后，丢弃
      if (revision !== revisionAtRequest || pendingWrites > 0) return;

      confirmed = kitchen;
      set({ kitchen });
    },

    save: (tools: string[]) => {
      lastRequested = { tools };
      set({ kitchen: lastRequested, saving: true }); // 乐观：界面立刻变

      return enqueue(async () => {
        try {
          const saved = await deps.replace(tools);
          confirmed = saved;
          revision += 1;
          set({ kitchen: saved, saving: false });
          return true;
        } catch {
          // 回滚到**已确认值**；但这个请求发起之后如果又排了更新的意图，就显示那个意图
          const keepNewer = lastRequested !== null && !sameTools(lastRequested, { tools });
          set({ kitchen: keepNewer ? lastRequested : confirmed, saving: false });
          return false;
        }
      });
    },

    migrate: (tools: string[]) =>
      enqueue(async () => {
        try {
          const { kitchen, created } = await deps.initialize(tools);
          confirmed = kitchen;
          revision += 1;
          set({ kitchen });
          return created ? "created" : "existing";
        } catch {
          return "failed";
        }
      })
  };
}
