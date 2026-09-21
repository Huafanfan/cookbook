import { z } from "zod";

import { normalizeToolName } from "../../shared/equipment.js";

/**
 * 菜谱文件的运行时校验规则。
 * 字段含义见 docs/DATA_MODEL.md；类型定义见 src/shared/types.ts（两者需同步）。
 */

const ingredientSchema = z.object({
  name: z.string().min(1, "食材名不能为空"),
  amount: z.union([z.number(), z.string().min(1)]).optional(),
  unit: z.string().min(1).optional(),
  group: z.string().min(1).optional(),
  note: z.string().min(1).optional()
});

const stepSchema = z.object({
  text: z.string().min(1, "步骤内容不能为空"),
  title: z.string().min(1).optional(),
  // 这一步大概要多久（分钟），包含等待时间；同时是一键计时的默认时长
  minutes: z.number().nonnegative().optional(),
  heat: z.string().min(1).optional(),
  tip: z.string().min(1).optional()
});

const baseRecipeSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, "id 只能用小写字母、数字和连字符"),
  name: z.string().min(1, "菜名不能为空"),
  aliases: z.array(z.string().min(1)).optional(),
  category: z.string().min(1, "分类不能为空"),
  tags: z.array(z.string().min(1)).optional(),
  summary: z.string().min(1).optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)], {
    message: "difficulty 只能是 1 / 2 / 3"
  }),
  servings: z.number().positive("servings 必须大于 0"),
  prepMinutes: z.number().nonnegative().optional(),
  cookMinutes: z.number().nonnegative().optional(),
  // 必需厨具：值必须来自厨具词表（见 lib/equipment.ts）
  equipment: z.array(z.string().min(1)).optional(),
  // 每个子数组是"任选其一"的一组；空组无意义，直接拒绝
  equipmentAlternatives: z
    .array(z.array(z.string().min(1)).min(1, "替代组不能为空"))
    .optional(),
  ingredients: z.array(ingredientSchema).min(1, "至少要有一个食材"),
  steps: z.array(stepSchema).min(1, "至少要有一个步骤"),
  tips: z.array(z.string().min(1)).optional(),
  source: z.string().min(1).optional(),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional()
});

export type RecipeInput = z.infer<typeof baseRecipeSchema>;

export interface RecipeSchemaOptions {
  /**
   * 厨具词表。
   *
   * 提供时：菜谱里出现词表外的厨具名 → 校验失败（并给出可选值），
   * 这正是"厨具必须统一"的强制手段。
   * 不提供（词表未载入）时：跳过这项校验，避免因配置文件缺失误杀所有菜谱。
   */
  allowedTools?: readonly string[];
  /**
   * tag 词表。
   *
   * 提供时：菜谱写词表外的 tag → 校验失败（提示可选值）。
   * 不提供（词表未载入）时：跳过这项校验。
   */
  allowedTags?: readonly string[];
}

export function createRecipeSchema(options: RecipeSchemaOptions = {}) {
  const allowedTools = options.allowedTools;
  const allowedTags = options.allowedTags;

  const hasTools = Boolean(allowedTools && allowedTools.length > 0);
  const hasTags = Boolean(allowedTags && allowedTags.length > 0);
  if (!hasTools && !hasTags) return baseRecipeSchema;

  const allowed = new Set((allowedTools ?? []).map(normalizeToolName));
  const tagSet = new Set(allowedTags ?? []);

  return baseRecipeSchema.superRefine((recipe, ctx) => {
    if (hasTags) {
      (recipe.tags ?? []).forEach((tag, index) => {
        if (tagSet.has(tag)) return;
        ctx.addIssue({
          code: "custom",
          path: ["tags", index],
          message: `tag"${tag}"不在词表里，可选：${(allowedTags ?? []).join("、")}`
        });
      });
    }

    if (!hasTools) return;

    const hint = `可选：${(allowedTools ?? []).join("、")}`;
    const check = (tool: string, path: (string | number)[]): void => {
      if (allowed.has(normalizeToolName(tool))) return;
      ctx.addIssue({
        code: "custom",
        path,
        message: `厨具"${tool}"不在厨具清单里，${hint}`
      });
    };

    (recipe.equipment ?? []).forEach((tool, index) => check(tool, ["equipment", index]));
    (recipe.equipmentAlternatives ?? []).forEach((group, groupIndex) => {
      group.forEach((tool, toolIndex) =>
        check(tool, ["equipmentAlternatives", groupIndex, toolIndex])
      );
    });
  });
}

/** 不带词表校验的默认 schema（测试与不关心厨具的场景用） */
export const recipeSchema = createRecipeSchema();

/** 把 zod 的报错整理成一行可读文本：`steps.0.text: 步骤内容不能为空` */
/** zod 报错 → 一行一条（接口返回给前端做字段级提示） */
export function formatIssueList(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

export function formatIssues(error: z.ZodError): string {
  return formatIssueList(error).join("; ");
}

/**
 * 菜谱写接口的请求体（[CB-009](../../docs/features/CB-009-edit-mode.md)）：**严格**——只接受 `{ recipe, baseRevision, note? }`。
 *
 * 这里只管**请求形状**（多一个键就拒，ADR-0003 §4 的"未知字段拒绝"）；
 * `recipe` 的字段级校验用 `createRecipeSchema`（含厨具/tag 词表）在 repository 里做。
 */
export const recipeWriteBodySchema = z.strictObject({
  recipe: z.custom<Record<string, unknown>>(
    (value) => typeof value === "object" && value !== null && !Array.isArray(value),
    { message: "recipe 必须是一个对象" }
  ),
  baseRevision: z.string().min(8, "baseRevision 不能为空"),
  note: z.string().max(500, "note 最多 500 字").optional(),
  /** 网页只能声明这两种：脚本的 llm-merge / import 由脚本直接调 repository */
  source: z.enum(["manual", "restore"]).optional()
});

/* ---------- 用户状态（`data/user-state.json`）与它的写接口：CB-008 ---------- */

/**
 * `user-state.json` 里「我的厨具」字段（[CB-008](../../docs/features/CB-008-kitchen-tools-server.md)）。
 *
 * **宽松**：结构不对就当"从没设置过"（调用方拿到 `undefined`），不让一个坏字段影响启动——
 * 与菜谱文件的处理一致（坏数据降级 + 告警，而不是让服务起不来）。
 * 去重、去空白、按词表排序这些**归一化**在 store/route 里做，这里只管结构。
 */
export const kitchenStateSchema = z.object({
  tools: z.array(z.string()),
  updatedAt: z.string().min(1).optional()
});

/**
 * 「我的厨具」写接口的请求体：**严格**——只接受恰好 `{ tools }`。
 *
 * ADR-0003 §4 要求"未知字段拒绝"，所以用 `strictObject` 而不是 `object`（后者会默默丢掉多余的键）。
 */
export const kitchenWriteBodySchema = z.strictObject({
  tools: z.array(z.string())
});
