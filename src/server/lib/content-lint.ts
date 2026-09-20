import type { Recipe } from "../../shared/types.js";

/**
 * 菜谱**内容**检查（不是字段格式检查）。
 *
 * 这里只放能"无歧义自动判定"的规则；语义判断（比如某条提醒是不是服务于本步骤）
 * 无法自动化，写在 data/DATA_MODEL 的人工自检清单里。
 *
 * 起因：用户发现"焯水"步骤挂着"否则煎的时候会溅油"的提醒 —— 提醒放错了步骤；
 * 同一次还暴露出 `minutes` 与文案里的分钟数关系没定义清楚。
 */

/** 匹配"3 分钟""12 分钟"这类表述 */
const MINUTE_PATTERN = /(\d+(?:\.\d+)?)\s*分钟/g;

export interface ContentIssue {
  /** 出问题的位置，例如 `steps[2].text` */
  path: string;
  message: string;
}

export function lintRecipeContent(recipe: Recipe): ContentIssue[] {
  const issues: ContentIssue[] = [];

  // ① 文案里的分钟数必须与 minutes 一致（minutes 是这一步的计时默认值）
  recipe.steps.forEach((step, index) => {
    const mentioned = [...step.text.matchAll(MINUTE_PATTERN)].map((match) =>
      Number.parseFloat(match[1])
    );

    if (mentioned.length === 0) return;

    const unique = [...new Set(mentioned)];
    if (unique.length > 1) {
      issues.push({
        path: `steps[${index}].text`,
        message: `同一步骤里出现多个分钟数（${unique.join("、")}），无法确定该计时多久`
      });
      return;
    }

    if (step.minutes === undefined) {
      issues.push({
        path: `steps[${index}].minutes`,
        message: `文案写了「${unique[0]} 分钟」但没有填 minutes（该步将无法一键计时）`
      });
      return;
    }

    if (step.minutes !== unique[0]) {
      issues.push({
        path: `steps[${index}].minutes`,
        message: `minutes 是 ${step.minutes}，文案里写的是 ${unique[0]} 分钟 —— 两处必须一致`
      });
    }
  });

  // ② 同组同名的食材不应重复（重复会让用量看起来自相矛盾）
  const seen = new Set<string>();
  recipe.ingredients.forEach((ingredient, index) => {
    const key = `${ingredient.group ?? "主料"}::${ingredient.name}`;
    if (seen.has(key)) {
      issues.push({
        path: `ingredients[${index}].name`,
        message: `「${ingredient.group ?? "主料"}」里重复出现「${ingredient.name}」`
      });
    }
    seen.add(key);
  });

  return issues;
}

/** 把问题整理成一行行可读文本 */
export function formatContentIssues(recipeId: string, issues: ContentIssue[]): string[] {
  return issues.map((issue) => `${recipeId} ${issue.path}: ${issue.message}`);
}
