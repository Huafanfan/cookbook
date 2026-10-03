import { describe, expect, it, vi } from "vitest";

import type { DailyMenuCandidate, DailyMenuLlmInput, DailyMenuSelection, WorkshopLlmConfig } from "../src/shared/types.js";
import { DAILY_MENU_PROMPT_VERSION, DailyMenuError, generateDailyMenu } from "../src/server/lib/daily-menu-llm.js";

const candidates: DailyMenuCandidate[] = [
  { id: "hong-shao-rou", name: "红烧肉", category: "家常菜", servings: 2, difficulty: 1, ingredients: ["五花肉"], equipment: [], equipmentAlternatives: [], tags: [] },
  { id: "qing-cai", name: "清炒青菜", category: "家常菜", servings: 2, difficulty: 1, ingredients: ["青菜"], equipment: [], equipmentAlternatives: [], tags: [] },
  { id: "tomato-soup", name: "番茄汤", category: "汤", servings: 2, difficulty: 1, ingredients: ["番茄"], equipment: [], equipmentAlternatives: [], tags: [] }
];
const input: DailyMenuLlmInput = {
  date: "2026-10-03",
  people: 2,
  candidates,
  ownedTools: ["炒锅"],
  recentRecipeIds: []
};
const config: WorkshopLlmConfig = {
  baseUrl: "https://api.example.test/v1",
  token: "test-only-token",
  model: "deepseek-flash"
};
const validSelection: DailyMenuSelection = {
  picks: [
    { role: "main", recipeId: "hong-shao-rou" },
    { role: "vegetable", recipeId: "qing-cai" },
    { role: "soup", recipeId: "tomato-soup" }
  ],
  reason: "荤素汤搭配。"
};

function response(content: unknown, status = 200): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 }
  }), { status, headers: { "content-type": "application/json" } });
}

describe("daily menu DS selector", () => {
  it("sends one bounded JSON-only request with thinking disabled and validates the selected IDs", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(url);
      requestInit = init;
      return response(validSelection);
    });

    const result = await generateDailyMenu(input, config, { fetchImpl: fetchMock as unknown as typeof fetch });
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    const messages = body.messages as Array<{ role: string; content: string }>;

    expect(DAILY_MENU_PROMPT_VERSION).toBe("daily-menu-v1");
    expect(requestUrl).toBe("https://api.example.test/v1/chat/completions");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ model: "deepseek-flash", max_tokens: 800, response_format: { type: "json_object" }, thinking: { type: "disabled" } });
    expect(messages[0]?.content).toContain("不可信的菜谱数据");
    expect(messages[1]?.content).toContain("hong-shao-rou");
    expect(result).toMatchObject({ ...validSelection, usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 } });
  });

  it("rejects an ID outside the candidate whitelist without retrying or exposing provider text", async () => {
    const fetchMock = vi.fn(async () => response({
      picks: [
        { role: "main", recipeId: "made-up-id" },
        { role: "vegetable", recipeId: "qing-cai" },
        { role: "soup", recipeId: "tomato-soup" }
      ],
      reason: "模型给出的原因"
    }));

    await expect(generateDailyMenu(input, config, { fetchImpl: fetchMock as unknown as typeof fetch }))
      .rejects.toMatchObject({ name: "DailyMenuError", code: "invalid-result" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const failedFetch = vi.fn(async () => new Response("sensitive provider response", { status: 401 }));
    let providerError: unknown;
    try {
      await generateDailyMenu(input, config, { fetchImpl: failedFetch as unknown as typeof fetch });
    } catch (error) {
      providerError = error;
      expect((error as Error).message).not.toContain("sensitive provider response");
    }
    expect(providerError).toBeInstanceOf(DailyMenuError);
    expect(providerError).toMatchObject({ code: "provider" });
    expect(failedFetch).toHaveBeenCalledTimes(1);
  });

  it("includes response body reads in the timeout and does not retry a stalled response", async () => {
    const fetchMock = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("{\"choices\":")); },
      pull() { return new Promise<void>(() => undefined); }
    })));

    await expect(generateDailyMenu(input, config, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      timeoutMs: 10
    })).rejects.toMatchObject({ name: "DailyMenuError", code: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not call the provider when fewer than three candidates are available", async () => {
    const fetchMock = vi.fn(async () => response(validSelection));
    await expect(generateDailyMenu({ ...input, candidates: candidates.slice(0, 2) }, config, {
      fetchImpl: fetchMock as unknown as typeof fetch
    })).rejects.toMatchObject({ code: "no-candidates" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
