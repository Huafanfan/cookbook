import { describe, expect, it, vi } from "vitest";

import type { WorkshopAnalysisResult, WorkshopLlmInput, WorkshopMaterial } from "../src/shared/types.js";
import { WorkshopError } from "../src/server/lib/workshop-errors.js";
import {
  analyzeWorkshopMaterials,
  loadWorkshopLlmConfig,
  WORKSHOP_PROMPT_VERSION,
  workshopLlmProblem
} from "../src/server/lib/workshop-llm.js";

const config = { baseUrl: "https://api.deepseek.com", token: "test-token-never-print", model: "deepseek-flash" };
const sourceId = "s-111111111111111111111111";
const otherSourceId = "s-222222222222222222222222";

function source(id: string, name: string): WorkshopMaterial["source"] {
  return {
    id,
    kind: "image",
    name,
    selected: true,
    status: "ready",
    sha256: "sha256:test",
    byteSize: 3,
    mimeType: "image/jpeg"
  };
}

function makeInput(materials: WorkshopMaterial[] = []): WorkshopLlmInput {
  return {
    materials,
    instructions: "",
    currentCandidate: {},
    allowedTools: ["炒锅", "汤锅"],
    allowedTags: ["汤类", "快手菜"]
  };
}

function modelOutput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    candidates: [{
      key: "soup",
      recipe: {
        name: "土豆汤",
        category: "汤",
        difficulty: 1,
        servings: 2,
        ingredients: [{ name: "土豆", amount: 300, unit: "g" }],
        steps: [{ text: "土豆加水煮熟。" }]
      },
      evidence: [{
        field: "ingredients.0.amount",
        status: "source",
        sourceIds: [sourceId],
        excerpt: "土豆 300g"
      }],
      unresolved: []
    }],
    explanation: "请核对用量。",
    ...overrides
  };
}

function openAiResponse(content: string, status = 200, usage?: Record<string, number>): Response {
  return new Response(
    status >= 200 && status < 300
      ? JSON.stringify({
        choices: [{ message: { content } }],
        ...(usage ? { usage } : {})
      })
      : "provider error body with private diagnostic",
    { status, headers: { "content-type": "application/json" } }
  );
}

function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): typeof fetch {
  return vi.fn(handler) as unknown as typeof fetch;
}

async function expectWorkshopError(promise: Promise<unknown>, code: string): Promise<WorkshopError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(WorkshopError);
    expect((error as WorkshopError).code).toBe(code);
    return error as WorkshopError;
  }
  throw new Error("expected WorkshopError");
}

describe("workshop DS configuration", () => {
  it("loads the environment configuration with deepseek-flash as default and exposes only safe problems", () => {
    expect(loadWorkshopLlmConfig({})).toBeNull();
    expect(workshopLlmProblem({})).toBe("未配置 DS_BASE_URL");
    expect(workshopLlmProblem({ DS_BASE_URL: "https://api.deepseek.com" })).toBe("未配置 DS_AUTH_TOKEN");
    expect(loadWorkshopLlmConfig({
      DS_BASE_URL: "https://api.deepseek.com/",
      DS_AUTH_TOKEN: "private-token"
    })).toEqual({
      baseUrl: "https://api.deepseek.com",
      token: "private-token",
      model: "deepseek-flash"
    });
    expect(WORKSHOP_PROMPT_VERSION).toBe("cb014-workshop-v1");
  });
});

describe("analyzeWorkshopMaterials", () => {
  it("真实 DS 的依据映射和未决字符串可无损归一化，单步等待不能充当总耗时", async () => {
    const output = modelOutput();
    const candidates = output.candidates as Record<string, unknown>[];
    candidates[0].recipe = { ...candidates[0].recipe as object, cookMinutes: 3, prepMinutes: null };
    candidates[0].evidence = { "ingredients[0].amount": { status: "source", sourceId, excerpt: "土豆300g" }, cookMinutes: { status: "source", sourceIds: [sourceId], excerpt: "煮3分钟" } };
    candidates[0].unresolved = ["原文没有写准备时间"];
    const result = await analyzeWorkshopMaterials(makeInput([{ source: source(sourceId, "材料"), text: "土豆300g，煮3分钟。" }]), config, { fetchImpl: mockFetch(async () => openAiResponse(JSON.stringify(output))) });
    expect(result.candidates[0].recipe).not.toHaveProperty("cookMinutes");
    expect(result.candidates[0].recipe).not.toHaveProperty("prepMinutes");
    expect(result.candidates[0].evidence.find(item => item.field === "ingredients.0.amount")?.sourceIds).toEqual([sourceId]);
    expect(result.candidates[0].unresolved).toContainEqual({ field: "recipe", message: "原文没有写准备时间" });
  });
  it("格式修复时汇总两次实际用量，并显式限制输出", async () => {
    let calls = 0;
    const fetchImpl = mockFetch(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.max_tokens).toBe(8192);
      calls += 1;
      return calls === 1
        ? openAiResponse("", 200, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 })
        : openAiResponse(JSON.stringify(modelOutput()), 200, { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 });
    });
    const result = await analyzeWorkshopMaterials(makeInput(), config, { fetchImpl });
    expect(calls).toBe(2);
    expect(result.usage).toEqual({ promptTokens: 30, completionTokens: 15, totalTokens: 45 });
    expect(loadWorkshopLlmConfig({ DS_BASE_URL: "https://api.deepseek.com", DS_AUTH_TOKEN: "test-only", DS_MODEL: "deepseek-v4-pro" })).toBeNull();
  });
  it("preserves the order of multiple original-detail image blocks and requests JSON with thinking disabled", async () => {
    const materials: WorkshopMaterial[] = [
      { source: source(sourceId, "第一张"), image: { mimeType: "image/jpeg", base64: "AQI=" } },
      { source: source(otherSourceId, "第二张"), image: { mimeType: "image/jpeg", base64: "AwQ=" } }
    ];
    const fetchImpl = mockFetch(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("deepseek-flash");
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.thinking).toEqual({ type: "disabled" });
      const blocks = body.messages[1].content as { type: string; image_url?: { url: string; detail: string } }[];
      const images = blocks.filter((block) => block.type === "image_url");
      expect(images.map((block) => block.image_url?.url)).toEqual([
        "data:image/jpeg;base64,AQI=",
        "data:image/jpeg;base64,AwQ="
      ]);
      expect(images.every((block) => block.image_url?.detail === "original")).toBe(true);
      return openAiResponse(JSON.stringify(modelOutput()), 200, {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      });
    });
    const result = await analyzeWorkshopMaterials(makeInput(materials), config, { fetchImpl });
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("strips protected fields, filters unknown source IDs and enforces tag/equipment vocabularies", async () => {
    const candidate = modelOutput({
      candidates: [{
        key: "soup",
        recipe: {
          id: "model-controlled-id",
          sourceRef: { repo: "https://example.com", path: "../../private" },
          createdAt: "2020-01-01",
          updatedAt: "2020-01-02",
          name: "土豆汤",
          category: "汤",
          difficulty: 1,
          tags: ["汤类", "不存在的标签"],
          equipment: ["炒锅", "不存在的厨具"],
          ingredients: [{ name: "土豆", amount: 300, unit: "g" }],
          steps: [{ text: "土豆加水煮熟。" }]
        },
        evidence: [
          {
            field: "ingredients.0.amount",
            status: "source",
            sourceIds: [sourceId, "unknown-source"],
            excerpt: "土豆 300g"
          },
          { field: "name", status: "source", sourceIds: ["not-selected"], excerpt: "土豆汤" }
        ],
        unresolved: []
      }]
    });
    const fetchImpl = mockFetch(async () => openAiResponse(JSON.stringify(candidate)));
    const result = await analyzeWorkshopMaterials(
      makeInput([{ source: source(sourceId, "文字材料"), text: "土豆 300g" }]),
      config,
      { fetchImpl }
    );
    const recipe = result.candidates[0].recipe as Record<string, unknown>;
    expect(recipe).not.toHaveProperty("id");
    expect(recipe).not.toHaveProperty("sourceRef");
    expect(recipe).not.toHaveProperty("createdAt");
    expect(recipe).not.toHaveProperty("updatedAt");
    expect(recipe.tags).toEqual(["汤类"]);
    expect(recipe.equipment).toEqual(["炒锅"]);
    expect(result.candidates[0].evidence.find((entry) => entry.field === "ingredients.0.amount")?.sourceIds).toEqual([sourceId]);
    expect(result.candidates[0].evidence.find((entry) => entry.field === "name")).toMatchObject({
      status: "unknown",
      sourceIds: []
    });
    expect(result.candidates[0].evidence.find((entry) => entry.field === "category")?.status).toBe("suggested");
    expect(result.candidates[0].evidence.find((entry) => entry.field === "difficulty")?.status).toBe("suggested");
    expect(result.candidates[0].unresolved.some((issue) => issue.field === "tags")).toBe(true);
    expect(result.candidates[0].unresolved.some((issue) => issue.field === "equipment")).toBe(true);
  });

  it("repairs empty or truncated JSON once and never exceeds two requests", async () => {
    let call = 0;
    const fetchImpl = mockFetch(async () => {
      call += 1;
      return openAiResponse(call === 1 ? '{"candidates":[' : JSON.stringify(modelOutput()));
    });
    const result = await analyzeWorkshopMaterials(makeInput(), config, { fetchImpl });
    expect(result.candidates).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("repairs an empty first response exactly once", async () => {
    let call = 0;
    const fetchImpl = mockFetch(async () => {
      call += 1;
      return openAiResponse(call === 1 ? "" : JSON.stringify(modelOutput()));
    });
    const result = await analyzeWorkshopMaterials(makeInput(), config, { fetchImpl });
    expect(result.candidates).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps distinct recipes separate and marks each for individual confirmation", async () => {
    const first = modelOutput().candidates as Record<string, unknown>[];
    const second = {
      ...(first[0] as Record<string, unknown>),
      key: "salad",
      recipe: { name: "黄瓜沙拉" }
    };
    const fetchImpl = mockFetch(async () => openAiResponse(JSON.stringify({
      candidates: [first[0], second],
      explanation: ""
    })));
    const result = await analyzeWorkshopMaterials(makeInput(), config, { fetchImpl });
    expect(result.candidates.map((candidate) => candidate.recipe.name)).toEqual(["土豆汤", "黄瓜沙拉"]);
    expect(result.candidates.every((candidate) => candidate.unresolved.some((issue) => issue.field === "candidate"))).toBe(true);
  });

  it("returns a schema-validated empty candidate for insufficient materials without inventing fields", async () => {
    const insufficient = { candidates: [], explanation: "无法从成品照片确认配方" };
    const fetchImpl = mockFetch(async () => openAiResponse(JSON.stringify(insufficient)));
    const result: WorkshopAnalysisResult = await analyzeWorkshopMaterials(makeInput(), config, { fetchImpl });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].recipe).toEqual({});
    expect(result.candidates[0].unresolved).toContainEqual(expect.objectContaining({ field: "recipe" }));
  });

  it("does not retry 401 or expose the provider response body", async () => {
    const fetchImpl = mockFetch(async () => openAiResponse("", 401));
    const error = await expectWorkshopError(
      analyzeWorkshopMaterials(makeInput(), config, { fetchImpl }),
      "workshop_llm_auth_failed"
    );
    expect(error.message).not.toContain("private diagnostic");
    expect(error.message).not.toContain(config.token);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 only once and returns a safe rate-limit message", async () => {
    const fetchImpl = mockFetch(async () => openAiResponse("", 429));
    const error = await expectWorkshopError(
      analyzeWorkshopMaterials(makeInput(), config, { fetchImpl }),
      "workshop_llm_rate_limited"
    );
    expect(error.message).not.toContain("private diagnostic");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("caps a stalled request at its configured test timeout and can be cancelled", async () => {
    const never = new Promise<Response>(() => undefined);
    const fetchImpl = mockFetch(async () => never);
    const error = await expectWorkshopError(
      analyzeWorkshopMaterials(makeInput(), config, { fetchImpl, timeoutMs: 5 }),
      "workshop_llm_timeout"
    );
    expect(error.statusCode).toBe(504);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps the retry budget at two calls when both responses are malformed", async () => {
    const fetchImpl = mockFetch(async () => openAiResponse(""));
    const error = await expectWorkshopError(
      analyzeWorkshopMaterials(makeInput(), config, { fetchImpl }),
      "workshop_llm_invalid_output"
    );
    expect(error.message).not.toContain(config.token);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
