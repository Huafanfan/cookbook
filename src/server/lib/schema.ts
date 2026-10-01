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
  /** 上游来源（CB-010）：可选；`verified` 时三个字段都要在（跨字段规则在下面的 refiner 里查） */
  sourceRef: z
    .object({
      repo: z.string().min(1, "sourceRef.repo 不能为空"),
      path: z.string().min(1, "sourceRef.path 不能为空"),
      commit: z.string().min(1).optional(),
      baselineStatus: z.enum(["matched", "verified"]),
      baselineHash: z.string().min(1).optional(),
      parserVersion: z.string().min(1).optional(),
      lastSyncedAt: z.string().min(1).optional()
    })
    .optional(),
  ingredients: z.array(ingredientSchema).min(1, "至少要有一个食材"),
  steps: z.array(stepSchema).min(1, "至少要有一个步骤"),
  tips: z.array(z.string().min(1)).optional(),
  source: z.string().min(1).optional(),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional()
});

/** 工坊候选不能携带系统 ID、来源基线或文件路径，未知字段从候选剔除。 */
export const workshopRecipeSchema = baseRecipeSchema
  .omit({ id: true, sourceRef: true, createdAt: true, updatedAt: true })
  .partial()
  .extend({
    name: z.string().max(300).optional(), category: z.string().max(200).optional(), summary: z.string().max(4000).optional(), source: z.string().max(6000).optional(),
    ingredients: z.array(z.object({ name: z.string().max(300), amount: z.union([z.number(), z.string().max(300)]).optional(), unit: z.string().max(100).optional(), group: z.string().max(100).optional(), note: z.string().max(1000).optional() })).max(100).optional(),
    steps: z.array(z.object({ text: z.string().max(4000), title: z.string().max(300).optional(), minutes: z.number().nonnegative().optional(), heat: z.string().max(100).optional(), tip: z.string().max(1000).optional() })).max(100).optional(),
    tips: z.array(z.string().max(2000)).max(40).optional(), aliases: z.array(z.string().max(200)).max(40).optional(),
    tags: z.array(z.string().max(100)).max(30).optional(), equipment: z.array(z.string().max(100)).max(40).optional(),
    equipmentAlternatives: z.array(z.array(z.string().max(100)).max(20)).max(30).optional()
  });

const workshopEvidenceSchema = z.object({
  field: z.string().min(1).max(180),
  status: z.enum(["source", "user", "suggested", "unknown"]),
  sourceIds: z.array(z.string().max(80)).max(20),
  excerpt: z.string().max(2000).optional()
});
const workshopIssueSchema = z.object({ field: z.string().max(180), message: z.string().min(1).max(2000) });
const workshopCandidateSchema = z.object({
  key: z.string().min(1).max(100),
  recipe: workshopRecipeSchema,
  evidence: z.array(workshopEvidenceSchema).max(200).default([]),
  unresolved: z.array(workshopIssueSchema).max(100).default([])
});
export const workshopAnalysisSchema = z.object({
  candidates: z.array(workshopCandidateSchema).min(1).max(8),
  explanation: z.string().max(4000).default(""),
  usage: z.object({ promptTokens: z.number().nonnegative(), completionTokens: z.number().nonnegative(), totalTokens: z.number().nonnegative() }).optional()
});

const workshopRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const workshopSourceIdSchema = z.string().regex(/^s-[a-f0-9]{24}$/);
export const workshopIdSchema = z.string().regex(/^w-[a-f0-9]{24}$/);
export const workshopSourceInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("link"), baseRevision: workshopRevisionSchema, name: z.string().max(200).optional(), url: z.string().min(1).max(8192) }),
  z.object({ kind: z.literal("text"), baseRevision: workshopRevisionSchema, name: z.string().max(200).optional(), text: z.string().min(1).max(40000) }),
  z.object({ kind: z.literal("json"), baseRevision: workshopRevisionSchema, name: z.string().max(200).optional(), text: z.string().min(1).max(40000) }),
  z.object({ kind: z.literal("image"), baseRevision: workshopRevisionSchema, name: z.string().max(200).optional(), mimeType: z.string().max(100).optional(), dataBase64: z.string().min(1).max(14 * 1024 * 1024) })
]);
const workshopImageSelectionSchema = z.object({
  coverSourceId: workshopSourceIdSchema.optional(),
  stepSourceIds: z.array(workshopSourceIdSchema.nullable()).max(100)
});
export const workshopDraftPatchSchema = z.object({
  baseRevision: workshopRevisionSchema,
  candidate: workshopRecipeSchema.optional(),
  instructions: z.string().max(4000).optional(),
  reviewed: z.boolean().optional(),
  sources: z.array(z.object({ id: workshopSourceIdSchema, selected: z.boolean() })).max(40).optional(),
  sourceOrder: z.array(workshopSourceIdSchema).max(40).optional(),
  images: workshopImageSelectionSchema.optional()
});
export const workshopAnalyzeInputSchema = z.object({ baseRevision: workshopRevisionSchema });
export const workshopCommitInputSchema = z.object({
  baseRevision: workshopRevisionSchema,
  creationKey: z.string().regex(/^[a-zA-Z0-9-]{8,100}$/)
});

/** 草稿落盘校验与请求校验同在本文件，坏草稿只跳过，不阻止服务启动。 */
export const workshopDraftSchema = z.object({
  version: z.literal(1), draftId: workshopIdSchema,
  inputVersion: z.number().int().nonnegative(), createdAt: z.string(), updatedAt: z.string(),
  sources: z.array(z.object({
    id: workshopSourceIdSchema, kind: z.enum(["link", "text", "image", "json"]), name: z.string(), selected: z.boolean(),
    status: z.enum(["pending", "ready", "error"]), url: z.string().optional(), text: z.string().max(40000).optional(), author: z.string().optional(), problem: z.string().optional(),
    sha256: z.string(), byteSize: z.number().nonnegative(), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
    width: z.number().optional(), height: z.number().optional(), normalizedByteSize: z.number().optional()
  })).max(40),
  instructions: z.string().max(4000), candidate: workshopRecipeSchema, hasUserEdits: z.boolean(),
  alternatives: z.array(workshopCandidateSchema).max(8), analysis: workshopAnalysisSchema.optional(), suggestion: workshopAnalysisSchema.optional(),
  evidence: z.array(workshopEvidenceSchema), unresolved: z.array(workshopIssueSchema), reviewed: z.boolean(), images: workshopImageSelectionSchema,
  generation: z.object({ taskId: z.string(), state: z.enum(["queued", "extracting", "analyzing", "complete", "failed", "interrupted"]), inputVersion: z.number(), fingerprint: z.string(), startedAt: z.string(), finishedAt: z.string().optional(), model: z.string(), promptVersion: z.string(), problem: z.string().optional(), usage: workshopAnalysisSchema.shape.usage }).nullable(),
  creation: z.object({ key: z.string(), recipeId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), recipe: baseRecipeSchema, recipeHash: z.string(), phase: z.enum(["prepared", "committed"]), images: z.array(z.object({ sourceId: workshopSourceIdSchema, fileName: z.string().regex(/^(cover|step-[1-9][0-9]*)\.jpg$/), sha256: z.string() })) }).nullable(),
  savedRecipeId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional()
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
  const allowed = new Set((allowedTools ?? []).map(normalizeToolName));
  const tagSet = new Set(allowedTags ?? []);

  // refiner 总是挂上：sourceRef 的跨字段规则与词表无关
  return baseRecipeSchema.superRefine((recipe, ctx) => {
    const sourceRef = recipe.sourceRef;
    if (sourceRef && sourceRef.baselineStatus === "verified") {
      for (const key of ["commit", "baselineHash", "parserVersion"] as const) {
        if (!sourceRef[key]) {
          ctx.addIssue({
            code: "custom",
            path: ["sourceRef", key],
            message: `baselineStatus 是 verified 时必须给 sourceRef.${key}`
          });
        }
      }
    }

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
