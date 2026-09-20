import { describe, expect, it } from "vitest";

import {
  amountText,
  formatScaledAmount,
  ingredientAmountText,
  scaleFactor,
  SCALE_STEP,
  servingNotice,
  servingOptions
} from "../src/client/lib/scale.js";

describe("servingOptions（以这道菜的基准为起点向上）", () => {
  it("基准 2 → 2/3/4/5", () => {
    expect(servingOptions(2)).toEqual([2, 3, 4, 5]);
  });

  it("基准 1（导入菜里常见）→ 1/2/3/4", () => {
    expect(servingOptions(1)).toEqual([1, 2, 3, 4]);
  });

  it("基准 3 → 3/4/5/6", () => {
    expect(servingOptions(3)).toEqual([3, 4, 5, 6]);
  });

  it("不提供低于基准的档位（不做砍半）", () => {
    expect(servingOptions(2)).not.toContain(1);
    expect(servingOptions(3)).not.toContain(2);
  });

  it("异常基准退化为 1", () => {
    expect(servingOptions(0)).toEqual([1, 2, 3, 4]);
    expect(servingOptions(-5)).toEqual([1, 2, 3, 4]);
  });
});

describe("scaleFactor（用户口径：多一个人多 0.5 倍）", () => {
  it("口径常量就是 0.5", () => {
    expect(SCALE_STEP).toBe(0.5);
  });

  it("2/3/4/5 人 → 1.0/1.5/2.0/2.5 倍", () => {
    expect(scaleFactor(2, 2)).toBe(1);
    expect(scaleFactor(3, 2)).toBe(1.5);
    expect(scaleFactor(4, 2)).toBe(2);
    expect(scaleFactor(5, 2)).toBe(2.5);
  });

  it("基准 1 的菜同样按 0.5 步进", () => {
    expect(scaleFactor(2, 1)).toBe(1.5);
    expect(scaleFactor(3, 1)).toBe(2);
  });

  it("目标不高于基准时返回 1（界面不提供缩小档）", () => {
    expect(scaleFactor(1, 2)).toBe(1);
    expect(scaleFactor(2, 2)).toBe(1);
  });

  it("非法输入退化为 1", () => {
    expect(scaleFactor(4, 0)).toBe(1);
    expect(scaleFactor(Number.NaN, 2)).toBe(1);
  });
});

describe("formatScaledAmount（缩放后的数字要像人写的）", () => {
  it("≥100 取整到 10", () => {
    expect(formatScaledAmount(300)).toBe("300");
    expect(formatScaledAmount(667)).toBe("670");
    expect(formatScaledAmount(104)).toBe("100");
  });

  it("2–100 取整", () => {
    expect(formatScaledAmount(4.5)).toBe("5");
    expect(formatScaledAmount(5.3)).toBe("5");
    expect(formatScaledAmount(12.6)).toBe("13");
  });

  it("1–2 保留一位小数", () => {
    expect(formatScaledAmount(1.5)).toBe("1.5");
    expect(formatScaledAmount(1.25)).toBe("1.3");
  });

  it("<1 保留两位小数并去掉多余的 0", () => {
    expect(formatScaledAmount(0.75)).toBe("0.75");
    expect(formatScaledAmount(0.5)).toBe("0.5");
    expect(formatScaledAmount(0)).toBe("0");
  });

  it("非有限数不产生 NaN 文案", () => {
    expect(formatScaledAmount(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("amountText · 基准份量（factor = 1）必须与原文完全一致", () => {
  it("数字与单位原样", () => {
    expect(amountText(2, "个").text).toBe("2个");
    expect(amountText(500, "g").text).toBe("500g");
    expect(amountText(20, "ml").text).toBe("20ml");
    expect(amountText(2, "个").scaled).toBe(false);
  });

  it("小数不取整", () => {
    expect(amountText(1.5, "勺").text).toBe("1.5勺");
  });

  it("中文数字保持中文（一根不会变成 1 根）", () => {
    expect(amountText("一", "根").text).toBe("一根");
    expect(amountText("半", "个").text).toBe("半个");
  });

  it("范围保持原样", () => {
    expect(amountText("10-15", "ml").text).toBe("10-15ml");
  });

  it("无用量", () => {
    expect(amountText(undefined, undefined).text).toBe("适量");
    expect(amountText(undefined, "g").text).toBe("— g");
  });
});

describe("amountText · 缩放（factor ≠ 1）", () => {
  it("数字用量 × 倍数", () => {
    expect(amountText(200, "g", 1.5).text).toBe("300g");
    expect(amountText(3, "g", 1.5).text).toBe("5g");
    expect(amountText(2, "个", 2).text).toBe("4个");
  });

  it("范围两端同比缩放（不会只缩放一端）", () => {
    expect(amountText("10-15", "ml", 1.5).text).toBe("15-23ml");
  });

  it("中文数字缩放后转成阿拉伯数字", () => {
    expect(amountText("一", "根", 1.5).text).toBe("1.5根");
    expect(amountText("半", "个", 2).text).toBe("1个");
  });

  it("无用量永远不动", () => {
    expect(amountText(undefined, undefined, 2).text).toBe("适量");
    expect(amountText(undefined, undefined, 2).scaled).toBe(false);
  });

  it("缩放后的结果标记为 scaled（界面据此高亮）", () => {
    expect(amountText(200, "g", 1.5).scaled).toBe(true);
  });

  it("范围写法兼容 10 - 15 / 10~15 / 10至15", () => {
    expect(amountText("10 - 15", "ml", 2).text).toBe("20-30ml");
    expect(amountText("10~15", "ml", 1.5).text).toBe("15-23ml");
    expect(amountText("10至15", "ml", 1.5).text).toBe("15-23ml");
  });
});

describe("ingredientAmountText", () => {
  it("直接作用于食材对象", () => {
    expect(ingredientAmountText({ name: "盐", amount: 300, unit: "g" }, 1.5).text).toBe("450g");
    expect(ingredientAmountText({ name: "葱" }, 2).text).toBe("适量");
  });
});

describe("servingNotice（步骤用量按基准写的提示）", () => {
  it("基准份量时不提示", () => {
    expect(servingNotice(2, 2)).toBeNull();
  });

  it("非基准份量时给出提示，写清两个人数", () => {
    const notice = servingNotice(2, 4);
    expect(notice).toContain("2 人份");
    expect(notice).toContain("4 人份");
    expect(notice).toContain("食材表");
  });
});
