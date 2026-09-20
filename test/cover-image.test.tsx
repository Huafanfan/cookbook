// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeCard } from "../src/client/components/RecipeCard.js";
import { RecipeCover } from "../src/client/components/RecipeCover.js";
import { StepCard } from "../src/client/components/StepCard.js";
import { ensureLocalStorage, makeSummary } from "./helpers.js";

const COVER = "/images/ke-le-ji-chi/cover.jpg";

beforeEach(() => {
  ensureLocalStorage();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RecipeCard 封面（CB-007）", () => {
  it("有图时渲染图片并懒加载，首字色块仍在（图片盖在它上面）", () => {
    const { container } = render(
      <RecipeCard recipe={makeSummary({ name: "可乐鸡翅", coverImage: COVER })} myTools={[]} catalogReady />
    );

    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe(COVER);
    expect(image?.getAttribute("loading")).toBe("lazy");
    // 无图/失败时露出的占位
    expect(container.querySelector(".cover-letter")?.textContent).toBe("可");
  });

  it("图片加载失败时移除图片，保留下层占位（不出现破图）", () => {
    const { container } = render(
      <RecipeCard recipe={makeSummary({ name: "可乐鸡翅", coverImage: COVER })} myTools={[]} catalogReady />
    );

    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".cover-letter")?.textContent).toBe("可");
  });

  it("没有封面时不渲染 img，只显示首字色块", () => {
    const { container } = render(
      <RecipeCard recipe={makeSummary({ name: "白灼菜心", coverImage: null })} myTools={[]} catalogReady />
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".cover-letter")?.textContent).toBe("白");
  });

  it("换了图片地址后失败状态重置（失败不能粘住下一张图）", () => {
    const { container, rerender } = render(
      <RecipeCover src={COVER} name="可乐鸡翅" />
    );
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();

    rerender(<RecipeCover src="/images/other/cover.jpg" name="可乐鸡翅" />);

    expect(container.querySelector("img")?.getAttribute("src")).toBe("/images/other/cover.jpg");
  });
});

describe("详情页头图（hero）", () => {
  it("没有封面时不渲染任何东西（不留空白大块）", () => {
    const { container } = render(<RecipeCover variant="hero" src={null} name="白灼菜心" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("加载失败时收起图片并给一行提示", () => {
    const { container } = render(<RecipeCover variant="hero" src={COVER} name="可乐鸡翅" />);

    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("封面图加载失败")).toBeTruthy();
  });
});

describe("步骤配图", () => {
  const step = { text: "焯水 2 分钟", minutes: 2 };

  function renderStep(overrides: Partial<Parameters<typeof StepCard>[0]> = {}): {
    container: HTMLElement;
    onToggleDone: ReturnType<typeof vi.fn>;
  } {
    const onToggleDone = vi.fn();
    const props = {
      step,
      index: 0,
      image: "/images/ke-le-ji-chi/step-1.jpg",
      isDone: false,
      timerState: "idle" as const,
      remaining: 0,
      onToggleDone,
      onStartTimer: vi.fn(),
      onStopTimer: vi.fn(),
      ...overrides
    };

    return { container: render(<StepCard {...props} />).container, onToggleDone };
  }

  it("有图时显示图片，且图片在完成按钮之外（点图不会把步骤标成完成）", () => {
    const { container, onToggleDone } = renderStep();

    const image = container.querySelector(".step-image img");
    expect(image?.getAttribute("src")).toBe("/images/ke-le-ji-chi/step-1.jpg");

    fireEvent.click(image as HTMLImageElement);
    expect(onToggleDone).not.toHaveBeenCalled();
  });

  it("没有图的步骤不占空间", () => {
    const { container } = renderStep({ image: null });
    expect(container.querySelector(".step-image")).toBeNull();
  });

  it("图片加载失败：给提示，且计时与完成状态都不受影响", () => {
    const { container, onToggleDone } = renderStep();

    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(screen.getByText("第 1 步的配图加载失败")).toBeTruthy();
    // 计时入口还在，完成按钮也还能用
    expect(container.querySelector(".time-button")?.textContent).toContain("2 分钟");
    fireEvent.click(screen.getByRole("button", { name: /焯水 2 分钟/ }));
    expect(onToggleDone).toHaveBeenCalledTimes(1);
  });
});
