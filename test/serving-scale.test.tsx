// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IngredientList } from "../src/client/components/IngredientList.js";
import { StepList } from "../src/client/components/StepList.js";
import type { Ingredient } from "../src/shared/types.js";
import { ensureLocalStorage } from "./helpers.js";

const INGREDIENTS: Ingredient[] = [
  { name: "鸡翅中", amount: 500, unit: "g", group: "主料" },
  { name: "葱", amount: "一", unit: "根", group: "主料" },
  { name: "油", amount: "10-15", unit: "ml", group: "调料" },
  { name: "盐" }
];

beforeEach(() => {
  ensureLocalStorage();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(cleanup);

/**
 * 菜名 → 用量。
 *
 * 不按位置断言：食材会按「主料 / 调料」分组重排，顺序依赖分组而不是数组顺序。
 */
function amountByName(): Record<string, string> {
  const result: Record<string, string> = {};

  for (const item of document.querySelectorAll(".ingredient-item")) {
    const name = item.querySelector(".ingredient-name")?.textContent ?? "";
    const amount = item.querySelector(".ingredient-amount")?.textContent ?? "";
    result[name] = amount;
  }

  return result;
}

describe("IngredientList · 份量档位（CB-004）", () => {
  it("档位以基准为起点向上：基准 2 → 2/3/4/5，且不含 1 人份", () => {
    render(
      <IngredientList
        ingredients={INGREDIENTS}
        baseServings={2}
        servings={2}
        onServingsChange={() => undefined}
      />
    );

    const chips = [...document.querySelectorAll(".section-note .chip-small")].map(
      (node) => node.textContent
    );
    expect(chips).toEqual(["2 人", "3 人", "4 人", "5 人"]);
  });

  it("基准份量：用量与原文完全一致（中文数字与范围都不动）", () => {
    render(
      <IngredientList
        ingredients={INGREDIENTS}
        baseServings={2}
        servings={2}
        onServingsChange={() => undefined}
      />
    );

    expect(amountByName()).toEqual({
      鸡翅中: "500g",
      葱: "一根",
      油: "10-15ml",
      盐: "适量"
    });
    expect(document.querySelector(".ingredient-list")?.getAttribute("data-scaled")).toBe("false");
  });

  it("选 3 人份（1.5×）：数字缩放、范围两端缩放、中文数字转阿拉伯、适量不动", () => {
    render(
      <IngredientList
        ingredients={INGREDIENTS}
        baseServings={2}
        servings={3}
        onServingsChange={() => undefined}
      />
    );

    expect(amountByName()).toEqual({
      鸡翅中: "750g", // 数字 × 1.5
      葱: "1.5根", // 中文数字转阿拉伯
      油: "15-23ml", // 范围两端同比缩放
      盐: "适量" // 无用量永远不动
    });
    expect(document.querySelector(".ingredient-list")?.getAttribute("data-scaled")).toBe("true");
  });

  it("点档位上报给上层", () => {
    const onServingsChange = vi.fn();
    render(
      <IngredientList
        ingredients={INGREDIENTS}
        baseServings={2}
        servings={2}
        onServingsChange={onServingsChange}
      />
    );

    fireEvent.click(screen.getByText("4 人"));

    expect(onServingsChange).toHaveBeenCalledWith(4);
  });

  it("基准 1 的菜档位是 1/2/3/4", () => {
    render(
      <IngredientList
        ingredients={INGREDIENTS}
        baseServings={1}
        servings={1}
        onServingsChange={() => undefined}
      />
    );

    const chips = [...document.querySelectorAll(".section-note .chip-small")].map(
      (node) => node.textContent
    );
    expect(chips).toEqual(["1 人", "2 人", "3 人", "4 人"]);
  });
});

describe("StepList · 份量提示（步骤文案里的用量按基准写）", () => {
  const steps = [{ text: "倒 15ml 油，翻炒 2 分钟", minutes: 2 }];

  it("非基准份量时在做法区显示提示", () => {
    render(
      <StepList
        recipeId="r1"
        steps={steps}
        portionNotice="步骤里的用量按 2 人份写，当前显示 4 人份 —— 请按上面的食材表取量"
      />
    );

    expect(screen.getByText(/步骤里的用量按 2 人份写/)).toBeTruthy();
  });

  it("基准份量（null）时不显示提示", () => {
    render(<StepList recipeId="r1" steps={steps} portionNotice={null} />);

    expect(screen.queryByText(/步骤里的用量/)).toBeNull();
  });
});
