// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureLocalStorage } from "./helpers.js";

const apiMock = vi.hoisted(() => ({
  fetchUserState: vi.fn(),
  postKitchen: vi.fn(),
  initKitchen: vi.fn(),
  postLike: vi.fn(),
  postFavorite: vi.fn()
}));

vi.mock("../src/client/lib/api.js", () => apiMock);

import { readMyTools } from "../src/client/lib/kitchen.js";
import { __resetKitchenMigrationForTests, useMyKitchen } from "../src/client/lib/use-kitchen.js";
import { __resetUserStateForTests } from "../src/client/lib/user-state.js";

/**
 * 我的厨具改走服务端（CB-008）——**组件层的接线测试**。
 *
 * 并发/时序本身在 `kitchen-sync.test.ts` 里用可独立实例化的同步器测；
 * 这里只测"接线"（hook → 状态 → 界面）。每个用例前重置模块级状态，
 * **不依赖执行顺序**（复核意见 P2-5）。
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
      <span data-testid="migrate">{String(kitchen.migrateFailed)}</span>
      <button type="button" onClick={() => void kitchen.apply((tools) => [...tools, NEW_TOOL])}>
        add
      </button>
    </div>
  );
}

beforeEach(() => {
  ensureLocalStorage();
  window.localStorage.clear();
  __resetUserStateForTests();
  __resetKitchenMigrationForTests();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("我的厨具 · 接线（CB-008）", () => {
  it("服务端有值：界面用服务端那份（不是 defaultOwned），且不触发迁移", async () => {
    apiMock.fetchUserState.mockResolvedValue({
      recipes: {},
      kitchen: { tools: ["烤箱"], updatedAt: "2026-09-21T00:00:00.000Z" }
    });

    render(<Probe available={AVAILABLE} defaultOwned={DEFAULTS} />);

    await waitFor(() => expect(screen.getByTestId("tools").textContent).toBe("烤箱"));
    expect(screen.getByTestId("configured").textContent).toBe("true");
    // 服务端已有值 → 不该调用迁移接口（更不该覆盖）
    expect(apiMock.initKitchen).not.toHaveBeenCalled();
    expect(apiMock.postKitchen).not.toHaveBeenCalled();
  });

  it("拉取失败：用默认清单兜底，并明确标记「没同步上」", async () => {
    apiMock.fetchUserState.mockRejectedValue(new Error("offline"));

    render(<Probe available={AVAILABLE} defaultOwned={DEFAULTS} />);

    await waitFor(() => expect(screen.getByTestId("sync").textContent).toBe("true"));
    expect(screen.getByTestId("tools").textContent).toBe(DEFAULTS.join(","));
    expect(screen.getByTestId("configured").textContent).toBe("false");
  });

  it("迁移：服务端没有值 + 浏览器有旧值 → 调 init，成功后清掉本地键", async () => {
    window.localStorage.setItem("cookbook:kitchen", JSON.stringify(["烤箱", "已经不要的锅"]));
    apiMock.fetchUserState.mockResolvedValue({ recipes: {}, kitchen: null });
    apiMock.initKitchen.mockResolvedValue({
      kitchen: { tools: ["烤箱"], updatedAt: "2026-09-21T00:00:00.000Z" },
      created: true
    });

    render(<Probe available={AVAILABLE} defaultOwned={DEFAULTS} />);

    await waitFor(() => expect(apiMock.initKitchen).toHaveBeenCalledTimes(1));
    expect(apiMock.initKitchen).toHaveBeenCalledWith(["烤箱"]); // 词表外的名字被过滤
    await waitFor(() => expect(screen.getByTestId("tools").textContent).toBe("烤箱"));
    expect(readMyTools()).toBeNull(); // 迁移结束 → 清本地键
    expect(screen.getByTestId("migrate").textContent).toBe("false");
  });

  it("迁移遇到「服务端已有值」（另一台设备先配好）：采用服务端那份，不覆盖", async () => {
    window.localStorage.setItem("cookbook:kitchen", JSON.stringify(["烤箱"]));
    apiMock.fetchUserState.mockResolvedValue({ recipes: {}, kitchen: null });
    apiMock.initKitchen.mockResolvedValue({
      kitchen: { tools: ["炒锅", "空气炸锅"], updatedAt: "2026-09-21T00:00:00.000Z" },
      created: false
    });

    render(<Probe available={AVAILABLE} defaultOwned={DEFAULTS} />);

    await waitFor(() => expect(screen.getByTestId("tools").textContent).toBe("炒锅,空气炸锅"));
    expect(apiMock.postKitchen).not.toHaveBeenCalled(); // 绝不覆盖
    expect(readMyTools()).toBeNull(); // 迁移结束（服务端已有权威值）
  });

  it("迁移失败：保留本地键 + 标记 migrateFailed（下次打开再试）", async () => {
    window.localStorage.setItem("cookbook:kitchen", JSON.stringify(["烤箱"]));
    apiMock.fetchUserState.mockResolvedValue({ recipes: {}, kitchen: null });
    apiMock.initKitchen.mockRejectedValue(new Error("offline"));

    render(<Probe available={AVAILABLE} defaultOwned={DEFAULTS} />);

    await waitFor(() => expect(screen.getByTestId("migrate").textContent).toBe("true"));
    expect(readMyTools()).not.toBeNull(); // 本地那份留着
    expect(apiMock.initKitchen).toHaveBeenCalledTimes(1); // 同一次挂载不连续重试
  });

  it("保存失败：界面回滚到服务端那一份（不允许看起来保存了）", async () => {
    apiMock.fetchUserState.mockResolvedValue({
      recipes: {},
      kitchen: { tools: ["烤箱"], updatedAt: "2026-09-21T00:00:00.000Z" }
    });
    apiMock.postKitchen.mockRejectedValue(new Error("write failed"));

    render(<Probe available={AVAILABLE} defaultOwned={DEFAULTS} />);
    await waitFor(() => expect(screen.getByTestId("tools").textContent).toBe("烤箱"));

    fireEvent.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() =>
      expect(apiMock.postKitchen).toHaveBeenCalledWith(["烤箱", NEW_TOOL])
    );
    await waitFor(() => expect(screen.getByTestId("tools").textContent).toBe("烤箱"));
  });
});
