import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

/**
 * tag 词表的载入与校验。
 *
 * 与厨具（`equipment.json`）同一个道理：tag 必须是**受控词表**里的值，
 * 否则"快手 / 快手菜 / 省时"这类变体会让筛选失效（见 docs/features/README.md 的待办 CB-006）。
 *
 * 文件缺失或格式错误都**不阻止服务启动**：tag 校验退化为"不校验"。
 */

const tagsFileSchema = z.object({
  tags: z
    .array(
      z.object({
        name: z.string().trim().min(1, "tag 名不能为空"),
        when: z.string().trim().min(1, "tag 必须写清判定标准（when）")
      })
    )
    .min(1, "至少要有 1 个 tag")
});

export const TAGS_FILE_NAME = "tags.json";

export interface TagVocabulary {
  /** 词表（含判定标准）；空数组表示未载入 */
  tags: { name: string; when: string }[];
  /** 只有名字的列表，便于校验与展示 */
  names: string[];
  /** 载入失败的原因；null 表示正常 */
  problem: string | null;
}

export const EMPTY_TAG_VOCABULARY: TagVocabulary = { tags: [], names: [], problem: null };

export async function loadTagVocabulary(dataDir: string): Promise<TagVocabulary> {
  const file = join(dataDir, TAGS_FILE_NAME);

  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      ...EMPTY_TAG_VOCABULARY,
      problem:
        code === "ENOENT"
          ? `tag 词表未载入：${TAGS_FILE_NAME} 不存在`
          : `tag 词表读取失败：${(error as Error).message}`
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    return { ...EMPTY_TAG_VOCABULARY, problem: `tag 词表 JSON 解析失败：${(error as Error).message}` };
  }

  const parsed = tagsFileSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const reason = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "根"}: ${issue.message}`)
      .join("; ");
    return { ...EMPTY_TAG_VOCABULARY, problem: `tag 词表格式不正确：${reason}` };
  }

  const seen = new Set<string>();
  const tags = parsed.data.tags.filter((tag) => {
    if (seen.has(tag.name)) return false;
    seen.add(tag.name);
    return true;
  });

  return { tags, names: tags.map((tag) => tag.name), problem: null };
}
