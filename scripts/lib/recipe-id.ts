import { pinyin } from "pinyin-pro";

/**
 * 菜名 → 拼音 id（只用小写字母、数字和连字符，与 schema 约束一致）。
 *
 * 单独一个模块：导入器、回填脚本、同步脚本都要用**同一套** id 规则，
 * 否则"这道菜对应上游哪个文件"就对不上了。放在这里也避免 import 导入器时执行它的 `main()`。
 */
export function toRecipeId(name: string): string {
  const parts = pinyin(name, { toneType: "none", type: "array" });
  const slug = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "dish";
}
