// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureLocalStorage } from "./helpers.js";

const apiMock = vi.hoisted(() => ({
  fetchUserState: vi.fn(),
  postKitchen: vi.fn(),
  postLike: vi.fn(),
  postFavorite: vi.fn()
}));

vi.mock("../src/client/lib/api.js", () => apiMock);

import { readMyTools } from "../src/client/lib/kitchen.js";
import { useMyKitchen } from "../src/client/lib/use-kitchen.js";

/**
 * 我的厨具改走服务端（CB-008）。
 *
 * 注意：用户状态 store 是**模块级**的（全量只拉一次），所以本文件的用例是**顺序依赖**的
 * （1 → 2 → 3 → 4，后一个建立在前一个留下的模块状态上）。每个测试文件有独立的模块注册表，
 * 因此不要把单个用例拆到别的文件里跑。
 */

const AVAILABLE = ["炒锅", "烤箱", "空气炸锅"];
const DEFAULTS = ["炒锅"];
const NEW_TOOL = "空气炸锅";

function Probe({ available, defaultOwned }: { available: string[]; defaultOwned: string[] }): React.JSX.Element {
  const kitchen = useMyKitchen({ available, defaultOwned });

  return (
    <div>
      <span data-testid="tools">{kitchen.tools.join(",")}</span>
      <span data-testid="configured">{String(kitchen.configured)}</span>
      <span data-testid="sync">{String(kitchen.syncFailed)}</span>
      <button type="button" onClick={() => void kitchen.apply((tools) => [...tools, NEW_TOOL])}>
        add
      </button>
    </div>
  );
}

beforeEach(() => {
  ensureLocalStorage();
  window.localStorage.clear();
});

afterEach(cleanup);

describe("我的厨具 · 服务端权威 + 迁移（CB-008）", () => {
  it("1) 拉取失败：用默认清单兜底，并明确标记「没同步上」", async () => {
    apiMock.fetchUserState.mockRejectedValue(new Error("offline"));

    render(<Probe available={AVAILABLE} defaultOwned={DEFAULTS} />);

    await waitFor(() => expect(screen.getByTestId("sync").textContent).toBe("true"));
    expect(screen.getByTestId("tools").textContent).toBe(DEFAULTS.join(","));
    expect(screen.getByTestId("configured").textContent).toBe("false");
  });

  it("2) 迁移：浏览器旧值上传一次（按词表过滤）并清掉本地键", async () => {
    // 旧版本留在浏览器里的值，其中一个名字已经不在词表里
    window.localStorage.setItem("cookbook:kitchen", JSON.stringify(["烤箱", "已经不要的锅"]));
    apiMock.fetchUserState.mockResolvedValue({ recipes: {}, kitchen: null });
    apiMock.postKitchen.mockResolvedValue({
      tools: ["烤箱"],
      updatedAt: "2026-09-21T00:00:00.000Z"
    });

    render(<Probe available={AVAILABLE} defaultOwned={DEFAULTS} />);

    await waitFor(() => expect(apiMock.postKitchen).toHaveBeenCalledTimes(1));
    expect(apiMock.postKitchen).toHaveBeenCalledWith(["烤箱"]); // 词表外的名字被过滤掉
    await waitFor(() => expect(screen.getByTestId("tools").textContent).toBe("烤箱"));
    expect(screen.getByTestId("configured").textContent).toBe("true");
    expect(screen.getByTestId("sync").textContent).toBe("false");
    expect(readMyTools()).toBeNull(); // 本地键已清（下次不会重复迁移）
  });

  it("3) 保存失败：界面回滚到服务端那一份（不允许看起来保存了）", async () => {
    apiMock.postKitchen.mockRejectedValue(new Error("write failed"));

    render(<Probe available={AVAILABLE} defaultOwned={DEFAULTS} />);
    await waitFor(() => expect(screen.getByTestId("tools").textContent).toBe("烤箱"));

    fireEvent.click(screen.getByRole("button", { name: "add" }));

    // 提交的是乐观值……
    await waitFor(() => expect(apiMock.postKitchen).toHaveBeenCalledWith(["烤箱", NEW_TOOL]));
    // ……失败后界面必须回到原样
    await waitFor(() => expect(screen.getByTestId("tools").textContent).toBe("烤箱"));
  });

  it("4) 保存成功：以服务端返回的归一化值为准", async () => {
    apiMock.postKitchen.mockResolvedValue({
      tools: ["炒锅", "烤箱", NEW_TOOL],
      updatedAt: "2026-09-21T00:00:01.000Z"
    });

    render(<Probe available={AVAILABLE} defaultOwned={DEFAULTS} />);
    await waitFor(() => expect(screen.getByTestId("tools").textContent).toBe("烤箱"));

    fireEvent.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() =>
      expect(screen.getByTestId("tools").textContent).toBe(`炒锅,烤箱,${NEW_TOOL}`)
    );
    // 迁移 1 次 + 用例 3 的失败 1 次 + 这次成功 1 次
    expect(apiMock.postKitchen).toHaveBeenCalledTimes(3);
  });
});
