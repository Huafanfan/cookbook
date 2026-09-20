import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { keepKnownTools, normalizeToolName } from "../src/shared/equipment.js";
import { loadEquipmentList } from "../src/server/lib/equipment.js";
import { createRecipeSchema } from "../src/server/lib/schema.js";

let tempDir: string | null = null;

async function setupEquipment(content: string | null): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "cookbook-equipment-"));
  if (content !== null) {
    await writeFile(join(tempDir, "equipment.json"), content, "utf8");
  }
  return tempDir;
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("loadEquipmentList", () => {
  it("正常载入词表与默认勾选", async () => {
    const dir = await setupEquipment(
      JSON.stringify({ tools: ["炒锅", "蒸锅"], defaultOwned: ["炒锅"] })
    );

    const list = await loadEquipmentList(dir);

    expect(list.problem).toBeNull();
    expect(list.tools).toEqual(["炒锅", "蒸锅"]);
    expect(list.defaultOwned).toEqual(["炒锅"]);
  });

  it("文件不存在 → 给出原因但不抛错（不能因此阻止服务启动）", async () => {
    const dir = await setupEquipment(null);

    const list = await loadEquipmentList(dir);

    expect(list.tools).toEqual([]);
    expect(list.problem).toContain("不存在");
  });

  it("JSON 语法错误 → 给出原因", async () => {
    const dir = await setupEquipment("{ 这不是 JSON");

    const list = await loadEquipmentList(dir);

    expect(list.problem).toContain("解析失败");
  });

  it("格式不正确（tools 为空）→ 给出原因", async () => {
    const dir = await setupEquipment(JSON.stringify({ tools: [] }));

    const list = await loadEquipmentList(dir);

    expect(list.problem).toContain("格式不正确");
  });

  it("defaultOwned 里有词表外的名字 → 忽略并告警，不影响词表", async () => {
    const dir = await setupEquipment(
      JSON.stringify({ tools: ["炒锅"], defaultOwned: ["炒锅", "蒸锅"] })
    );

    const list = await loadEquipmentList(dir);

    expect(list.problem).toBeNull();
    expect(list.defaultOwned).toEqual(["炒锅"]);
    expect(list.warnings[0]).toContain("蒸锅");
  });

  it("纯空白条目被拒绝（先 trim 再校验）", async () => {
    const dir = await setupEquipment(JSON.stringify({ tools: ["炒锅", "   "] }));

    const list = await loadEquipmentList(dir);

    expect(list.problem).toContain("格式不正确");
    expect(list.tools).toEqual([]);
  });

  it("条目两端的空白会被裁掉", async () => {
    const dir = await setupEquipment(JSON.stringify({ tools: ["  炒锅  "] }));

    const list = await loadEquipmentList(dir);

    expect(list.tools).toEqual(["炒锅"]);
  });

  it("词表去重（归一化后同名只留一件）", async () => {
    const dir = await setupEquipment(JSON.stringify({ tools: ["炒锅", " 炒锅 "] }));

    const list = await loadEquipmentList(dir);

    expect(list.tools).toEqual(["炒锅"]);
  });
});

describe("keepKnownTools", () => {
  it("只保留词表里的项，并按词表顺序归一", () => {
    expect(keepKnownTools(["蒸锅", "炒锅", "蒸笼"], ["炒锅", "蒸锅"])).toEqual(["蒸锅", "炒锅"]);
  });

  it("词表为空（未载入）时原样返回，不把用户的厨具清空", () => {
    expect(keepKnownTools(["炒锅"], [])).toEqual(["炒锅"]);
  });

  it("归一化匹配：本地存的 ' 炒 锅 ' 能对上词表里的 炒锅", () => {
    expect(keepKnownTools([" 炒 锅 "], ["炒锅"])).toEqual(["炒锅"]);
  });
});

describe("createRecipeSchema 的厨具词表校验", () => {
  const base = {
    id: "test-dish",
    name: "测试菜",
    category: "家常菜",
    difficulty: 1,
    servings: 2,
    ingredients: [{ name: "盐", amount: 2, unit: "g" }],
    steps: [{ text: "随便炒炒" }]
  };

  it("词表外名字 → 校验失败，且错误信息给出可选值", () => {
    const schema = createRecipeSchema({ allowedTools: ["炒锅", "蒸锅"] });
    const result = schema.safeParse({ ...base, equipment: ["不粘锅"] });

    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join(" ");
      expect(message).toContain("不粘锅");
      expect(message).toContain("炒锅");
      expect(result.error.issues[0].path).toEqual(["equipment", 0]);
    }
  });

  it("替代组里的名字同样校验，路径能定位到组内位置", () => {
    const schema = createRecipeSchema({ allowedTools: ["炒锅"] });
    const result = schema.safeParse({
      ...base,
      equipmentAlternatives: [["炒锅", "空气炸锅"]]
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["equipmentAlternatives", 0, 1]);
    }
  });

  it("词表内有空白差异的名字仍算命中", () => {
    const schema = createRecipeSchema({ allowedTools: ["炒锅"] });
    expect(schema.safeParse({ ...base, equipment: [" 炒锅 "] }).success).toBe(true);
  });

  it("不提供词表时跳过该校验（词表未载入也不能误杀菜谱）", () => {
    const schema = createRecipeSchema();
    expect(schema.safeParse({ ...base, equipment: ["不粘锅"] }).success).toBe(true);
  });

  it("没有厨具字段的菜谱不受影响", () => {
    const schema = createRecipeSchema({ allowedTools: ["炒锅"] });
    expect(schema.safeParse(base).success).toBe(true);
  });
});

describe("normalizeToolName", () => {
  it("去空白、忽略大小写", () => {
    expect(normalizeToolName(" Air Fryer ")).toBe("airfryer");
  });
});
