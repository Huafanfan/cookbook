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
}

export function createRecipeSchema(options: RecipeSchemaOptions = {}) {
  const allowedTools = options.allowedTools;
  if (!allowedTools || allowedTools.length === 0) return baseRecipeSchema;

  const allowed = new Set(allowedTools.map(normalizeToolName));
  const hint = `可选：${allowedTools.join("、")}`;

  return baseRecipeSchema.superRefine((recipe, ctx) => {
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
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}
