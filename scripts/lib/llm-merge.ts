import type { Recipe } from "../../src/shared/types.js";
import { createRecipeSchema, formatIssueList } from "../../src/server/lib/schema.js";
import { unexpectedValues, type Conflict } from "./sync-merge.js";

/**
 * LLM 客户端（CB-010）：**只用于"两边都改了"那一档**的合并提案。
 *
 * 红线（复核 #9 / ADR-0006 §7）：
 * - 只从环境变量读密钥，只把**目标菜谱的三方内容**发出去（不发环境、密钥、其他文件）
 * - 模型与档位按用户指定：`gpt-5.6-luna` + `reasoning_effort: "low"`；
 *   **代理拒绝该档位 = 配置阻断，停下报错，不自动去掉 low**
 * - 提示词不能保证"不新增事实"，zod 也只能验结构 → 返回结果里带上
 *   `unexpectedValues`（两边都没有、只出现在提案里的值）供**人工逐项核对**
 * - 失败最多重试 2 次；失败即"只报告"
 */

export interface LlmConfig {
  url: string;
  key: string;
  model: string;
  reasoningEffort: "low";
}

export type LlmConfigResult = { ok: true; config: LlmConfig } | { ok: false; problem: string };

export function loadLlmConfig(
  env: NodeJS.ProcessEnv = process.env,
  modelOverride?: string
): LlmConfigResult {
  const url = env.IVAN_ONLINE_API_URL?.trim();
  const key = env.IVAN_ONLINE_API_KEY?.trim();

  if (!url) return { ok: false, problem: "没有 IVAN_ONLINE_API_URL（LLM 只从环境变量读）" };
  if (!key) return { ok: false, problem: "没有 IVAN_ONLINE_API_KEY（LLM 只从环境变量读）" };

  return { ok: true, config: { url, key, model: modelOverride?.trim() || "gpt-5.6-luna", reasoningEffort: "low" } };
}

export interface ProposeInput {
  baseline: Recipe;
  upstream: Recipe;
  local: Recipe;
  conflicts: Conflict[];
  /** 机械合并的结果（**没有冲突时直接用它，根本不调 LLM**） */
  mechanical: Recipe;
  /** 测试注入用；默认全局 fetch */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type ProposeResult =
  | { ok: true; recipe: Recipe; explanation: string; suspiciousValues: string[]; raw: string }
  | { ok: false; reason: string; raw?: string };

const SYSTEM_PROMPT = [
  "你在合并两份菜谱改动：一份是上游仓库的新版，一份是家里自己改过的版本。",
  "严格规则：",
  "1) 只做合并：不得新增任何事实（不得发明用量、步骤、时间、火候、食材）。",
  "2) 同一处两边都改了（下面给出的 conflicts）→ **逐条列出你的选择与理由**，不要含糊地把两个值混成第三个值。",
  "3) 保留家里版本的个性化补充（提醒、备注、别名）。",
  "4) 拿不准就保留家里的值，并在说明里注明“待人工决定”。",
  "输出格式（必须是 JSON 对象，不要别的内容）：",
  '{"recipe": <完整菜谱，结构与输入里的菜谱一致，字段名不变>, "explanation": "中文，逐条说明你合了什么、哪些待人工决定"}'
].join("\n");

export async function proposeMerge(
  input: ProposeInput,
  config: LlmConfig
): Promise<ProposeResult> {
  // 没有冲突 → 机械合并已经是完整结果，**不调 LLM**（省钱、快、可预测）
  if (input.conflicts.length === 0) {
    return {
      ok: true,
      recipe: input.mechanical,
      explanation: "没有冲突：两边改的是不同字段，机械合并即可（未调用 LLM）",
      suspiciousValues: [],
      raw: ""
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const body = {
    model: config.model,
    reasoning_effort: config.reasoningEffort,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify(
          {
            基线: input.baseline,
            上游新版: input.upstream,
            家里现在这份: input.local,
            // 机械合并的当前结果（已合掉无冲突字段；未解决的冲突仍保留家里值）
            机械合并结果: input.mechanical,
            待你解决的冲突: input.conflicts.map((conflict) => ({
              path: conflict.path,
              基线: conflict.baseline,
              上游: conflict.upstream,
              家里: conflict.local
            }))
          },
          null,
          1
        )
      }
    ]
  };

  let lastRaw: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(config.url, {
        method: "POST",
        headers: { authorization: `Bearer ${config.key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(input.timeoutMs ?? 120_000)
      });
    } catch (error) {
      lastRaw = `${(error as Error).name}: ${(error as Error).message}`;
      continue;
    }

    const text = await response.text();
    lastRaw = text;

    if (!response.ok) {
      // 档位被拒 = 配置阻断：**不自动降级**
      if (/reasoning_effort|unsupported.*param/i.test(text)) {
        return {
          ok: false,
          reason: `代理拒绝了 reasoning_effort=low（配置阻断，不自动降级）：HTTP ${response.status} ${text.slice(0, 200)}`,
          raw: text
        };
      }
      continue; // 其他错误重试
    }

    let content: string;
    try {
      const parsed = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
      content = parsed.choices?.[0]?.message?.content ?? "";
    } catch {
      continue;
    }

    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) continue;

    let payload: { recipe?: unknown; explanation?: unknown };
    try {
      payload = JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as {
        recipe?: unknown;
        explanation?: unknown;
      };
    } catch {
      continue;
    }

    const candidate = payload.recipe ?? payload; // 允许模型直接给整份菜谱
    const schema = createRecipeSchema();
    const parsedRecipe = schema.safeParse(candidate);
    if (!parsedRecipe.success) {
      return {
        ok: false,
        reason: `LLM 输出的菜谱结构不合法：${formatIssueList(parsedRecipe.error).join("；")}`,
        raw: text
      };
    }
    if (parsedRecipe.data.id !== input.local.id) {
      return { ok: false, reason: `LLM 改了 id（${input.local.id} → ${parsedRecipe.data.id}），拒绝`, raw: text };
    }

    return {
      ok: true,
      recipe: parsedRecipe.data as Recipe,
      explanation: typeof payload.explanation === "string" ? payload.explanation : "",
      suspiciousValues: unexpectedValues(
        parsedRecipe.data as Recipe,
        input.baseline,
        input.upstream,
        input.local
      ),
      raw: text
    };
  }

  return { ok: false, reason: `LLM 调用失败（已重试）：${lastRaw?.slice(0, 200) ?? "未知原因"}`, raw: lastRaw };
}
