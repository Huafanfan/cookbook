import { describe, expect, it, vi } from "vitest";

import type { Recipe } from "../src/shared/types.js";
import { classifyChange, diffFields, mergeFields, unexpectedValues } from "../scripts/lib/sync-merge.js";
import { loadLlmConfig, proposeMerge } from "../scripts/lib/llm-merge.js";

/**
 * CB-010 的纯逻辑与 LLM 客户端（不发现实请求：假的 fetch）。
 * 覆盖复核要求的几件事：四档分类、无冲突字段机械合并、两边都改 → 冲突不自动合、
 * “两边都没有的值”能被列出来、档位被拒 = 配置阻断不降级。
 */

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "test-dish",
    name: "测试菜",
    category: "家常菜",
    difficulty: 1,
    servings: 2,
    ingredients: [{ name: "盐", amount: 2, unit: "g" }],
    steps: [{ text: "随便炒炒" }],
    ...overrides
  };
}

describe("classifyChange / mergeFields", () => {
  const baseline = recipe();

  it("四档分类", () => {
    expect(classifyChange({ baseline, upstream: baseline, local: baseline })).toBe("unchanged");
    expect(
      classifyChange({ baseline, upstream: recipe({ name: "上游改名" }), local: baseline })
    ).toBe("upstream-only");
    expect(
      classifyChange({ baseline, upstream: baseline, local: recipe({ name: "我改名" }) })
    ).toBe("local-only");
    expect(
      classifyChange({
        baseline,
        upstream: recipe({ name: "上游改名" }),
        local: recipe({ servings: 3 })
      })
    ).toBe("both");
  });

  it("**tags/厨具/来源/时间戳不参与**：改这些不算“两边都改”", () => {
    const local = recipe({ tags: ["快手"], equipment: ["炒锅"], updatedAt: "2026-09-21" });
    expect(classifyChange({ baseline, upstream: baseline, local })).toBe("unchanged");
  });

  it("只有上游改的字段 → 机械合并采用上游；本地字段保留", () => {
    const result = mergeFields({
      baseline,
      upstream: recipe({ name: "上游改名" }),
      local: recipe({ tags: ["快手"] })
    });

    expect(result.recipe.name).toBe("上游改名");
    expect(result.recipe.tags).toEqual(["快手"]); // 本地拥有 → 保留
    expect(result.conflicts).toEqual([]);
  });

  it("两边都改同一字段（值不同）→ 记冲突，**保留本地值**，不硬合", () => {
    const result = mergeFields({
      baseline,
      upstream: recipe({ name: "上游改名" }),
      local: recipe({ name: "我改名" })
    });

    expect(result.recipe.name).toBe("我改名"); // 冲突未解决时以本地为准
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      path: "name",
      upstream: "上游改名",
      local: "我改名",
      baseline: "测试菜"
    });
  });

  it("数组（食材/步骤）两边都动 → 记为冲突（不按下标硬套）", () => {
    const result = mergeFields({
      baseline,
      upstream: recipe({ steps: [{ text: "上游改的步骤" }] }),
      local: recipe({ steps: [{ text: "我改的步骤" }] })
    });

    expect(result.conflicts.map((conflict) => conflict.path)).toEqual(["steps"]);
  });

  it("diffFields 与 unexpectedValues", () => {
    expect(diffFields(baseline, recipe({ servings: 3 })).map((change) => change.path)).toEqual([
      "servings"
    ]);

    // “两边都没有、只出现在提案里”的值
    expect(unexpectedValues(recipe({ summary: "凭空冒出来的话" }), baseline)).toEqual([
      "凭空冒出来的话"
    ]);
    expect(unexpectedValues(recipe({ name: "测试菜" }), baseline)).toEqual([]);
  });
});

describe("llm 客户端", () => {
  it("缺环境变量 → 配置阻断（不猜、不发请求）", () => {
    const result = loadLlmConfig({} as NodeJS.ProcessEnv);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain("IVAN_ONLINE_API_URL");
  });

  it("配置：模型可覆盖，档位固定 low", () => {
    const result = loadLlmConfig(
      { IVAN_ONLINE_API_URL: "https://x/v1/chat/completions", IVAN_ONLINE_API_KEY: "k" } as NodeJS.ProcessEnv,
      "gpt-5.6-luna"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.model).toBe("gpt-5.6-luna");
      expect(result.config.reasoningEffort).toBe("low");
    }
  });

  it("正常返回：解析出菜谱 + 给出可疑值清单；请求体里只有三方内容（不发密钥/环境）", async () => {
    const config = { url: "https://x/v1/chat/completions", key: "SECRET", model: "gpt-5.6-luna", reasoningEffort: "low" as const };
    const merged = recipe({ name: "合并后的名字" });
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ recipe: merged, explanation: "合了菜名" }) } }]
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const baseline = recipe();
    const result = await proposeMerge(
      { baseline, upstream: recipe({ name: "上游名" }), local: recipe({ name: "我的名" }),
        conflicts: [{ path: "name", before: "测试菜", after: "上游名", baseline: "测试菜", upstream: "上游名", local: "我的名" }],
        mechanical: recipe(), fetchImpl },
      config
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recipe.name).toBe("合并后的名字");
      expect(result.explanation).toBe("合了菜名");
      expect(result.suspiciousValues).toContain("合并后的名字"); // 两边都没有 → 要人核对
    }

    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    const body = String(init.body);
    expect(body).toContain("基线");
    expect(body).toContain("上游新版");
    expect(body).not.toContain("SECRET"); // 密钥只在 header 里
    expect(body).toContain('"reasoning_effort":"low"');
  });

  it("0 冲突（两边改的是不同字段）→ 机械合并即可，**根本不调 LLM**", async () => {
    const config = { url: "https://x", key: "k", model: "gpt-5.6-luna", reasoningEffort: "low" as const };
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const result = await proposeMerge(
      {
        baseline: recipe(),
        upstream: recipe({ name: "上游只改菜名" }),
        local: recipe({ servings: 3 }),
        conflicts: [],
        mechanical: recipe({ name: "上游只改菜名", servings: 3 }),
        fetchImpl
      },
      config
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recipe.name).toBe("上游只改菜名");
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });

  it("**档位被拒 = 配置阻断**：不自动去掉 low 重试", async () => {
    const config = { url: "https://x", key: "k", model: "gpt-5.6-luna", reasoningEffort: "low" as const };
    const fetchImpl = vi.fn(async () =>
      new Response('{"error":{"message":"unsupported parameter: reasoning_effort"}}', { status: 400 })
    ) as unknown as typeof fetch;

    const result = await proposeMerge(
      { baseline: recipe(), upstream: recipe(), local: recipe(),
        conflicts: [{ path: "name", before: "a", after: "b", baseline: "a", upstream: "b", local: "c" }],
        mechanical: recipe(), fetchImpl },
      config
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("配置阻断");
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1); // 没有第二次去掉 low 的请求
  });

  it("结构不合法 / 改了 id → 拒绝，不产生提案", async () => {
    const config = { url: "https://x", key: "k", model: "gpt-5.6-luna", reasoningEffort: "low" as const };
    const call = (content: string): typeof fetch =>
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
      ) as unknown as typeof fetch;

    const broken = await proposeMerge(
      { baseline: recipe(), upstream: recipe(), local: recipe(),
        conflicts: [{ path: "name", before: "a", after: "b", baseline: "a", upstream: "b", local: "c" }],
        mechanical: recipe(), fetchImpl: call('{"recipe":{"name":"缺字段"}}') },
      config
    );
    expect(broken.ok).toBe(false);

    const renamed = await proposeMerge(
      {
        baseline: recipe(),
        upstream: recipe(),
        local: recipe(),
        conflicts: [{ path: "name", before: "a", after: "b", baseline: "a", upstream: "b", local: "c" }],
        mechanical: recipe(),
        fetchImpl: call(JSON.stringify({ recipe: recipe({ id: "another-dish" }) }))
      },
      config
    );
    expect(renamed.ok).toBe(false);
    if (!renamed.ok) expect(renamed.reason).toContain("id");
  });
});
