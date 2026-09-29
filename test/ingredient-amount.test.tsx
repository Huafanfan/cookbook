// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IngredientList } from "../src/client/components/IngredientList.js";
import { ingredientAmountText } from "../src/client/lib/ingredient-amount.js";

afterEach(cleanup);

describe("菜谱用量按原文显示", () => {
  it("数字、中文数字和范围都不换算", () => {
    render(
      <IngredientList
        servings={2}
        ingredients={[
          { name: "鸡蛋", amount: 3, unit: "个" },
          { name: "葱", amount: "一", unit: "根" },
          { name: "油", amount: "10-15", unit: "ml" }
        ]}
      />
    );

    expect(screen.getByText("2 人份")).toBeTruthy();
    expect(screen.getByText("3个")).toBeTruthy();
    expect(screen.getByText("一根")).toBeTruthy();
    expect(screen.getByText("10-15ml")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /3 人|4 人|5 人/ })).toBeNull();
  });

  it("没有用量时按现有缺省规则显示", () => {
    expect(ingredientAmountText({ name: "盐" })).toBe("适量");
    expect(ingredientAmountText({ name: "糖", unit: "g" })).toBe("— g");
  });
});
