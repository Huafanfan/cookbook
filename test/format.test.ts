import { describe, expect, it } from "vitest";

import {
  amountText,
  difficultyStars,
  difficultyText,
  ingredientAmountText,
  minutesText
} from "../src/client/lib/format.js";

describe("amountText（唯一权威的用量显示：原样输出，不换算）", () => {
  it("数值 + 单位原样输出", () => {
    expect(amountText(2, "个")).toBe("2个");
    expect(amountText(500, "g")).toBe("500g");
    expect(amountText(20, "ml")).toBe("20ml");
  });

  it("小数原样输出，不做取整", () => {
    expect(amountText(1.5, "勺")).toBe("1.5勺");
    expect(amountText(0.5, "个")).toBe("0.5个");
  });

  it("字符串用量原样输出", () => {
    expect(amountText("适量")).toBe("适量");
    expect(amountText("少许", "勺")).toBe("少许勺");
  });

  it("缺 amount 时有单位给占位、无单位给「适量」", () => {
    expect(amountText(undefined, "g")).toBe("— g");
    expect(amountText(undefined)).toBe("适量");
  });

  it("直接作用于食材对象", () => {
    expect(ingredientAmountText({ name: "盐", amount: 3, unit: "g" })).toBe("3g");
    expect(ingredientAmountText({ name: "葱" })).toBe("适量");
  });
});

describe("difficultyText / difficultyStars", () => {
  it("三档文案", () => {
    expect(difficultyText(1)).toBe("简单");
    expect(difficultyText(2)).toBe("适中");
    expect(difficultyText(3)).toBe("有点挑战");
  });

  it("星级标记", () => {
    expect(difficultyStars(1)).toBe("●○○");
    expect(difficultyStars(3)).toBe("●●●");
  });
});

describe("minutesText", () => {
  it("备料 + 烹饪合计", () => {
    expect(minutesText(15, 20)).toBe("35 分钟（备料 15 + 烹饪 20）");
  });

  it("只有一项时不显示多余的分段", () => {
    expect(minutesText(10, undefined)).toBe("10 分钟（备料 10）");
    expect(minutesText(undefined, 5)).toBe("5 分钟（烹饪 5）");
  });

  it("都没有时返回 null（界面不显示耗时徽标）", () => {
    expect(minutesText(undefined, undefined)).toBeNull();
    expect(minutesText(0, 0)).toBeNull();
  });
});
