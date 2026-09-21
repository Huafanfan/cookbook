import { createHash, randomBytes } from "node:crypto";

import type { Recipe } from "../../shared/types.js";

/**
 * 写入协议里的纯函数（CB-009）：哈希、序列化、历史 ID。
 *
 * 放在单独文件里是因为这些是**可测的约定**：并发守卫用的哈希必须与磁盘字节一一对应，
 * 落盘文本必须与既有约定一致（否则每次保存都产生无谓 diff）。
 * 文件系统操作不在这里（在 recipe-repository.ts，唯一的数据访问入口）。
 */

/**
 * 文件**字节**的完整 SHA-256，带 `sha256:` 前缀让值自描述。
 *
 * 用途是并发控制（`revision`）：手工改文件不会更新 `updatedAt`，只有字节哈希靠得住。
 * 注意：它**不是**语义哈希 —— CB-010 的三方合并用另一种（canonical 投影）哈希。
 */
export function revisionOfBytes(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** 落盘文本：与导入器一致（2 空格缩进 + 末尾换行），避免每次保存都重排整个文件 */
export function serializeRecipe(recipe: Recipe): string {
  return `${JSON.stringify(recipe, null, 2)}\n`;
}

/**
 * 历史记录 ID：时间戳 + 随机短串（形如 `20260921T143305Z-7f3a`）。
 *
 * **不能拿内容 `revision` 当历史 ID**：同一内容会被保存多次，revision 会重复，
 * 而历史文件名必须唯一（用 `wx` 独占创建，撞名就换一个）。
 */
export function newHistoryId(
  now: Date = new Date(),
  random: () => string = () => randomBytes(2).toString("hex")
): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-${random()}`;
}

/** 历史文件名：`<historyId>-<source>.json`（文件名即索引，列表按名字倒序即是时间倒序） */
export function historyFileName(historyId: string, source: string): string {
  return `${historyId}-${source}.json`;
}

/** 历史 ID 只允许这些字符（用于从 URL 参数定位文件，挡住路径穿越） */
export const HISTORY_ID_PATTERN = /^[0-9A-Za-z-]{8,64}$/;

export function isHistoryId(value: string): boolean {
  return HISTORY_ID_PATTERN.test(value);
}
