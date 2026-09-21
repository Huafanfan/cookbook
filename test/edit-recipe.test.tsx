// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureLocalStorage } from "./helpers.js";

const apiMock = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    payload: unknown;
    constructor(status: number, payload: unknown = null) {
      super(`请求失败（HTTP ${status}）`);
      this.status = status;
      this.payload = payload;
    }
  }

  return {
    ApiError,
    issuesOf: (error: { payload: unknown }): string[] => {
      const issues = (error.payload as { issues?: unknown } | null)?.issues;
      return Array.isArray(issues) ? issues.filter((item): item is string => typeof item === "string") : [];
    },
    fetchRecipe: vi.fn(),
    saveRecipe: vi.fn(),
    fetchMeta: vi.fn(),
    fetchHistory: vi.fn(),
    fetchHistoryRecord: vi.fn(),
    fetchRecipes: vi.fn(),
    fetchUserState: vi.fn(),
    postLike: vi.fn(),
    postFavorite: vi.fn(),
    postKitchen: vi.fn(),
    initKitchen: vi.fn()
  };
});

vi.mock("../src/client/lib/api.js", () => apiMock);

/**
 * `useMeta` 有模块级缓存（跨用例会复用上一份词表），所以直接把 hook 也换掉：
 * 每个用例显式决定词表进没进得来。
 */
const metaMock = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../src/client/lib/use-meta.js", () => ({
  useMeta: () => ({ meta: metaMock.current, failed: false })
}));

import { EditRecipePage } from "../src/client/pages/EditRecipePage.js";
import type { RecipeDetail } from "../src/shared/types.js";

const REVISION = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function makeDetail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: "test-dish",
    name: "测试菜",
    category: "家常菜",
    difficulty: 1,
    servings: 2,
    ingredients: [{ name: "盐", amount: 2, unit: "g" }],
    steps: [{ text: "随便炒炒" }],
    coverImage: null,
    stepImages: [null],
    revision: REVISION,
    ...overrides
  };
}

beforeEach(() => {
  ensureLocalStorage();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.clearAllMocks();

  apiMock.fetchMeta.mockResolvedValue({
    categories: ["家常菜", "汤羹"],
    tags: ["快手"],
    total: 1,
    equipment: ["炒锅", "烤箱"],
    defaultOwned: ["炒锅"],
    equipmentProblem: null
  });
  metaMock.current = {
    categories: ["家常菜", "汤羹"],
    tags: ["快手"],
    total: 1,
    equipment: ["炒锅", "烤箱"],
    defaultOwned: ["炒锅"],
    equipmentProblem: null
  };
  apiMock.fetchRecipe.mockResolvedValue(makeDetail());
  apiMock.fetchHistory.mockResolvedValue({ items: [] });
});

afterEach(cleanup);

describe("编辑页（CB-009）", () => {
  it("载入后表单预填；保存时带上**加载时的 revision**与新内容", async () => {
    apiMock.saveRecipe.mockResolvedValue({ recipe: makeDetail({ name: "改过的菜" }), revision: "sha256:bbbb" });

    render(<EditRecipePage id="test-dish" />);
    const nameInput = (await screen.findByDisplayValue("测试菜")) as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: "改过的菜" } });
    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]);

    await waitFor(() => expect(apiMock.saveRecipe).toHaveBeenCalledTimes(1));
    const [id, payload] = apiMock.saveRecipe.mock.calls[0] as [string, { recipe: { name: string }; baseRevision: string }];
    expect(id).toBe("test-dish");
    expect(payload.recipe.name).toBe("改过的菜");
    expect(payload.baseRevision).toBe(REVISION);
  });

  it("服务端 400 → 列出字段级问题（并保留页面上的改动）", async () => {
    apiMock.saveRecipe.mockRejectedValue(
      new apiMock.ApiError(400, { issues: ["ingredients.0.name: 食材名不能为空"] })
    );

    render(<EditRecipePage id="test-dish" />);
    await screen.findByDisplayValue("测试菜");

    fireEvent.change(screen.getByDisplayValue("盐"), { target: { value: "" } });
    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]);

    expect(await screen.findByText(/ingredients\.0\.name: 食材名不能为空/)).toBeTruthy();
    expect(screen.getByDisplayValue("测试菜")).toBeTruthy(); // 改动没被清掉
  });

  it("409 → 显示冲突面板；「用我的覆盖」带**最新 revision** 重试", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    apiMock.saveRecipe
      .mockRejectedValueOnce(
        new apiMock.ApiError(409, { currentRevision: "sha256:cccc", current: makeDetail() })
      )
      .mockResolvedValueOnce({ recipe: makeDetail(), revision: "sha256:dddd" });

    render(<EditRecipePage id="test-dish" />);
    await screen.findByDisplayValue("测试菜");

    fireEvent.change(screen.getByDisplayValue("测试菜"), { target: { value: "我的版本" } });
    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]);

    expect(await screen.findByText(/服务端上已经是另一个版本/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "用我的覆盖" }));

    await waitFor(() => expect(apiMock.saveRecipe).toHaveBeenCalledTimes(2));
    const second = apiMock.saveRecipe.mock.calls[1] as [string, { baseRevision: string; recipe: { name: string } }];
    expect(second[1].baseRevision).toBe("sha256:cccc"); // 用服务端刚给的 revision，不是旧的
    expect(second[1].recipe.name).toBe("我的版本");
    confirmSpy.mockRestore();
  });

  it("网络中断 → 提示「结果未确认」，不说「没保存」", async () => {
    apiMock.saveRecipe.mockRejectedValue(new TypeError("Failed to fetch"));

    render(<EditRecipePage id="test-dish" />);
    await screen.findByDisplayValue("测试菜");

    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]);

    expect(await screen.findByText(/没能确认保存结果/)).toBeTruthy();
  });

  it("词表没载入 → 保存按钮禁用（服务端也会拒，但界面先别让人白点）", async () => {
    metaMock.current = {
      categories: ["家常菜"],
      tags: [],
      total: 1,
      equipment: [],
      defaultOwned: [],
      equipmentProblem: "清单未载入"
    };

    render(<EditRecipePage id="test-dish" />);
    await screen.findByDisplayValue("测试菜");

    const buttons = screen.getAllByRole("button", { name: "保存" }) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(screen.getByText(/保存先禁用/)).toBeTruthy();
  });

  it("草稿：改过之后刷新能接着改，且 baseRevision 仍是当初加载那一版", async () => {
    const { unmount } = render(<EditRecipePage id="test-dish" />);
    await screen.findByDisplayValue("测试菜");

    fireEvent.change(screen.getByDisplayValue("测试菜"), { target: { value: "改了一半" } });
    await waitFor(() =>
      expect(window.localStorage.getItem("cookbook:edit-draft:test-dish")).toContain("改了一半")
    );

    unmount();
    render(<EditRecipePage id="test-dish" />);

    // 提示有草稿 → 继续编辑 → 内容恢复
    fireEvent.click(await screen.findByRole("button", { name: "继续编辑草稿" }));
    expect(screen.getByDisplayValue("改了一半")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]);
    await waitFor(() => expect(apiMock.saveRecipe).toHaveBeenCalledTimes(1));
    const [, payload] = apiMock.saveRecipe.mock.calls[0] as [string, { baseRevision: string }];
    expect(payload.baseRevision).toBe(REVISION);
  });
});
