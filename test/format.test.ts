import { describe, expect, it } from "vitest";

import { difficultyStars, difficultyText, minutesText } from "../src/client/lib/format.js";

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
