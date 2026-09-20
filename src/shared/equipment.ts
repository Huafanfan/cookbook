/**
 * 厨具的公共约定（前端与后端共用）。
 *
 * 厨具是**受控词表**而不是自由文本：词表定义在 `data/equipment.json`，
 * 菜谱只能引用词表里的值。理由与规则见 docs/features/CB-002-kitchen-tools.md。
 */

/** 归一化：去掉所有空白并忽略大小写，`炒锅 ` 与 `炒锅` 视为同一件 */
export function normalizeToolName(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

/** 保留 `owned` 中在词表里的项（顺序按词表），用于清理本地残留的厨具名 */
export function keepKnownTools(owned: string[], allowedTools: string[]): string[] {
  if (allowedTools.length === 0) return owned;

  const allowed = new Map(allowedTools.map((tool) => [normalizeToolName(tool), tool]));
  return owned
    .map((tool) => allowed.get(normalizeToolName(tool)))
    .filter((tool): tool is string => tool !== undefined);
}
