/**
 * 浏览器本地存储。
 *
 * 每个键在注册表里**自带存储位置**（会话 / 长期），调用方不再传 kind——
 * 避免"写进 session 却从 local 读"这类静默错误。
 *
 * 隐私模式、配额不足等情况下 storage 会抛错；这些失败不该影响主流程，
 * 因此统一用返回值表达成功与否，不做静默吞异常。
 */

type StorageKind = "session" | "local";

interface StorageSlot {
  key: string;
  kind: StorageKind;
}

export const STORAGE_KEYS = {
  /** 列表页滚动位置（会话内） */
  homeScroll: { key: "cookbook:home:scroll", kind: "session" },
  /** 列表页地址（含搜索条件），用于从详情页返回（会话内） */
  homeUrl: { key: "cookbook:home:url", kind: "session" },
  /** 详情页字号偏好（长期） */
  fontScale: { key: "cookbook:fontScale", kind: "local" },
  /** 详情页是否保持屏幕常亮（长期） */
  keepAwake: { key: "cookbook:keepAwake", kind: "local" },
  /** 我的厨具（长期，JSON 字符串数组） */
  kitchen: { key: "cookbook:kitchen", kind: "local" },
  /** 某道菜的步骤完成状态（会话内） */
  stepsDone: (recipeId: string): StorageSlot => ({
    key: `cookbook:steps:${recipeId}`,
    kind: "session"
  }),
  /** 编辑页草稿（长期：刷新/误触返回后能接着改；存 `{recipeId, baseRevision, draft, savedAt}`） */
  editDraft: (recipeId: string): StorageSlot => ({
    key: `cookbook:edit-draft:${recipeId}`,
    kind: "local"
  }),
} as const satisfies Record<string, StorageSlot | ((id: string) => StorageSlot)>;

function getArea(kind: StorageKind): Storage | null {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function readStored(slot: StorageSlot): string | null {
  const area = getArea(slot.kind);
  if (!area) return null;

  try {
    return area.getItem(slot.key);
  } catch {
    return null;
  }
}

/** @returns 是否写入成功（失败只代表这次没能保存，不影响页面功能） */
export function writeStored(slot: StorageSlot, value: string): boolean {
  const area = getArea(slot.kind);
  if (!area) return false;

  try {
    area.setItem(slot.key, value);
    return true;
  } catch {
    return false;
  }
}

/** 删除一条记录（例如切回基准份量时清掉选择） */
export function removeStored(slot: StorageSlot): boolean {
  const area = getArea(slot.kind);
  if (!area) return false;

  try {
    area.removeItem(slot.key);
    return true;
  } catch {
    return false;
  }
}

/** 读取布尔开关，未设置过时返回 fallback */
export function readFlag(slot: StorageSlot, fallback: boolean): boolean {
  const raw = readStored(slot);
  if (raw === null) return fallback;
  return raw !== "0" && raw !== "false";
}
