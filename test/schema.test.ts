import { describe, expect, it } from "vitest";

import { kitchenStateSchema, kitchenWriteBodySchema, recipeSchema } from "../src/server/lib/schema.js";

const base = {
  id: "test-dish",
  name: "测试菜",
  category: "家常菜",
  difficulty: 1,
  servings: 2,
  ingredients: [{ name: "盐", amount: 2, unit: "g" }],
  steps: [{ text: "随便炒炒" }]
};

describe("kitchenStateSchema · user-state.json 的 kitchen 字段（CB-008）", () => {
  it("接受 tools 数组（含空数组 = 明确全不选）与可选 updatedAt", () => {
    expect(kitchenStateSchema.safeParse({ tools: ["炒锅"] }).success).toBe(true);
    expect(kitchenStateSchema.safeParse({ tools: [] }).success).toBe(true);
    expect(
      kitchenStateSchema.safeParse({ tools: [], updatedAt: "2026-09-21T00:00:00.000Z" }).success
    ).toBe(true);
  });

  it("结构不对时被拒绝（调用方据此当作「从没设置过」）", () => {
    expect(kitchenStateSchema.safeParse(null).success).toBe(false);
    expect(kitchenStateSchema.safeParse("炒锅").success).toBe(false);
    expect(kitchenStateSchema.safeParse({}).success).toBe(false);
    expect(kitchenStateSchema.safeParse({ tools: "炒锅" }).success).toBe(false);
    expect(kitchenStateSchema.safeParse({ tools: [1] }).success).toBe(false);
    expect(kitchenStateSchema.safeParse({ tools: [], updatedAt: "" }).success).toBe(false);
  });
});

describe("kitchenWriteBodySchema · 写接口请求体（CB-008）", () => {
  it("接受恰好 { tools: string[] }", () => {
    expect(kitchenWriteBodySchema.safeParse({ tools: ["炒锅", "烤箱"] }).success).toBe(true);
    expect(kitchenWriteBodySchema.safeParse({ tools: [] }).success).toBe(true);
  });

  it("**拒绝未知字段**（ADR-0003 §4：不靠\"多传的字段反正不看\"）", () => {
    expect(kitchenWriteBodySchema.safeParse({ tools: [], extra: 1 }).success).toBe(false);
    expect(kitchenWriteBodySchema.safeParse({ tools: [], force: true }).success).toBe(false);
  });

  it("tools 不是字符串数组时被拒绝", () => {
    expect(kitchenWriteBodySchema.safeParse({}).success).toBe(false);
    expect(kitchenWriteBodySchema.safeParse({ tools: "炒锅" }).success).toBe(false);
    expect(kitchenWriteBodySchema.safeParse({ tools: [1] }).success).toBe(false);
  });
});

describe("recipeSchema · equipment", () => {
  it("可以不填（旧文件保持兼容）", () => {
    expect(recipeSchema.safeParse(base).success).toBe(true);
  });

  it("填写时接受字符串数组", () => {
    const result = recipeSchema.safeParse({ ...base, equipment: ["炒锅", "锅铲"] });
    expect(result.success).toBe(true);
  });

  it("空字符串或非数组被拒绝", () => {
    expect(recipeSchema.safeParse({ ...base, equipment: [""] }).success).toBe(false);
    expect(recipeSchema.safeParse({ ...base, equipment: "炒锅" }).success).toBe(false);
  });
});

describe("recipeSchema · step.minutes", () => {
  it("表示这一步大概要多久（含等待），0 也合法", () => {
    expect(recipeSchema.safeParse({ ...base, steps: [{ text: "腌", minutes: 10 }] }).success).toBe(
      true
    );
    expect(recipeSchema.safeParse({ ...base, steps: [{ text: "马上", minutes: 0 }] }).success).toBe(
      true
    );
  });

  it("负数与 NaN 被拒绝", () => {
    expect(recipeSchema.safeParse({ ...base, steps: [{ text: "腌", minutes: -1 }] }).success).toBe(
      false
    );
    expect(recipeSchema.safeParse({ ...base, steps: [{ text: "腌", minutes: Number.NaN }] }).success).toBe(
      false
    );
    expect(
      recipeSchema.safeParse({ ...base, steps: [{ text: "腌", minutes: Number.POSITIVE_INFINITY }] })
        .success
    ).toBe(false);
  });
});

describe("recipeSchema · 其他数值字段", () => {
  it("servings 必须为正", () => {
    expect(recipeSchema.safeParse({ ...base, servings: 0 }).success).toBe(false);
    expect(recipeSchema.safeParse({ ...base, servings: 1 }).success).toBe(true);
  });

  it("prepMinutes / cookMinutes 可选且非负", () => {
    expect(recipeSchema.safeParse({ ...base, prepMinutes: 5, cookMinutes: 0 }).success).toBe(true);
    expect(recipeSchema.safeParse({ ...base, prepMinutes: -5 }).success).toBe(false);
  });
});
