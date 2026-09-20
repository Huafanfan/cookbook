import type { Ingredient, Recipe, Step } from "../../shared/types.js";
import { analyzeTimeMentions } from "./content-lint.js";

/**
 * 把 HowToCook（`Anduin2017/HowToCook`，Unlicense 公有领域）的 Markdown 菜谱
 * 解析成本项目的菜谱结构。**纯函数**：不碰文件系统，便于单测。
 *
 * 设计原则（见 docs/features/CB-003-howtocook-import.md）：
 * 1. **忠实于原文**：不重写用量、不改写步骤、不臆造字段。
 * 2. **不猜**：只有原文明确写出的厨具才进 `equipment`；火候只有唯一写法时才填。
 * 3. 来源的「每份」官方定义是"够 2 个人吃"，与本项目家庭基准一致 → `servings: 2`，用量原样。
 */

/** 能被本项目厨具词表识别的写法（key 是原文里可能出现的词，value 是词表里的规范名） */
const TOOL_ALIASES: Record<string, string> = {
  炒锅: "炒锅",
  铁锅: "炒锅",
  中式炒锅: "炒锅",
  平底锅: "平底锅",
  不粘锅: "平底锅",
  煎锅: "平底锅",
  砂锅: "砂锅",
  砂煲: "砂锅",
  汤锅: "汤锅",
  奶锅: "汤锅",
  炖锅: "汤锅",
  蒸锅: "蒸锅",
  蒸笼: "蒸锅",
  电蒸炉: "蒸锅",
  蒸屉: "蒸屉",
  高压锅: "高压锅",
  压力锅: "高压锅",
  空气炸锅: "空气炸锅",
  烤箱: "烤箱",
  电烤箱: "烤箱",
  微波炉: "微波炉",
  电饭锅: "电饭锅",
  电饭煲: "电饭锅",
  电饼铛: "电饼铛",
  烤盘: "烤盘"
};

/** 难度星级 → 本项目的 1/2/3 */
export function mapDifficulty(stars: number): 1 | 2 | 3 {
  if (stars <= 2) return 1;
  if (stars === 3) return 2;
  return 3;
}

/** 目录名 → 本项目的分类 */
export function mapCategory(directoryName: string): string {
  const table: Record<string, string> = {
    meat_dish: "家常菜",
    vegetable_dish: "家常菜",
    aquatic: "家常菜",
    soup: "汤羹",
    staple: "主食",
    breakfast: "早餐",
    dessert: "甜品",
    drink: "饮品",
    condiment: "调料",
    "semi-finished": "半成品"
  };
  return table[directoryName] ?? "家常菜";
}

/** 一句话里能对上厨具词表的工具（按词表规范名返回，去重） */
export function matchTools(text: string): string[] {
  const found: string[] = [];
  for (const [alias, canonical] of Object.entries(TOOL_ALIASES)) {
    if (text.includes(alias) && !found.includes(canonical)) found.push(canonical);
  }
  return found;
}

/** 名称清理：去掉行尾的 = / ：等分隔符（原文有 `- 淀粉 = 1 汤匙` 这类写法） */
function cleanName(name: string): string {
  return name.replace(/\s*[=＝:：]+\s*$/, "").trim();
}

/** 名称是否可用（过滤纯符号/空） */
function isUsableName(name: string): boolean {
  return name.length > 0 && /[\p{Script=Han}A-Za-z0-9]/u.test(name);
}

/** 去掉括号，取里面的说明文字 */
function readNote(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const inner = text.replace(/^[（(]/, "").replace(/[）)]$/, "").trim();
  return inner.length > 0 ? inner : undefined;
}

/** 数量：阿拉伯数字（含范围）或中文数字（一/两/半…，保留原样更忠实） */
const AMOUNT_TOKEN = String.raw`(?:\d+(?:\.\d+)?(?:\s*[-–—~至到]\s*\d+(?:\.\d+)?)?|[一二两三四五六七八九十半]+)`;
const INGREDIENT_LINE = new RegExp(
  `^(?<name>\\S(?:.*?\\S)?)\\s+(?<amount>${AMOUNT_TOKEN})\\s*(?<unit>\\S*)\\s*(?<rest>.*)$`
);

/** 中文数字 → 数值（用于份量这类必须是数字的场合） */
const CHINESE_NUMERALS: Record<string, number> = {
  一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10
};

export function toNumber(token: string): number | null {
  const trimmed = token.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number.parseFloat(trimmed);
  return CHINESE_NUMERALS[trimmed] ?? null;
}

/**
 * 解析一条食材。
 *
 * 原文里数量与名称之间一定有空格（如 `豆腐 100 g`、`葱 一根`），
 * 而名称本身可能含数字或中文数字（如 `五花肉`、`三文鱼`），
 * 所以先摘掉括号说明，再**以空格为界**找数量，避免把名称里的数字当用量。
 */
export function parseIngredientLine(line: string): Ingredient | null {
  const text = line.replace(/^[-*+]\s+/, "").trim();
  if (text.length === 0) return null;

  const parenNotes = [...text.matchAll(/[（(]([^（()）]*)[）)]/g)].map((match) => match[1].trim());
  const bare = text.replace(/[（(][^（()）]*[）)]/g, " ").replace(/\s+/g, " ").trim();

  const match = INGREDIENT_LINE.exec(bare);
  if (match?.groups) {
    const rawAmount = match.groups.amount.replace(/\s+/g, "");
    const isRange = /[-–—~至到]/.test(rawAmount);
    const numeric = isRange ? Number.NaN : Number.parseFloat(rawAmount);

    // 剩余文字（如 `* 份数`）与括号说明一起进 note，按原文出现顺序排列
    const rest = match.groups.rest.replace(/^[*·]\s*/, "").trim();
    const noteParts = rest.length > 0 ? [rest, ...parenNotes] : parenNotes;

    return {
      name: cleanName(match.groups.name),
      // 中文数字与范围都原样保留（本项目允许字符串用量）
      amount: Number.isNaN(numeric) ? rawAmount : numeric,
      unit: match.groups.unit.trim() || undefined,
      note: noteParts.length > 0 ? noteParts.join("；") : undefined
    };
  }

  return {
    name: cleanName(bare),
    note: parenNotes.length > 0 ? parenNotes.join("；") : undefined
  };
}

/** 解析原文的份量声明：`一份正好够 2 个人吃` / `一份正好够 1-2 个人食用`；范围取下限 */
export function parseServings(text: string): { servings: number; stated: boolean } {
  const match = /够\s*([0-9]+|[一二两三四五六七八九十]+)\s*(?:[-–—~至到]\s*([0-9]+|[一二两三四五六七八九十]+))?\s*个?人/.exec(
    text
  );
  if (!match) return { servings: 2, stated: false };

  const from = toNumber(match[1]);
  return { servings: from ?? 2, stated: true };
}

const FIRE_PATTERN = /(中小火|中大火|大火|中火|小火|旺火|文火|微火)/g;

/** 火候：**只有全文唯一一种写法时才填**（转换火候的步骤不猜，宁可不显示） */
export function extractHeat(text: string): string | undefined {
  const matches = [...new Set([...text.matchAll(FIRE_PATTERN)].map((match) => match[1]))];
  return matches.length === 1 ? matches[0] : undefined;
}

/** 计时时长：单个分钟数取该值；时间段取**下限**（先检查，避免糊锅）；多个/没有则不填 */
export function extractMinutes(text: string): number | undefined {
  const { singles, ranges } = analyzeTimeMentions(text);

  if (singles.length === 1 && ranges.length === 0) return singles[0];
  if (singles.length === 0 && ranges.length >= 1) return Math.min(...ranges.map(([from]) => from));
  return undefined;
}

interface Section {
  body: string;
}

/** 按 `## 标题` 切分小节 */
function splitSections(markdown: string): { preamble: string; sections: Map<string, Section> } {
  const lines = markdown.split("\n");
  const sections = new Map<string, Section>();
  const preambleLines: string[] = [];
  let current: string | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    if (current !== null) sections.set(current, { body: buffer.join("\n") });
    buffer = [];
  };

  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      current = heading[1];
      continue;
    }
    if (current === null) preambleLines.push(line);
    else buffer.push(line);
  }
  flush();

  return { preamble: preambleLines.join("\n"), sections };
}

/** 取一级/二级标题之外的普通文本行 */
function plainLines(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * 解析列表项，并把 `### 小节名` 作为分组名带出来。
 *
 * 原文的「计算」小节常按阶段分组（`### 腌料` / `### 酱汁`），
 * 同一食材在不同阶段各出现一次是**正常且有意义**的（盐 2g 腌 + 盐 1g 调味），
 * 所以要把分组带进 `Ingredient.group`，而不是当成重复。
 */
function bulletsWithGroups(body: string, subsection?: string): { text: string; group?: string }[] {
  const result: { text: string; group?: string }[] = [];
  let group: string | undefined;
  let active = subsection === undefined;

  for (const line of body.split("\n")) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (subsection === undefined) {
        group = heading[1].trim();
        active = true;
      } else {
        active = heading[1].trim() === subsection;
      }
      continue;
    }
    if (active && /^\s*[-*+]\s+/.test(line)) result.push({ text: line, group });
  }

  return result;
}

/** 精确重复（同名同量同单位同组）只留一条，说明合并 */
function mergeExactDuplicates(items: Ingredient[]): Ingredient[] {
  const merged = new Map<string, Ingredient>();

  for (const item of items) {
    const key = `${item.group ?? ""}::${item.name}::${item.amount ?? ""}::${item.unit ?? ""}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...item });
      continue;
    }
    if (item.note && !existing.note) existing.note = item.note;
    else if (item.note && existing.note && !existing.note.includes(item.note)) {
      existing.note = `${existing.note}；${item.note}`;
    }
  }

  return [...merged.values()];
}

/** 解析第 n 级小节里的列表项 */
function bulletLines(body: string, subsection?: string): string[] {
  const lines = body.split("\n");
  const result: string[] = [];
  let active = subsection === undefined;

  for (const line of lines) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      active = subsection !== undefined && heading[1] === subsection;
      continue;
    }
    if (active && /^\s*[-*+]\s+/.test(line)) result.push(line);
  }

  return result;
}

/** 解析 `## 操作`：编号项为一步，子要点作提示 */
export function parseSteps(body: string): Step[] {
  const steps: Step[] = [];
  let text = "";
  let title: string | undefined;
  let tips: string[] = [];

  const flush = (): void => {
    if (text.trim().length === 0 && tips.length === 0) return;

    const boldTitle = /^\*\*(.+?)\*\*\s*[：:]\s*(.*)$/.exec(text.trim());
    let bodyText = boldTitle ? boldTitle[2].trim() : text.trim();
    if (boldTitle) title = boldTitle[1].trim();

    // 原文有些步骤只写粗体小标题、正文全在子要点里（`1. **检查与清洗**：` + 子项）
    // 这种情况下子要点就是步骤正文，不能当"提示"用，否则步骤会空
    let stepTips = tips;
    if (bodyText.length === 0 && tips.length > 0) {
      bodyText = tips.join("；");
      stepTips = [];
    }
    if (bodyText.length === 0) {
      text = "";
      title = undefined;
      tips = [];
      return;
    }

    const step: Step = { text: bodyText };
    if (title) step.title = title;
    const minutes = extractMinutes(bodyText);
    if (minutes !== undefined) step.minutes = minutes;
    const heat = extractHeat(bodyText);
    if (heat) step.heat = heat;
    if (stepTips.length > 0) step.tip = stepTips.join("；");

    steps.push(step);
    text = "";
    title = undefined;
    tips = [];
  };

  for (const line of body.split("\n")) {
    const numbered = /^\s*\d+[.、]\s+(.*)$/.exec(line);
    if (numbered) {
      flush();
      text = numbered[1];
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      tips.push(bullet[1].trim());
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.length > 0) text = text.length > 0 ? `${text} ${trimmed}` : trimmed;
  }
  flush();

  return steps;
}

export interface ParseOptions {
  /** 目录名（用于分类） */
  category: string;
  /** 写入 `source` 字段的来源说明 */
  source: string;
}

export interface ParseOutcome {
  /** 解析成功时为菜谱（`id` 由调用方按拼音生成） */
  dish: Omit<Recipe, "id"> | null;
  /** 原文里的成品图相对路径 */
  imagePath: string | null;
  /** 解析层面的问题（不影响其他菜） */
  issues: string[];
}

export function parseHowToCookMarkdown(markdown: string, options: ParseOptions): ParseOutcome {
  const issues: string[] = [];
  const cleaned = markdown.replace(/<!--[\s\S]*?-->/g, "");

  const titleMatch = /^#\s+(.+?)\s*$/m.exec(cleaned);
  if (!titleMatch) {
    return { dish: null, imagePath: null, issues: ["找不到一级标题（菜名）"] };
  }
  const name = titleMatch[1].replace(/\s*的做法\s*$/, "").trim();

  const { preamble, sections } = splitSections(cleaned);

  // 成品图：优先用 markdown 里的第一张图。
  // 注意不能只在前言里找 —— 有些文件把图放在小节内部（甚至没有前言）
  const preambleImage = /!\[[^\]]*\]\(([^)]+)\)/.exec(preamble);
  const anywhereImage = /!\[[^\]]*\]\(([^)]+)\)/.exec(cleaned);
  const imagePath = (preambleImage ?? anywhereImage)?.[1].trim() ?? null;

  // 简介：正文里第一段普通文字（去掉标题行、图片行、难度/卡路里行）
  const summary = plainLines(preamble.replace(/^#\s+.+$/m, ""))
    .filter((line) => !line.startsWith("!["))
    .filter((line) => !line.startsWith("预估"))
    .shift();

  const stars = (() => {
    const match = /预估烹饪难度[：:]\s*([★☆]+)/.exec(cleaned);
    return match ? (match[1].match(/★/g)?.length ?? 0) : 0;
  })();

  // 用量以「计算」小节为准；没有数字的（如"盐"）从「必备原料和工具」补
  const calcBody = sections.get("计算")?.body ?? "";
  const requiredBody = sections.get("必备原料和工具")?.body ?? "";

  const toIngredients = (entries: { text: string; group?: string }[]): Ingredient[] =>
    entries
      .map((entry) => {
        const parsed = parseIngredientLine(entry.text);
        if (!parsed || !isUsableName(parsed.name)) return null;
        return { ...parsed, group: entry.group } as Ingredient;
      })
      .filter((item): item is Ingredient => item !== null);

  const measured = mergeExactDuplicates(toIngredients(bulletsWithGroups(calcBody)));
  const declared = mergeExactDuplicates(toIngredients(bulletsWithGroups(requiredBody)));

  const ingredients: Ingredient[] = [...measured];
  for (const item of declared) {
    // 名称相近（活虾 / 虾）也算重复，避免"计算"与"必备原料"两个列表各出一份
    const already = ingredients.some((existing) => {
      const left = existing.name.replace(/\s+/g, "");
      const right = item.name.replace(/\s+/g, "");
      return left === right || left.includes(right) || right.includes(left);
    });
    if (!already) ingredients.push(item);
  }

  // 份量：读原文声明（"一份正好够 N 个人吃"）；范围取下限。
  // 未声明时按官方模板约定记 2 人份，并在 source 里注明这是约定而非原文声明。
  const { servings, stated } = parseServings(cleaned);

  // 厨具：原文明确写出的工具（工具小节 + 食材里其实是器具的条目）
  const toolEntries = bulletLines(requiredBody, "工具").map((line) =>
    line.replace(/^[-*+]\s+/, "").trim()
  );
  const ingredientTools: string[] = [];
  const edibleIngredients: Ingredient[] = [];

  for (const ingredient of ingredients) {
    const tools = matchTools(ingredient.name);
    if (tools.length > 0 && ingredient.amount === undefined) {
      ingredientTools.push(ingredient.name);
      continue;
    }
    edibleIngredients.push(ingredient);
  }

  const requiredTools = new Set<string>();
  const alternativeGroups: string[][] = [];

  for (const entry of [...ingredientTools, ...toolEntries]) {
    const tools = matchTools(entry);
    if (tools.length === 0) continue; // 词表外的器具（刀、砧板、耐热盘…）不记
    if (tools.length === 1) requiredTools.add(tools[0]);
    else alternativeGroups.push(tools);
  }

  const steps = parseSteps(sections.get("操作")?.body ?? "");
  if (steps.length === 0) issues.push("没有解析出任何步骤");

  // 总时长：简介里恰好一个"N 分钟"时才用（多值不猜）
  const summaryMinutes = summary ? analyzeTimeMentions(summary) : { singles: [], ranges: [] };
  const cookMinutes =
    summaryMinutes.singles.length === 1 && summaryMinutes.ranges.length === 0
      ? summaryMinutes.singles[0]
      : undefined;

  const tips = [...new Set(bulletLines(sections.get("附加内容")?.body ?? "").map((line) =>
    line.replace(/^[-*+]\s+/, "").trim()
  ))]
    .filter((line) => !line.includes("Pull request") && !line.includes("请提出 Issue"))
    .slice(0, 6);

  return {
    dish: {
      name,
      category: options.category,
      summary,
      difficulty: mapDifficulty(stars),
      // 用量原样照抄，**不做任何倍数换算**；servings 只是"这份量够几个人吃"的标注
      servings,
      cookMinutes,
      equipment:
        requiredTools.size > 0
          ? [...requiredTools].sort((a, b) => a.localeCompare(b, "zh"))
          : undefined,
      equipmentAlternatives: alternativeGroups.length > 0 ? alternativeGroups : undefined,
      ingredients: edibleIngredients,
      steps,
      tips: tips.length > 0 ? tips : undefined,
      source: stated
        ? options.source
        : `${options.source} · 原文未声明份量，按官方模板约定记为 2 人份`
    },
    imagePath,
    issues
  };
}
