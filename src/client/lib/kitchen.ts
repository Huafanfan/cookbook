import { normalizeToolName } from "../../shared/equipment";
import { readStored, STORAGE_KEYS, writeStored } from "./storage";

/**
 * 厨具匹配：判断"我有的厨具能不能做这道菜"。
 *
 * 这里是厨具判定的**唯一权威实现**（纯函数，不碰 DOM），界面只负责呈现结果。
 * 厨具是**受控词表**里的值（`data/equipment.json`），不允许自由填写。
 * 需求来源与三态定义见 docs/features/CB-002-kitchen-tools.md。
 */

export { normalizeToolName };

/** 判定结果：直接满足 / 靠替代满足 / 完全不满足 */
export type RequirementState = "direct" | "substituted" | "missing";

export interface RequirementResult {
  /** 菜谱声明的这一组；第一件是菜谱点名的 */
  tools: string[];
  /** 我实际用哪一件满足的（不满足为 null） */
  using: string | null;
  state: RequirementState;
}

export interface EquipmentCheck {
  requirements: RequirementResult[];
  /** 是否所有组都满足（直接或替代） */
  satisfied: boolean;
  /** 完全不满足的组（组内一件都没有） */
  missingGroups: string[][];
  /** 需要替代的项 */
  substitutions: { required: string; using: string }[];
  /** 菜谱是否声明了厨具；没声明时界面不显示任何厨具内容 */
  declared: boolean;
}

function dedupeTools(tools: string[]): string[] {
  const seen = new Set<string>();
  return tools.filter((tool) => {
    const key = normalizeToolName(tool);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeGroups(groups: string[][]): string[][] {
  const seen = new Set<string>();

  return groups
    .map(dedupeTools)
    .filter((group) => group.length > 0)
    .filter((group) => {
      const signature = group.map(normalizeToolName).join("|");
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
}

export function checkEquipment(
  equipment: string[] | undefined,
  alternatives: string[][] | undefined,
  owned: string[]
): EquipmentCheck {
  const ownedSet = new Set(owned.map(normalizeToolName));

  const groups = dedupeGroups([
    ...(equipment ?? []).map((tool) => [tool]),
    ...(alternatives ?? [])
  ]);

  const requirements: RequirementResult[] = groups.map((tools) => {
    const matchIndex = tools.findIndex((tool) => ownedSet.has(normalizeToolName(tool)));

    if (matchIndex === -1) {
      return { tools, using: null, state: "missing" as const };
    }

    return {
      tools,
      using: tools[matchIndex],
      state: matchIndex === 0 ? ("direct" as const) : ("substituted" as const)
    };
  });

  const missingGroups = requirements
    .filter((requirement) => requirement.state === "missing")
    .map((requirement) => requirement.tools);

  const substitutions = requirements.flatMap((requirement) =>
    requirement.state === "substituted" && requirement.using
      ? [{ required: requirement.tools[0], using: requirement.using }]
      : []
  );

  return {
    requirements,
    satisfied: missingGroups.length === 0,
    missingGroups,
    substitutions,
    declared: requirements.length > 0
  };
}

/** 一句话结论（详情页与列表页共用，避免两处措辞不一致） */
export type KitchenVerdict = "not-declared" | "ready" | "substituted" | "blocked";

export function kitchenVerdict(check: EquipmentCheck): KitchenVerdict {
  if (!check.declared) return "not-declared";
  if (!check.satisfied) return "blocked";
  return check.substitutions.length > 0 ? "substituted" : "ready";
}

/** 把一组厨具写成"烤箱 或 空气炸锅" */
export function formatToolGroup(group: string[]): string {
  return group.join(" 或 ");
}

/**
 * 列表卡片用的一句话：缺什么 / 用什么替代。
 *
 * 卡片要能一眼扫过，所以完全不满足时**只显示第一件**；
 * 完整说明（"缺 炒锅 或 电饭锅 或 空气炸锅"）留在详情页。
 */
export function shortEquipmentLabel(check: EquipmentCheck): string | null {
  const verdict = kitchenVerdict(check);

  if (verdict === "blocked") {
    return `缺${check.missingGroups[0][0]}`;
  }
  if (verdict === "substituted") {
    const first = check.substitutions[0];
    return `用${first.using}代替${first.required}`;
  }
  return null;
}

/* ---------- 我的厨具：读写（存浏览器本地） ---------- */

/** @returns null 表示从未设置过（此时用服务端给的 defaultOwned）；空数组表示用户明确清空了 */
export function readMyTools(): string[] | null {
  const raw = readStored(STORAGE_KEYS.kitchen);
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

export function writeMyTools(tools: string[]): boolean {
  return writeStored(STORAGE_KEYS.kitchen, JSON.stringify(tools));
}

/** 勾选/取消一件厨具（只能是词表里的值） */
export function toggleMyTool(tools: string[], tool: string): string[] {
  const key = normalizeToolName(tool);
  const has = tools.some((item) => normalizeToolName(item) === key);
  return has ? tools.filter((item) => normalizeToolName(item) !== key) : [...tools, tool];
}

/** 全选 / 全不选 */
export function setAllMyTools(all: string[], owned: boolean): string[] {
  return owned ? [...all] : [];
}
