// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StepList } from "../src/client/components/StepList.js";
import type { Step } from "../src/shared/types.js";
import { ensureLocalStorage, stubScrollIntoView } from "./helpers.js";

const STEPS: Step[] = [
  { text: "腌制", title: "腌制", minutes: 1 },
  { text: "煎到金黄", title: "煎香" }
];

beforeEach(() => {
  ensureLocalStorage();
  window.sessionStorage.clear();
  window.localStorage.clear();
  stubScrollIntoView();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function minutesLabel(index: number): RegExp {
  return new RegExp(`${STEPS[index].minutes} 分钟`);
}

describe("StepList · 到点提醒", () => {
  it("点计时后按钮变成倒计时", () => {
    vi.useFakeTimers();
    render(<StepList recipeId="r1" steps={STEPS} />);

    fireEvent.click(screen.getByRole("button", { name: minutesLabel(0) }));

    expect(screen.getByRole("button", { name: "停止计时" })).toBeTruthy();
  });

  it("到点后提醒**保持到用户确认**，不会被自动清除（P1-7 回归）", () => {
    vi.useFakeTimers();
    render(<StepList recipeId="r1" steps={STEPS} />);

    fireEvent.click(screen.getByRole("button", { name: minutesLabel(0) }));

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByText("时间到 · 点我停止")).toBeTruthy();

    // 修复前：再等 10 秒提醒就被 setTimeout 自动清掉了
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("时间到 · 点我停止")).toBeTruthy();
  });

  it("到点后吸顶条保留一条明确提示，并可点它跳到那一步", () => {
    vi.useFakeTimers();
    render(<StepList recipeId="r1" steps={STEPS} />);

    fireEvent.click(screen.getByRole("button", { name: minutesLabel(0) }));
    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    const sticky = document.querySelector(".step-sticky-button");
    expect(sticky?.textContent).toContain("腌制 已到点");

    fireEvent.click(sticky as Element);
    // 跳转用的是 scrollIntoView（已在 beforeEach 打桩），这里只确认不抛错且状态保留
    expect(screen.getByText("时间到 · 点我停止")).toBeTruthy();
  });

  it("点「时间到」按钮可以清除提醒", () => {
    vi.useFakeTimers();
    render(<StepList recipeId="r1" steps={STEPS} />);

    fireEvent.click(screen.getByRole("button", { name: minutesLabel(0) }));
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    fireEvent.click(screen.getByText("时间到 · 点我停止"));

    expect(screen.queryByText("时间到 · 点我停止")).toBeNull();
  });
});

describe("StepList · 完成状态", () => {
  it("越界、重复、非整数的完成索引会被清洗（P2-5 回归）", () => {
    sessionStorage.setItem("cookbook:steps:r1", JSON.stringify([0, 0, 99, -1, 1.5]));

    render(<StepList recipeId="r1" steps={STEPS} />);

    // 只有 0 是合法的
    expect(document.querySelector(".section-note")?.textContent).toContain("已完成 1/2");
  });

  it("点步骤卡片标记完成，再点取消", () => {
    render(<StepList recipeId="r1" steps={STEPS} />);

    // 用 id + class 精确定位卡片本体：吸顶条上也有同样的步骤名，按名字查会命中多个
    const card = document.getElementById("step-0");
    const main = card?.querySelector(".step-main");
    expect(main).toBeTruthy();

    fireEvent.click(main as Element);
    expect(document.querySelector(".section-note")?.textContent).toContain("已完成 1/2");

    fireEvent.click(main as Element);
    expect(document.querySelector(".section-note")?.textContent).toContain("已完成 0/2");
  });

  it("全部完成的提示与跳转目标一致（文案说回到第一步）", () => {
    sessionStorage.setItem("cookbook:steps:r1", JSON.stringify([0, 1]));

    render(<StepList recipeId="r1" steps={STEPS} />);

    const sticky = document.querySelector(".step-sticky-button");
    expect(sticky?.textContent).toContain("回到第一步");
    expect(screen.getByText("全部完成")).toBeTruthy();
  });
});
