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
    issuesOf: () => [],
    fetchHistory: vi.fn(),
    fetchHistoryRecord: vi.fn(),
    fetchRecipe: vi.fn(),
    saveRecipe: vi.fn()
  };
});

vi.mock("../src/client/lib/api.js", () => apiMock);

import { RecipeHistoryPage, RecipeHistoryVersionPage } from "../src/client/pages/RecipeHistoryPage.js";
import type { RecipeDetail, RecipeHistoryRecord } from "../src/shared/types.js";

const OLD_RECIPE = {
  id: "test-dish",
  name: "旧版菜名",
  category: "家常菜",
  difficulty: 1 as const,
  servings: 2,
  ingredients: [{ name: "盐", amount: 2, unit: "g" }],
  steps: [{ text: "旧的第一步" }]
};

const RECORD: RecipeHistoryRecord = {
  historyId: "20260921T143305Z-7f3a",
  recipeId: "test-dish",
  savedAt: "2026-09-21T14:33:05.000Z",
  source: "manual",
  note: "改了盐量",
  beforeRevision: "sha256:old",
  afterRevision: "sha256:new",
  outcome: "replaced",
  beforeRecipe: OLD_RECIPE
};

function currentDetail(): RecipeDetail {
  return {
    ...OLD_RECIPE,
    name: "现在的菜名",
    coverImage: null,
    stepImages: [null],
    revision: "sha256:current"
  };
}

beforeEach(() => {
  ensureLocalStorage();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("修改记录列表（CB-009）", () => {
  it("渲染时间、来源、说明；没有记录时给友好空状态", async () => {
    apiMock.fetchHistory.mockResolvedValue({ items: [RECORD] });

    render(<RecipeHistoryPage id="test-dish" />);

    expect(await screen.findByText("改了盐量")).toBeTruthy();
    expect(screen.getByText("网页修改")).toBeTruthy();

    cleanup();
    apiMock.fetchHistory.mockResolvedValue({ items: [] });
    render(<RecipeHistoryPage id="test-dish" />);
    expect(await screen.findByText("还没有修改记录")).toBeTruthy();
  });
});

describe("查看与恢复某一版（CB-009）", () => {
  it("只读展示旧版内容", async () => {
    apiMock.fetchHistoryRecord.mockResolvedValue(RECORD);

    render(<RecipeHistoryVersionPage id="test-dish" historyId={RECORD.historyId} />);

    expect(await screen.findByText("旧版菜名")).toBeTruthy();
    expect(screen.getByText("旧的第一步")).toBeTruthy();
    expect(screen.getByText(/保存\*\*之前\*\*的那一版/)).toBeTruthy();
  });

  it("恢复 = 一次新保存：带**当前** revision、来源标记 restore，并清掉完成标记", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    apiMock.fetchHistoryRecord.mockResolvedValue(RECORD);
    apiMock.fetchRecipe.mockResolvedValue(currentDetail());
    apiMock.saveRecipe.mockResolvedValue({ recipe: currentDetail(), revision: "sha256:restored" });

    window.sessionStorage.setItem("cookbook:steps:test-dish", "[0]");

    render(<RecipeHistoryVersionPage id="test-dish" historyId={RECORD.historyId} />);
    await screen.findByText("旧版菜名");

    fireEvent.click(screen.getByRole("button", { name: "恢复这一版" }));

    await waitFor(() => expect(apiMock.saveRecipe).toHaveBeenCalledTimes(1));
    const [id, payload] = apiMock.saveRecipe.mock.calls[0] as [
      string,
      { recipe: { name: string }; baseRevision: string; source: string }
    ];
    expect(id).toBe("test-dish");
    expect(payload.recipe.name).toBe("旧版菜名");
    expect(payload.baseRevision).toBe("sha256:current"); // 当前版本，不是旧版那份
    expect(payload.source).toBe("restore");

    // 步骤可能变了 → 完成标记清掉，免得对错步
    await waitFor(() => expect(window.sessionStorage.getItem("cookbook:steps:test-dish")).toBeNull());
    confirmSpy.mockRestore();
  });

  it("恢复时遇到 409 → 说清「刚又被改过」，不谎称成功", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    apiMock.fetchHistoryRecord.mockResolvedValue(RECORD);
    apiMock.fetchRecipe.mockResolvedValue(currentDetail());
    apiMock.saveRecipe.mockRejectedValue(new apiMock.ApiError(409, { currentRevision: "sha256:zzz" }));

    render(<RecipeHistoryVersionPage id="test-dish" historyId={RECORD.historyId} />);
    await screen.findByText("旧版菜名");

    fireEvent.click(screen.getByRole("button", { name: "恢复这一版" }));

    expect(await screen.findByText(/刚又被改过/)).toBeTruthy();
  });
});
