import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { RecipeUserState, UserStateResponse } from "../../shared/types.js";

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
}

const EMPTY_STATE: UserStateFile = { version: 1, recipes: {} };

function emptyRecipeState(): RecipeUserState {
  return { likes: 0, favorite: false };
}

export function normalizeState(raw: unknown): UserStateFile {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;

  const recipes = (raw as { recipes?: unknown }).recipes;
  if (typeof recipes !== "object" || recipes === null) return EMPTY_STATE;

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

  return { version: 1, recipes: cleaned };
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
    return { recipes: { ...this.#state.recipes } };
  }

  /** 点赞数增减（下限 0）；`delta` 必须为 ±1 */
  like(id: string, delta: 1 | -1): Promise<RecipeUserState> {
    return this.#mutate((recipes) => {
      const current = recipes[id] ?? emptyRecipeState();
      recipes[id] = { ...current, likes: Math.max(0, current.likes + delta), updatedAt: now() };
    }, id);
  }

  setFavorite(id: string, favorite: boolean): Promise<RecipeUserState> {
    return this.#mutate((recipes) => {
      const current = recipes[id] ?? emptyRecipeState();
      recipes[id] = { ...current, favorite, updatedAt: now() };
    }, id);
  }

  /** 变更 → 落盘 → 成功才提交到内存（失败回滚），并且全程串行 */
  #mutate(apply: (recipes: Record<string, RecipeUserState>) => void, id: string): Promise<RecipeUserState> {
    const task = async (): Promise<RecipeUserState> => {
      const draft: UserStateFile = {
        version: 1,
        recipes: { ...this.#state.recipes, ...(this.#state.recipes[id] ? { [id]: { ...this.#state.recipes[id] } } : {}) }
      };
      apply(draft.recipes);

      await this.#persist(draft);
      this.#state = draft; // 只有写盘成功才替换内存
      return draft.recipes[id] ?? emptyRecipeState();
    };

    const run = this.#chain.then(task, task);
    this.#chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
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
