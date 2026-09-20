import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { normalizeToolName } from "../../shared/equipment.js";

/**
 * 厨具词表的载入与校验。
 *
 * 文件缺失或格式错误都**不阻止服务启动**：厨具功能退化为"清单未载入"，
 * 菜谱里的厨具字段一并跳过校验，避免因为一个配置文件误杀所有菜谱。
 */

// 先 trim 再判长度：否则 "  " 这种纯空白条目会通过 min(1) 然后在 trim 后变成空字符串进词表
const toolNameSchema = z.string().trim().min(1, "厨具名不能为空");

const equipmentFileSchema = z.object({
  tools: z.array(toolNameSchema).min(1, "tools 至少要有一件厨具"),
  defaultOwned: z.array(toolNameSchema).optional()
});

export const EQUIPMENT_FILE_NAME = "equipment.json";

export interface EquipmentList {
  /** 权威词表；空数组表示未载入 */
  tools: string[];
  /** 未设置过"我的厨具"时默认勾选的项（保证是 tools 的子集） */
  defaultOwned: string[];
  /** 载入失败的原因；null 表示一切正常 */
  problem: string | null;
  /** 需要记录的告警（例如 defaultOwned 里有词表外的名字） */
  warnings: string[];
}

export const EMPTY_EQUIPMENT_LIST: EquipmentList = {
  tools: [],
  defaultOwned: [],
  problem: null,
  warnings: []
};

function dedupeByName(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = normalizeToolName(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function loadEquipmentList(dataDir: string): Promise<EquipmentList> {
  const file = join(dataDir, EQUIPMENT_FILE_NAME);

  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      ...EMPTY_EQUIPMENT_LIST,
      problem:
        code === "ENOENT"
          ? `厨具清单未载入：${EQUIPMENT_FILE_NAME} 不存在`
          : `厨具清单读取失败：${(error as Error).message}`
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    return {
      ...EMPTY_EQUIPMENT_LIST,
      problem: `厨具清单 JSON 解析失败：${(error as Error).message}`
    };
  }

  const parsed = equipmentFileSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const reason = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "根"}: ${issue.message}`)
      .join("; ");
    return { ...EMPTY_EQUIPMENT_LIST, problem: `厨具清单格式不正确：${reason}` };
  }

  const tools = dedupeByName(parsed.data.tools);
  const allowed = new Set(tools.map(normalizeToolName));
  const warnings: string[] = [];

  const defaultOwned = (parsed.data.defaultOwned ?? []).filter((tool) => {
    const known = allowed.has(normalizeToolName(tool));
    if (!known) warnings.push(`defaultOwned 里的"${tool}"不在厨具词表里，已忽略`);
    return known;
  });

  return { tools, defaultOwned: dedupeByName(defaultOwned), problem: null, warnings };
}
