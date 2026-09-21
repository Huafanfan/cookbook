import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { KitchenState, RecipeUserState, UserStateResponse } from "../../shared/types.js";

/**
 * 用户状态（点赞、收藏）的持久化。
 *
 * 这是本项目**第一个写操作**，边界见 docs/decisions/ADR-0003-write-operations-user-state.md：
 * - 与菜谱内容分开存（菜谱运行期仍只读），写入只影响 `data/user-state.json` 一个文件；
 * - **原子替换**（写临时文件 → rename），避免半个文件导致下次启动读不出来；
 * - **串行写队列**：同时只有一个写在跑，后到者排队（单进程假设，见 ADR）；
 * - 写盘失败时**回滚内存副本**，让内存与磁盘始终一致（接口据此返回 503）。
 */

export const USER_STATE_FILE_NAME = "user-state.json";

interface UserStateFile {
  version: 1;
  recipes: Record<string, RecipeUserState>;
  /** 「我的厨具」（CB-008）；缺省 = 从未设置过 */
  kitchen?: KitchenState;
}

const EMPTY_STATE: UserStateFile = { version: 1, recipes: {} };

function emptyRecipeState(): RecipeUserState {
  return { likes: 0, favorite: false };
}

/** 归一化「我的厨具」：只收字符串、去重、保留顺序；`tools: []` 是合法值（明确全不选） */
function normalizeKitchen(raw: unknown): KitchenState | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;

  const tools = (raw as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return undefined;

  const cleaned = [
    ...new Set(
      tools
        .filter((tool): tool is string => typeof tool === "string")
        .map((tool) => tool.trim())
        .filter(Boolean)
    )
  ];
  const updatedAt = (raw as { updatedAt?: unknown }).updatedAt;

  return { tools: cleaned, ...(typeof updatedAt === "string" ? { updatedAt } : {}) };
}

export function normalizeState(raw: unknown): UserStateFile {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;

  const kitchen = normalizeKitchen((raw as { kitchen?: unknown }).kitchen);
  const recipes = (raw as { recipes?: unknown }).recipes;
  if (typeof recipes !== "object" || recipes === null) {
    return kitchen ? { version: 1, recipes: {}, kitchen } : EMPTY_STATE;
  }

  const cleaned: Record<string, RecipeUserState> = {};
  for (const [id, value] of Object.entries(recipes as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const entry = value as { likes?: unknown; favorite?: unknown; updatedAt?: unknown };
    const likes = typeof entry.likes === "number" && Number.isFinite(entry.likes)
      ? Math.max(0, Math.floor(entry.likes))
      : 0;
    const favorite = entry.favorite === true;
    const updatedAt = typeof entry.updatedAt === "string" ? entry.updatedAt : undefined;

    if (likes === 0 && !favorite && updatedAt === undefined) continue;
    cleaned[id] = { likes, favorite, ...(updatedAt ? { updatedAt } : {}) };
  }

  return { version: 1, recipes: cleaned, ...(kitchen ? { kitchen } : {}) };
}

export class UserStateStore {
  readonly #file: string;
  #state: UserStateFile;
  /** 串行写队列：保证同时只有一个写入 */
  #chain: Promise<unknown> = Promise.resolve();

  private constructor(file: string, state: UserStateFile) {
    this.#file = file;
    this.#state = state;
  }

  /**
   * 载入状态。文件不存在 → 空状态；文件损坏 → 另存为 `.broken` 后用空状态启动
   * （不静默丢数据）。
   *
   * @returns [store, 需要记录的告警]
   */
  static async load(dataDir: string): Promise<{ store: UserStateStore; warnings: string[] }> {
    const file = join(dataDir, USER_STATE_FILE_NAME);
    const warnings: string[] = [];

    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        warnings.push(`用户状态读取失败（按空状态启动）：${(error as Error).message}`);
      }
      return { store: new UserStateStore(file, EMPTY_STATE), warnings };
    }

    try {
      return { store: new UserStateStore(file, normalizeState(JSON.parse(raw))), warnings };
    } catch (error) {
      const broken = `${file}.broken`;
      await rename(file, broken).catch(() => undefined);
      warnings.push(
        `用户状态文件损坏（已另存为 ${broken}，按空状态启动）：${(error as Error).message}`
      );
      return { store: new UserStateStore(file, EMPTY_STATE), warnings };
    }
  }

  /** 仅供测试：不碰文件系统 */
  static inMemory(file = "/tmp/user-state.json"): UserStateStore {
    return new UserStateStore(file, EMPTY_STATE);
  }

  get(id: string): RecipeUserState {
    return this.#state.recipes[id] ?? emptyRecipeState();
  }

  snapshot(): UserStateResponse {
    return { recipes: { ...this.#state.recipes }, kitchen: this.#state.kitchen ?? null };
  }

  /** 点赞数增减（下限 0）；`delta` 必须为 ±1 */
  like(id: string, delta: 1 | -1): Promise<RecipeUserState> {
    return this.#mutate((draft) => {
      const current = draft.recipes[id] ?? emptyRecipeState();
      const next: RecipeUserState = {
        ...current,
        likes: Math.max(0, current.likes + delta),
        updatedAt: now()
      };
      draft.recipes[id] = next;
      return next;
    });
  }

  setFavorite(id: string, favorite: boolean): Promise<RecipeUserState> {
    return this.#mutate((draft) => {
      const current = draft.recipes[id] ?? emptyRecipeState();
      const next: RecipeUserState = { ...current, favorite, updatedAt: now() };
      draft.recipes[id] = next;
      return next;
    });
  }

  /**
   * 整份替换「我的厨具」（CB-008）。
   *
   * 词表校验与排序在路由层（那里有词表）；这里只做防御性去重，
   * 并且**允许空数组**（= 用户明确全不选，与"从未设置过"不同）。
   */
  setKitchen(tools: string[]): Promise<KitchenState> {
    const unique = uniqueTools(tools);

    return this.#mutate((draft) => {
      const next: KitchenState = { tools: unique, updatedAt: now() };
      draft.kitchen = next;
      return next;
    });
  }

  /**
   * **仅当尚未设置过**时写入「我的厨具」（CB-008 迁移用）。
   *
   * 关键：判断放在**串行队列的任务里**，所以是原子的一一两台设备同时迁移时，
   * 只有第一台得到 `created: true`，另一台拿到现有配置，不会互相覆盖。
   * 已设置时**不写盘**（没有必要重写相同的字节）。
   */
  initializeKitchen(tools: string[]): Promise<{ kitchen: KitchenState; created: boolean }> {
    const unique = uniqueTools(tools);

    return this.#enqueue(async () => {
      if (this.#state.kitchen) {
        return { kitchen: this.#state.kitchen, created: false };
      }

      const draft = this.#draftCopy();
      const next: KitchenState = { tools: unique, updatedAt: now() };
      draft.kitchen = next;

      await this.#persist(draft);
      this.#state = draft;
      return { kitchen: next, created: true };
    });
  }

  /**
   * 变更 → 落盘 → **成功才提交到内存**（失败回滚），并且全程串行。
   * `build` 在草稿上做修改，返回值就是给调用方的结果。
   */
  #mutate<T>(build: (draft: UserStateFile) => T): Promise<T> {
    return this.#enqueue(async () => {
      const draft = this.#draftCopy();
      const result = build(draft);

      await this.#persist(draft);
      this.#state = draft; // 只有写盘成功才替换内存
      return result;
    });
  }

  /** 串行队列：同时只有一个写在跑，后到者排队 */
  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#chain.then(task, task);
    this.#chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  /** 内存状态的**浅拷贝草稿**：只改草稿，成功了才整体替换（失败即回滚） */
  #draftCopy(): UserStateFile {
    return {
      version: 1,
      recipes: { ...this.#state.recipes },
      ...(this.#state.kitchen
        ? { kitchen: { ...this.#state.kitchen, tools: [...this.#state.kitchen.tools] } }
        : {})
    };
  }

  async #persist(state: UserStateFile): Promise<void> {
    const temp = `${this.#file}.tmp`;
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temp, this.#file);
  }
}

function now(): string {
  return new Date().toISOString();
}

/** 防御性去重：去空白、丢空串、保序 */
function uniqueTools(tools: string[]): string[] {
  return [...new Set(tools.map((tool) => tool.trim()).filter(Boolean))];
}
