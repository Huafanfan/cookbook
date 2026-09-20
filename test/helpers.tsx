import type { Recipe, RecipeSummary } from "../src/shared/types.js";

/** 组件测试用的菜谱样本（默认：需要炒锅或空气炸锅，家中都能对上） */
export function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "test-dish",
    name: "测试菜",
    category: "家常菜",
    tags: [],
    difficulty: 1,
    servings: 2,
    ingredients: [{ name: "盐", amount: 3, unit: "g" }],
    steps: [{ text: "随便炒炒" }],
    equipmentAlternatives: [["炒锅", "空气炸锅"]],
    ...overrides
  };
}

export function makeSummary(overrides: Partial<RecipeSummary> = {}): RecipeSummary {
  const recipe = makeRecipe();
  const base: RecipeSummary = {
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    tags: [],
    difficulty: recipe.difficulty,
    servings: recipe.servings,
    ingredientNames: ["盐"],
    equipment: [],
    equipmentAlternatives: recipe.equipmentAlternatives ?? [],
    coverImage: null,
    likes: 0,
    favorite: false
  };

  // Partial 会把可选字段展宽成 `T | undefined`，所以这两个字段显式兜底
  return { ...base, ...overrides, likes: overrides.likes ?? 0, favorite: overrides.favorite ?? false };
}

/** jsdom 没有实现 scrollIntoView，测试里需要打桩 */
export function stubScrollIntoView(): void {
  Element.prototype.scrollIntoView = function scrollIntoViewStub(): void {};
}

/**
 * 给测试环境补一个内存版 localStorage。
 *
 * 原因：Node 22+ 自带实验性 `localStorage` 全局，在没有 `--localstorage-file` 时求值为 undefined，
 * 并且**盖住了 jsdom 的实现**（`window.localStorage` 同样是 undefined；`sessionStorage` 不受影响）。
 * 于是 `storage.ts` 的 `readStored/writeStored` 会走"不可用"分支（返回 null/false）——
 * 这正是它在真实浏览器隐私模式下的降级行为，但组件测试需要能真正读写。
 */
export function ensureLocalStorage(): void {
  const makeMemoryStorage = (): Storage => {
    const map = new Map<string, string>();
    return {
      get length(): number {
        return map.size;
      },
      clear: (): void => {
        map.clear();
      },
      getItem: (key: string): string | null => map.get(key) ?? null,
      key: (index: number): string | null => [...map.keys()][index] ?? null,
      removeItem: (key: string): void => {
        map.delete(key);
      },
      setItem: (key: string, value: string): void => {
        map.set(key, String(value));
      }
    } as Storage;
  };

  if (typeof window === "undefined") return;
  if (window.localStorage) return;

  const storage = makeMemoryStorage();
  try {
    Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  } catch {
    // Node 的全局访问器不可配置时忽略：此时组件测试只依赖 sessionStorage
  }
}
