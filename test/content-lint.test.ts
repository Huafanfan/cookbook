import { describe, expect, it } from "vitest";

import { lintRecipeContent } from "../src/server/lib/content-lint.js";
import type { Recipe } from "../src/shared/types.js";

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "test-dish",
    name: "测试菜",
    category: "家常菜",
    difficulty: 1,
    servings: 2,
    ingredients: [{ name: "盐", amount: 3, unit: "g" }],
    steps: [{ text: "随便炒炒" }],
    ...overrides
  };
}

describe("lintRecipeContent · 步骤时间", () => {
  it("文案里的分钟数与 minutes 一致 → 通过", () => {
    const issues = lintRecipeContent(
      makeRecipe({ steps: [{ text: "焖 12 分钟。", minutes: 12 }] })
    );

    expect(issues).toEqual([]);
  });

  it("文案没写分钟 → 不要求 minutes（很多步骤只是操作时长）", () => {
    const issues = lintRecipeContent(makeRecipe({ steps: [{ text: "翻炒均匀。" }] }));

    expect(issues).toEqual([]);
  });

  it("分钟数与 minutes 不一致 → 报错并指出两处的值", () => {
    const issues = lintRecipeContent(
      makeRecipe({ steps: [{ text: "冷水下锅焯 2 分钟。", minutes: 3 }] })
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("steps[0].minutes");
    expect(issues[0].message).toContain("3");
    expect(issues[0].message).toContain("2");
  });

  it("文案写了分钟但没填 minutes → 报错（这一步无法一键计时）", () => {
    const issues = lintRecipeContent(makeRecipe({ steps: [{ text: "腌 10 分钟。" }] }));

    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("steps[0].minutes");
  });

  it("同一步骤出现两个不相连的分钟数 → 警告（无法计时，但不是错误）", () => {
    const issues = lintRecipeContent(
      makeRecipe({ steps: [{ text: "焯 2 分钟，再焖 5 分钟。", minutes: 2 }] })
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].message).toContain("多个时间");
  });

  it("时间段（15-20 分钟）+ minutes 落在范围内 → 通过", () => {
    const issues = lintRecipeContent(
      makeRecipe({ steps: [{ text: "中小火焖 15-20 分钟。", minutes: 15 }] })
    );

    expect(issues).toEqual([]);
  });

  it("时间段 + minutes 落在范围外 → 错误", () => {
    const issues = lintRecipeContent(
      makeRecipe({ steps: [{ text: "中小火焖 15-20 分钟。", minutes: 30 }] })
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain("不在文案的时间段");
  });

  it("时间段但没有 minutes → 警告（不是错误）", () => {
    const issues = lintRecipeContent(makeRecipe({ steps: [{ text: "焖 15-20 分钟。" }] }));

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  it("tip 里的分钟数不参与检查（提示可以写更细的子时间）", () => {
    const issues = lintRecipeContent(
      makeRecipe({
        steps: [{ text: "翻炒出汁。", minutes: 3, tip: "不出汁就加盖焖 1 分钟。" }]
      })
    );

    expect(issues).toEqual([]);
  });
});

describe("lintRecipeContent · 食材", () => {
  it("同组同名重复 → 警告（原文可能是分阶段使用）", () => {
    const issues = lintRecipeContent(
      makeRecipe({
        ingredients: [
          { name: "盐", amount: 3, unit: "g", group: "调料" },
          { name: "盐", amount: 2, unit: "g", group: "调料" }
        ]
      })
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].path).toBe("ingredients[1].name");
  });

  it("不同组同名不算重复（腌料里的盐和调料里的盐是两件事）", () => {
    const issues = lintRecipeContent(
      makeRecipe({
        ingredients: [
          { name: "盐", amount: 3, unit: "g", group: "腌料" },
          { name: "盐", amount: 2, unit: "g", group: "调料" }
        ]
      })
    );

    expect(issues).toEqual([]);
  });
});
