import type { Recipe } from "../../shared/types.js";

/**
 * 菜谱**内容**检查（不是字段格式检查）。
 *
 * 只放能"无歧义自动判定"的规则；语义判断（比如某条提醒是不是服务于本步骤）
 * 无法自动化，写在 docs/DATA_MODEL.md 的人工自检清单里。
 *
 * 起因：用户发现"焯水"步骤挂着"否则煎的时候会溅油"的提醒 —— 提醒放错了步骤；
 * 同一次还暴露出 `minutes` 与文案里的分钟数关系没定义清楚。
 *
 * 2026-09-20（CB-003 导入）：来源文本大量使用**时间段**（"焖 15-20 分钟"），
 * 因此区分 错误（阻止门禁）与 警告（只提示），并支持范围。
 */

export type IssueSeverity = "error" | "warning";

export interface ContentIssue {
  /** 出问题的位置，例如 `steps[2].text` */
  path: string;
  message: string;
  severity: IssueSeverity;
}

/** "15 - 20 分钟" 这类时间段 */
const RANGE_PATTERN = /(\d+(?:\.\d+)?)\s*[-–—~至到]\s*(\d+(?:\.\d+)?)\s*分钟/g;
/** "12 分钟" 这类单个时间 */
const SINGLE_PATTERN = /(\d+(?:\.\d+)?)\s*分钟/g;

interface TimeMentions {
  singles: number[];
  ranges: [number, number][];
}

/** 先摘掉时间段，再从剩余文本里找单值，避免把范围里的数字重复算成单值 */
export function analyzeTimeMentions(text: string): TimeMentions {
  const ranges: [number, number][] = [];
  const withoutRanges = text.replace(RANGE_PATTERN, (_match, from: string, to: string) => {
    ranges.push([Number.parseFloat(from), Number.parseFloat(to)]);
    return " ";
  });

  const singles = [...withoutRanges.matchAll(SINGLE_PATTERN)].map((match) =>
    Number.parseFloat(match[1])
  );

  return { singles, ranges };
}

function checkStepTime(stepMinutes: number | undefined, text: string): ContentIssue[] {
  const { singles, ranges } = analyzeTimeMentions(text);
  if (singles.length === 0 && ranges.length === 0) return [];

  // 只有一个单值：必须与 minutes 一致
  if (singles.length === 1 && ranges.length === 0) {
    const mentioned = singles[0];
    if (stepMinutes === undefined) {
      return [
        {
          path: "minutes",
          message: `文案写了「${mentioned} 分钟」但没有填 minutes（该步无法一键计时）`,
          severity: "error"
        }
      ];
    }
    if (stepMinutes !== mentioned) {
      return [
        {
          path: "minutes",
          message: `minutes 是 ${stepMinutes}，文案里写的是 ${mentioned} 分钟 —— 两处必须一致`,
          severity: "error"
        }
      ];
    }
    return [];
  }

  // 只有时间段：minutes 若填了就必须落在某个范围内；没填只提示（不是错误）
  if (singles.length === 0 && ranges.length >= 1) {
    if (stepMinutes === undefined) {
      return [
        {
          path: "minutes",
          message: `文案是时间段（${ranges.map(([a, b]) => `${a}-${b}`).join("、")} 分钟），未填 minutes：这一步没有计时入口`,
          severity: "warning"
        }
      ];
    }

    const inside = ranges.some(([from, to]) => stepMinutes >= from && stepMinutes <= to);
    if (!inside) {
      return [
        {
          path: "minutes",
          message: `minutes 是 ${stepMinutes}，不在文案的时间段（${ranges
            .map(([a, b]) => `${a}-${b}`)
            .join("、")} 分钟）之内`,
          severity: "error"
        }
      ];
    }
    return [];
  }

  const all = [
    ...singles.map((value) => `${value} 分钟`),
    ...ranges.map(([from, to]) => `${from}-${to} 分钟`)
  ];

  // 多个时间 + **已填 minutes** = 有人（作者或 LLM 判定）明确挑了一个，不再多嘴
  if (stepMinutes !== undefined) return [];

  // 多个时间且没填：该步没有计时入口，提示一下
  return [
    {
      path: "minutes",
      message: `同一步骤里出现多个时间（${all.join("、")}），未填 minutes：该步不会显示计时入口`,
      severity: "warning"
    }
  ];
}

export function lintRecipeContent(recipe: Recipe): ContentIssue[] {
  const issues: ContentIssue[] = [];

  recipe.steps.forEach((step, index) => {
    for (const issue of checkStepTime(step.minutes, step.text)) {
      issues.push({ ...issue, path: `steps[${index}].${issue.path}` });
    }
  });

  // 同组同名重复：**警告**（不是错误）
  //
  // 原文里这常常是分阶段的正常写法（腌料里 2g 盐 + 调味里 1g 盐），
  // 但也可能是真的重复录入，所以提示出来让人看一眼。
  const seen = new Map<string, number>();
  recipe.ingredients.forEach((ingredient, index) => {
    const key = `${ingredient.group ?? "主料"}::${ingredient.name}`;
    const first = seen.get(key);
    if (first !== undefined) {
      issues.push({
        path: `ingredients[${index}].name`,
        message: `「${ingredient.group ?? "主料"}」里「${ingredient.name}」出现第 ${index + 1} 次（第 ${
          first + 1
        } 项同名）：若是分阶段使用可忽略，否则请合并`,
        severity: "warning"
      });
    } else {
      seen.set(key, index);
    }
  });

  return issues;
}

/** 把问题整理成一行行可读文本 */
export function formatContentIssues(recipeId: string, issues: ContentIssue[]): string[] {
  return issues.map((issue) => {
    const mark = issue.severity === "error" ? "✗" : "⚠";
    return `${mark} ${recipeId} ${issue.path}: ${issue.message}`;
  });
}

/** 是否有会阻止门禁的错误（警告不算） */
export function hasBlockingIssues(issues: ContentIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
