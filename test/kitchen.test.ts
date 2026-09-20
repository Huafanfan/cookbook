import { describe, expect, it } from "vitest";

import {
  checkEquipment,
  formatToolGroup,
  kitchenVerdict,
  normalizeToolName,
  setAllMyTools,
  shortEquipmentLabel,
  toggleMyTool
} from "../src/client/lib/kitchen.js";

const MINE = ["炒锅", "砂锅", "空气炸锅", "烤箱", "电饭锅"];
/** 没有烤箱的情况：专门用来验证"靠替代满足" */
const MINE_NO_OVEN = ["炒锅", "砂锅", "空气炸锅", "电饭锅"];

describe("normalizeToolName", () => {
  it("忽略空白与大小写", () => {
    expect(normalizeToolName(" 炒 锅 ")).toBe("炒锅");
    expect(normalizeToolName("Air Fryer")).toBe("airfryer");
  });
});

describe("checkEquipment · 三态判定", () => {
  it("① 全部拥有 → 直接满足，无需替代", () => {
    const check = checkEquipment(["炒锅", "锅铲"], undefined, [...MINE, "锅铲"]);

    expect(check.satisfied).toBe(true);
    expect(check.substitutions).toEqual([]);
    expect(check.requirements.map((r) => r.state)).toEqual(["direct", "direct"]);
    expect(kitchenVerdict(check)).toBe("ready");
  });

  it("② 替代组内第一件就有 → 直接满足（不提示替代）", () => {
    const check = checkEquipment([], [["炒锅", "空气炸锅"]], MINE);

    expect(check.satisfied).toBe(true);
    expect(check.substitutions).toEqual([]);
    expect(check.requirements[0]).toMatchObject({ using: "炒锅", state: "direct" });
    expect(kitchenVerdict(check)).toBe("ready");
  });

  it("② 只有后面那件 → 靠替代满足，并记录用了什么代替什么", () => {
    const check = checkEquipment(["锅铲"], [["烤箱", "空气炸锅"]], [...MINE_NO_OVEN, "锅铲"]);

    expect(check.satisfied).toBe(true);
    expect(check.substitutions).toEqual([{ required: "烤箱", using: "空气炸锅" }]);
    expect(kitchenVerdict(check)).toBe("substituted");
    expect(shortEquipmentLabel(check)).toBe("用空气炸锅代替烤箱");
  });

  it("③ 组内一件都没有 → 完全不满足", () => {
    const check = checkEquipment(["蒸锅"], undefined, MINE);

    expect(check.satisfied).toBe(false);
    expect(check.missingGroups).toEqual([["蒸锅"]]);
    expect(kitchenVerdict(check)).toBe("blocked");
    expect(shortEquipmentLabel(check)).toBe("缺蒸锅");
  });

  it("③ 替代组全缺也算法不满足；卡片标记只显示第一件，避免过长", () => {
    const check = checkEquipment([], [["烤箱", "蒸锅"]], MINE_NO_OVEN);

    expect(check.satisfied).toBe(false);
    expect(check.missingGroups).toEqual([["烤箱", "蒸锅"]]);
    expect(shortEquipmentLabel(check)).toBe("缺烤箱");
  });
});

describe("checkEquipment · 边界", () => {
  it("菜谱没声明厨具 → declared=false，界面不显示任何厨具内容", () => {
    const check = checkEquipment(undefined, undefined, MINE);

    expect(check.declared).toBe(false);
    expect(check.satisfied).toBe(true);
    expect(kitchenVerdict(check)).toBe("not-declared");
    expect(shortEquipmentLabel(check)).toBeNull();
  });

  it("我的厨具为空 → 全部不满足（界面另有\"先设置\"提示）", () => {
    const check = checkEquipment(["炒锅"], undefined, []);

    expect(check.satisfied).toBe(false);
  });

  it("归一化后同名视为同一件", () => {
    const check = checkEquipment([" 炒锅 "], undefined, ["炒锅"]);

    expect(check.satisfied).toBe(true);
  });

  it("重复的厨具只判定一次", () => {
    const check = checkEquipment(["炒锅", "炒锅"], undefined, MINE);

    expect(check.requirements).toHaveLength(1);
  });

  it("完全相同的替代组只保留一组", () => {
    const check = checkEquipment([], [["烤箱", "空气炸锅"], ["烤箱", "空气炸锅"]], MINE);

    expect(check.requirements).toHaveLength(1);
  });

  it("空组被忽略（不产生\"无所求\"的组）", () => {
    const check = checkEquipment([], [[]], MINE);

    expect(check.requirements).toHaveLength(0);
  });
});

describe("formatToolGroup", () => {
  it("多件用「或」连接", () => {
    expect(formatToolGroup(["烤箱", "空气炸锅"])).toBe("烤箱 或 空气炸锅");
    expect(formatToolGroup(["蒸锅"])).toBe("蒸锅");
  });
});

describe("我的厨具维护（只允许词表里的值）", () => {
  it("勾选不存在的厨具 = 加入", () => {
    expect(toggleMyTool(["炒锅"], "蒸锅")).toEqual(["炒锅", "蒸锅"]);
  });

  it("勾选已有的厨具 = 移除", () => {
    expect(toggleMyTool(["炒锅", "蒸锅"], "炒锅")).toEqual(["蒸锅"]);
  });

  it("按归一化匹配（空白/大小写），不会产生重复项", () => {
    expect(toggleMyTool(["炒锅"], " 炒 锅 ")).toEqual([]);
  });

  it("全选 / 全不选", () => {
    expect(setAllMyTools(["炒锅", "蒸锅"], true)).toEqual(["炒锅", "蒸锅"]);
    expect(setAllMyTools(["炒锅", "蒸锅"], false)).toEqual([]);
  });
});
