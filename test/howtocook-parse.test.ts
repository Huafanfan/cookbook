import { describe, expect, it } from "vitest";

import {
  extractHeat,
  extractMinutes,
  mapCategory,
  mapDifficulty,
  matchTools,
  parseHowToCookMarkdown,
  parseIngredientLine,
  parseServings,
  parseSteps
} from "../src/server/lib/howtocook-parse.js";

describe("mapDifficulty / mapCategory", () => {
  it("星级映射到三档", () => {
    expect(mapDifficulty(1)).toBe(1);
    expect(mapDifficulty(2)).toBe(1);
    expect(mapDifficulty(3)).toBe(2);
    expect(mapDifficulty(4)).toBe(3);
    expect(mapDifficulty(5)).toBe(3);
    expect(mapDifficulty(0)).toBe(1);
  });

  it("目录名映射到分类", () => {
    expect(mapCategory("meat_dish")).toBe("家常菜");
    expect(mapCategory("vegetable_dish")).toBe("家常菜");
    expect(mapCategory("soup")).toBe("汤羹");
    expect(mapCategory("staple")).toBe("主食");
    expect(mapCategory("unknown_dir")).toBe("家常菜");
  });
});

describe("parseIngredientLine（原文的用量写法）", () => {
  it("名称 + 数字 + 单位", () => {
    expect(parseIngredientLine("- 豆腐 100 g")).toEqual({
      name: "豆腐",
      amount: 100,
      unit: "g",
      note: undefined
    });
  });

  it("范围用量保留成字符串（本项目允许字符串用量）", () => {
    const parsed = parseIngredientLine("- 食用油 10-15ml");
    expect(parsed?.name).toBe("食用油");
    expect(parsed?.amount).toBe("10-15");
    expect(parsed?.unit).toBe("ml");
  });

  it("中文数字保留原样（更忠实：一根 / 一块 / 一头）", () => {
    expect(parseIngredientLine("- 葱 一根")?.amount).toBe("一");
    expect(parseIngredientLine("- 葱 一根")?.unit).toBe("根");
    expect(parseIngredientLine("- 姜 一块")?.amount).toBe("一");
  });

  it("括号说明进 note，不干扰用量解析", () => {
    const parsed = parseIngredientLine("- 土豆 2 个（每个土豆大约重 120g，共约 240g）");
    expect(parsed?.name).toBe("土豆");
    expect(parsed?.amount).toBe(2);
    expect(parsed?.unit).toBe("个");
    expect(parsed?.note).toContain("每个土豆大约重 120g");
  });

  it("名称里含数字/中文数字时不会把名称切开（五花肉 / 三文鱼）", () => {
    expect(parseIngredientLine("- 五花肉 500g")?.name).toBe("五花肉");
    expect(parseIngredientLine("- 三文鱼 200 g")?.name).toBe("三文鱼");
    expect(parseIngredientLine("- 五花肉")?.name).toBe("五花肉");
  });

  it("去掉名称尾部的等号（原文有 `- 淀粉 = 1 汤匙`）", () => {
    expect(parseIngredientLine("- 淀粉 = 1 汤匙")?.name).toBe("淀粉");
  });

  it("公式型的量把尾巴并进 note（`虾 250g * 份数（建议 1-2 人份）`）", () => {
    const parsed = parseIngredientLine("- 虾 250g * 份数（建议 1-2 人份）");
    expect(parsed?.name).toBe("虾");
    expect(parsed?.amount).toBe(250);
    expect(parsed?.unit).toBe("g");
    expect(parsed?.note).toContain("份数");
    expect(parsed?.note).toContain("建议 1-2 人份");
  });

  it("`+` 也是原文的列表符号", () => {
    expect(parseIngredientLine("+ 白糖 5g")?.name).toBe("白糖");
  });

  it("没有用量时只给名称", () => {
    expect(parseIngredientLine("- 盐")?.amount).toBeUndefined();
  });
});

describe("parseServings（原文的份量声明）", () => {
  it("明确声明两人份", () => {
    expect(parseServings("每次制作前需要确定计划做几份。一份正好够 2 个人吃。")).toEqual({
      servings: 2,
      stated: true
    });
  });

  it("声明一人份（存在这种写法）", () => {
    expect(parseServings("一份正好够 1 个人食用").servings).toBe(1);
  });

  it("范围取下限（够 1~2 个人吃 → 1）", () => {
    expect(parseServings("这里一份够 1~2 个人吃。").servings).toBe(1);
  });

  it("中文数字也认", () => {
    expect(parseServings("一份正好够一个人吃").servings).toBe(1);
  });

  it("没声明时按官方模板约定记 2，并标记未声明", () => {
    expect(parseServings("这里没有份量说明")).toEqual({ servings: 2, stated: false });
  });
});

describe("extractMinutes / extractHeat", () => {
  it("单个分钟数取该值", () => {
    expect(extractMinutes("焯 2 分钟")).toBe(2);
  });

  it("时间段取下限（先检查，避免糊锅）", () => {
    expect(extractMinutes("中小火焖 15-20 分钟")).toBe(15);
  });

  it("多个不相连的时间不猜", () => {
    expect(extractMinutes("焯 2 分钟，捞出后再焖 5 分钟")).toBeUndefined();
  });

  it("只有秒不填（本项目计时单位是分钟）", () => {
    expect(extractMinutes("翻炒 30 S")).toBeUndefined();
  });

  it("火候唯一时才填；出现两种火候（换火）则不猜", () => {
    expect(extractHeat("中小火煎至金黄")).toBe("中小火");
    expect(extractHeat("大火烧开转中小火焖 12 分钟")).toBeUndefined();
  });
});

describe("matchTools（只认词表里的厨具，且不猜）", () => {
  it("把原文写法映射到词表规范名", () => {
    expect(matchTools("蒸锅或电蒸炉")).toEqual(["蒸锅"]);
    expect(matchTools("不粘锅")).toEqual(["平底锅"]);
    expect(matchTools("电饭煲")).toEqual(["电饭锅"]);
  });

  it("词表外的器具不记（刀、砧板、耐热盘属通用器皿）", () => {
    expect(matchTools("耐热盘（适合蒸的盘子）")).toEqual([]);
    expect(matchTools("刀和砧板")).toEqual([]);
  });

  it("同一句里的多种锅具返回多个（形成替代组）", () => {
    expect(matchTools("炒锅或平底锅").sort()).toEqual(["炒锅", "平底锅"].sort());
  });
});

describe("parseSteps（正文可能在子要点里）", () => {
  it("编号项为一步，粗体前缀作小标题", () => {
    const steps = parseSteps("1. **准备酱汁**：在小碗里混合调料\n2. 摆盘后上锅");
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ title: "准备酱汁", text: "在小碗里混合调料" });
    expect(steps[1].text).toBe("摆盘后上锅");
  });

  it("只有小标题、正文全在子要点里时，子要点当正文（否则步骤会空）", () => {
    const steps = parseSteps("1. **检查与清洗**：\n   - 冲洗干净\n   - 切成 5 厘米的段");
    expect(steps).toHaveLength(1);
    expect(steps[0].title).toBe("检查与清洗");
    expect(steps[0].text).toContain("冲洗干净");
    expect(steps[0].tip).toBeUndefined();
  });

  it("正文存在时，子要点作提示", () => {
    const steps = parseSteps("1. 蒸 8 分钟\n   - 视大小调整时间");
    expect(steps[0].text).toBe("蒸 8 分钟");
    expect(steps[0].minutes).toBe(8);
    expect(steps[0].tip).toContain("视大小调整时间");
  });
});

describe("parseHowToCookMarkdown（端到端）", () => {
  const markdown = `# 测试菜的做法

这是一道测试用的菜，从备料到出锅大约需要 20 分钟。

预估烹饪难度：★★★

预估卡路里：300 大卡

## 必备原料和工具

+ 猪肉
+ 青椒

### 工具

- 蒸锅

## 计算

每次制作前需要确定计划做几份。这里一份够 1~2 个人吃。

### 腌料

- 猪肉 250g

### 调味

- 酱油 15ml
- 白糖 5g

## 操作

1. **腌制**：抓匀腌 10 分钟
2. 上锅蒸 8 分钟
3. 出锅装盘

## 附加内容

- 猪肉选五花肉更香
- 如果您遵循本指南的制作流程而发现有问题或可以改进的流程，请提出 Issue 或 Pull request 。
`;

  const options = { category: "家常菜", source: "HowToCook（Unlicense 公有领域）" };

  it("字段全部映射到位", () => {
    const { dish } = parseHowToCookMarkdown(markdown, options);

    expect(dish?.name).toBe("测试菜");
    expect(dish?.category).toBe("家常菜");
    expect(dish?.summary).toContain("测试用的菜");
    expect(dish?.difficulty).toBe(2);
    expect(dish?.cookMinutes).toBe(20);
    expect(dish?.servings).toBe(1); // 原文声明 1~2 人，取下限
    expect(dish?.source).toBe(options.source);
  });

  it("「计算」按阶段分组，同名食材不算重复", () => {
    const { dish } = parseHowToCookMarkdown(markdown, options);
    const groups = [...new Set(dish?.ingredients.map((item) => item.group))];

    expect(groups).toContain("腌料");
    expect(groups).toContain("调味");
    expect(dish?.ingredients.find((item) => item.name === "酱油")?.group).toBe("调味");
  });

  it("原文明确写出的厨具才进 equipment（工具小节）", () => {
    const { dish } = parseHowToCookMarkdown(markdown, options);

    expect(dish?.equipment).toEqual(["蒸锅"]);
  });

  it("步骤解析出时间，附加内容进 tips 且过滤掉模板尾巴", () => {
    const { dish } = parseHowToCookMarkdown(markdown, options);

    expect(dish?.steps).toHaveLength(3);
    expect(dish?.steps[0].minutes).toBe(10);
    expect(dish?.tips).toEqual(["猪肉选五花肉更香"]);
  });

  it("原文没写份量时记 2 并注明是模板约定", () => {
    const withoutServing = markdown.replace(/每次制作前需要确定计划做几份。这里一份够 1~2 个人吃。/, "");
    const { dish } = parseHowToCookMarkdown(withoutServing, options);

    expect(dish?.servings).toBe(2);
    expect(dish?.source).toContain("原文未声明份量");
  });

  it("没有一级标题时返回失败原因而不是抛错", () => {
    const outcome = parseHowToCookMarkdown("没有任何标题的内容", options);

    expect(outcome.dish).toBeNull();
    expect(outcome.issues[0]).toContain("一级标题");
  });
});
