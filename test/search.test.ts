import { describe, expect, it } from "vitest";

import type { Recipe } from "../src/shared/types.js";
import { matchKeyword, searchRecipes, toSummary } from "../src/server/services/search.js";

const tomatoEgg: Recipe = {
  id: "xi-hong-shi-chao-ji-dan",
  name: "西红柿炒鸡蛋",
  aliases: ["番茄炒蛋"],
  category: "家常菜",
  tags: ["快手", "下饭"],
  difficulty: 1,
  servings: 2,
  prepMinutes: 5,
  cookMinutes: 7,
  ingredients: [
    { name: "西红柿", amount: 2, unit: "个" },
    { name: "鸡蛋", amount: 3, unit: "个" },
    { name: "小葱", amount: 1, unit: "根" }
  ],
  steps: [{ text: "打蛋" }, { text: "炒" }]
};

const cola: Recipe = {
  id: "ke-le-ji-chi",
  name: "可乐鸡翅",
  category: "家常菜",
  tags: ["宴客"],
  difficulty: 1,
  servings: 3,
  ingredients: [{ name: "鸡翅中", amount: 500, unit: "g" }],
  steps: [{ text: "腌" }]
};

const recipes = [tomatoEgg, cola];

describe("matchKeyword", () => {
  it("命中菜名时排在最前", () => {
    expect(matchKeyword(tomatoEgg, "西红柿")).toEqual({ matched: true, rank: 0 });
  });

  it("命中别名", () => {
    expect(matchKeyword(tomatoEgg, "番茄")).toEqual({ matched: true, rank: 1 });
  });

  it("命中食材（该词不出现在菜名里）", () => {
    expect(matchKeyword(tomatoEgg, "小葱")).toEqual({ matched: true, rank: 3 });
  });

  it("词同时出现在菜名与食材里时，按菜名算", () => {
    expect(matchKeyword(tomatoEgg, "鸡蛋")).toEqual({ matched: true, rank: 0 });
  });

  it("忽略大小写与空格", () => {
    expect(matchKeyword(tomatoEgg, " 西 红 柿 ")).toEqual({ matched: true, rank: 0 });
  });

  it("不相关关键词不命中", () => {
    expect(matchKeyword(cola, "西红柿").matched).toBe(false);
  });
});

describe("searchRecipes", () => {
  it("无参数返回全部", () => {
    expect(searchRecipes(recipes, {})).toHaveLength(2);
  });

  it("按食材搜索能命中", () => {
    const result = searchRecipes(recipes, { q: "小葱" });
    expect(result.map((recipe) => recipe.id)).toEqual(["xi-hong-shi-chao-ji-dan"]);
  });

  it("多关键词需要同时命中", () => {
    expect(searchRecipes(recipes, { q: "可乐 鸡翅" })).toHaveLength(1);
    expect(searchRecipes(recipes, { q: "可乐 西红柿" })).toHaveLength(0);
  });

  it("分类筛选", () => {
    expect(searchRecipes(recipes, { category: "家常菜" })).toHaveLength(2);
    expect(searchRecipes(recipes, { category: "汤羹" })).toHaveLength(0);
  });

  it("标签筛选可与关键词叠加", () => {
    expect(searchRecipes(recipes, { tag: "快手" })).toHaveLength(1);
    expect(searchRecipes(recipes, { tag: "快手", q: "可乐" })).toHaveLength(0);
  });

  it("菜名命中排在食材命中之前", () => {
    // 两道菜都含食材"西红柿"，但只有 tomatoEgg 的菜名里有它
    const byIngredientOnly: Recipe = {
      ...tomatoEgg,
      id: "dan-chao-fan",
      name: "蛋炒饭",
      aliases: [],
      tags: [],
      ingredients: [{ name: "西红柿" }]
    };

    const result = searchRecipes([byIngredientOnly, tomatoEgg], { q: "西红柿" });

    expect(result.map((recipe) => recipe.id)).toEqual(["xi-hong-shi-chao-ji-dan", "dan-chao-fan"]);
  });
});

describe("toSummary", () => {
  it("汇总耗时并带上食材名", () => {
    const summary = toSummary(tomatoEgg);
    expect(summary.totalMinutes).toBe(12);
    expect(summary.ingredientNames).toEqual(["西红柿", "鸡蛋", "小葱"]);
    expect(summary.coverImage).toBeNull();
  });

  it("没有时间字段时不返回耗时", () => {
    expect(toSummary(cola).totalMinutes).toBeUndefined();
  });
});
