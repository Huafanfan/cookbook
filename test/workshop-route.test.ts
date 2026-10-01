import { deflateSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/server/index.js";
import type {
  Recipe,
  RecipeDetail,
  RecipeListResponse,
  RecipeMetaResponse,
  WorkshopAnalysisResult,
  WorkshopCapabilities,
  WorkshopDraft,
  WorkshopRecipeInput,
  WorkshopServiceOptions
} from "../src/shared/types.js";

process.env.COOKBOOK_LOG_LEVEL = "silent";

const EQUIPMENT = JSON.stringify({ tools: ["炒锅", "烤箱"], defaultOwned: ["炒锅"] });
const TAGS = JSON.stringify({ tags: [
  { name: "快手", when: "短时间完成的家常菜" },
  { name: "下饭", when: "适合配主食食用" }
] });
const EXISTING_RECIPE: Recipe = {
  id: "existing-dish",
  name: "已有菜",
  category: "家常菜",
  difficulty: 1,
  servings: 2,
  ingredients: [{ name: "盐", amount: 1, unit: "g" }],
  steps: [{ text: "拌匀。" }]
};

const apps: FastifyInstance[] = [];
const roots: string[] = [];

function recipeInput(overrides: Partial<WorkshopRecipeInput> = {}): WorkshopRecipeInput {
  return {
    name: "手作土豆汤",
    category: "汤",
    difficulty: 1,
    servings: 2,
    ingredients: [
      { name: "土豆", amount: 300, unit: "g" },
      { name: "水", amount: 500, unit: "ml" }
    ],
    steps: [{ text: "土豆切块。" }, { text: "加水煮熟。" }],
    source: "家庭记录；创意工坊整理，已人工确认",
    ...overrides
  };
}

function chunk(type: string, content: Buffer): Buffer {
  const kind = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([kind, content]);
  let crc = 0xffffffff;
  for (const byte of crcInput) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(content.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, kind, content, checksum]);
}

/** 生成真正可解码的一像素 PNG，避免依赖外网或测试图片文件。 */
function tinyPng(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const pixel = deflateSync(Buffer.from([0, 255, 64, 32, 255]));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", pixel),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

async function makeDataDir(recipes: Recipe[] = []): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cookbook-workshop-route-"));
  roots.push(root);
  const dataDir = join(root, "data");
  await mkdir(join(dataDir, "recipes"), { recursive: true });
  await writeFile(join(dataDir, "equipment.json"), EQUIPMENT);
  await writeFile(join(dataDir, "tags.json"), TAGS);
  for (const recipe of recipes) {
    await writeFile(join(dataDir, "recipes", `${recipe.id}.json`), `${JSON.stringify(recipe, null, 2)}\n`);
  }
  return dataDir;
}

async function startApp(dataDir: string, options: WorkshopServiceOptions = { config: null }): Promise<FastifyInstance> {
  const app = await createApp({ host: "127.0.0.1", port: 0, dataDir, webDir: null }, options);
  apps.push(app);
  return app;
}

async function createDraft(app: FastifyInstance): Promise<WorkshopDraft> {
  const response = await app.inject({ method: "POST", url: "/api/workshop/drafts", payload: {} });
  expect([200, 201]).toContain(response.statusCode);
  return response.json<WorkshopDraft>();
}

async function getDraft(app: FastifyInstance, draftId: string): Promise<WorkshopDraft> {
  const response = await app.inject({ method: "GET", url: `/api/workshop/drafts/${draftId}` });
  expect(response.statusCode).toBe(200);
  return response.json<WorkshopDraft>();
}

async function putDraft(
  app: FastifyInstance,
  draft: WorkshopDraft,
  patch: Partial<WorkshopDraft> & { candidate?: WorkshopRecipeInput }
): Promise<WorkshopDraft> {
  const response = await app.inject({
    method: "PUT",
    url: `/api/workshop/drafts/${draft.draftId}`,
    payload: { baseRevision: draft.revision, ...patch }
  });
  expect(response.statusCode).toBe(200);
  return response.json<WorkshopDraft>();
}

async function addText(app: FastifyInstance, draft: WorkshopDraft, text: string): Promise<WorkshopDraft> {
  const response = await app.inject({
    method: "POST",
    url: `/api/workshop/drafts/${draft.draftId}/sources`,
    payload: { baseRevision: draft.revision, kind: "text", name: "输入文字", text }
  });
  expect([200, 201]).toContain(response.statusCode);
  return response.json<WorkshopDraft>();
}

async function waitForDraft(
  app: FastifyInstance,
  draftId: string,
  done: (draft: WorkshopDraft) => boolean,
  timeoutMs = 3000
): Promise<WorkshopDraft> {
  const end = Date.now() + timeoutMs;
  let last = await getDraft(app, draftId);
  while (!done(last) && Date.now() < end) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    last = await getDraft(app, draftId);
  }
  expect(done(last), `workshop draft did not reach expected state; generation=${last.generation?.state ?? "none"}`).toBe(true);
  return last;
}

async function closeApp(app: FastifyInstance): Promise<void> {
  const index = apps.indexOf(app);
  if (index >= 0) apps.splice(index, 1);
  await app.close();
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("创意工坊 HTTP 流程（CB-014）", () => {
  it("完整词表独立于首页已使用标签，空白网页不发起收费整理", async () => {
    const dataDir = await makeDataDir();
    const analyze = vi.fn(async (): Promise<WorkshopAnalysisResult> => ({ candidates: [{ key: "one", recipe: recipeInput(), evidence: [], unresolved: [] }], explanation: "" }));
    const app = await startApp(dataDir, {
      config: { baseUrl: "https://api.deepseek.com", token: "test-only", model: "deepseek-flash" }, analyze,
      extract: async (url) => ({ url, title: "仅页面标题", text: "" })
    });
    const capabilities = (await app.inject("/api/workshop/capabilities")).json<WorkshopCapabilities>();
    expect(capabilities.vocabulary?.tags).toEqual(["快手", "下饭"]);
    let draft = await createDraft(app);
    const source = await app.inject({ method: "POST", url: `/api/workshop/drafts/${draft.draftId}/sources`, payload: { baseRevision: draft.revision, kind: "link", url: "https://example.com/recipe" } });
    expect(source.statusCode).toBe(200);
    draft = source.json<WorkshopDraft>();
    await app.inject({ method: "POST", url: `/api/workshop/drafts/${draft.draftId}/analyze`, payload: { baseRevision: draft.revision } });
    const finished = await waitForDraft(app, draft.draftId, value => value.generation?.state === "failed");
    expect(finished.sources[0].status).toBe("error");
    expect(finished.sources[0].problem).toContain("完整做法");
    expect(analyze).not.toHaveBeenCalled();
  });
  it("DS 显式禁用时仍能手工审阅并保存；列表、meta、详情、图片与重启后状态一致", async () => {
    const dataDir = await makeDataDir([EXISTING_RECIPE]);
    const app = await startApp(dataDir, { config: null });
    const capabilities = await app.inject({ method: "GET", url: "/api/workshop/capabilities" });
    expect(capabilities.statusCode).toBe(200);
    expect(capabilities.json<WorkshopCapabilities>().llmAvailable).toBe(false);

    const originalRecipeBytes = await readFile(join(dataDir, "recipes", "existing-dish.json"));
    const imageBytes = tinyPng();
    let draft = await createDraft(app);
    const sourceResponse = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/sources`,
      payload: {
        baseRevision: draft.revision,
        kind: "image",
        name: "家庭成品图.png",
        mimeType: "image/png",
        dataBase64: imageBytes.toString("base64")
      }
    });
    expect([200, 201]).toContain(sourceResponse.statusCode);
    draft = sourceResponse.json<WorkshopDraft>();
    const source = draft.sources.find((item) => item.kind === "image");
    expect(source).toBeDefined();

    draft = await putDraft(app, draft, {
      candidate: recipeInput(),
      reviewed: true,
      images: { coverSourceId: source!.id, stepSourceIds: [null, null] }
    });
    const commit = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/commit`,
      payload: { baseRevision: draft.revision, creationKey: "manual-save-1" }
    });
    expect([200, 201]).toContain(commit.statusCode);
    const saved = commit.json<{ recipe: RecipeDetail; draft: WorkshopDraft; warnings: string[] }>();
    expect(saved.recipe).toMatchObject({ name: "手作土豆汤", servings: 2, ingredients: recipeInput().ingredients });
    expect(saved.recipe.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    expect(saved.draft.savedRecipeId).toBe(saved.recipe.id);

    const list = await app.inject({ method: "GET", url: "/api/recipes" });
    expect(list.statusCode).toBe(200);
    const listed = list.json<RecipeListResponse>();
    expect(listed.total).toBe(2);
    expect(listed.items.some((item) => item.id === saved.recipe.id && item.name === "手作土豆汤")).toBe(true);

    const meta = await app.inject({ method: "GET", url: "/api/meta" });
    expect(meta.statusCode).toBe(200);
    expect(meta.json<RecipeMetaResponse>().total).toBe(2);
    expect((await app.inject({ method: "GET", url: `/api/recipes/${saved.recipe.id}` })).json<RecipeDetail>()).toMatchObject({
      name: "手作土豆汤",
      coverImage: `/images/${saved.recipe.id}/cover.jpg`
    });
    const cover = await app.inject({ method: "GET", url: `/images/${saved.recipe.id}/cover.jpg` });
    expect(cover.statusCode).toBe(200);
    expect(cover.headers["content-type"]).toContain("image/jpeg");

    await closeApp(app);
    const restarted = await startApp(dataDir, { config: null });
    expect((await getDraft(restarted, draft.draftId)).savedRecipeId).toBe(saved.recipe.id);
    expect((await restarted.inject({ method: "GET", url: "/api/recipes" })).json<RecipeListResponse>().items).toContainEqual(
      expect.objectContaining({ id: saved.recipe.id, name: "手作土豆汤" })
    );
    expect((await restarted.inject({ method: "GET", url: `/api/recipes/${saved.recipe.id}` })).json<RecipeDetail>().coverImage).toBe(
      `/images/${saved.recipe.id}/cover.jpg`
    );
    expect((await restarted.inject({ method: "GET", url: `/images/${saved.recipe.id}/cover.jpg` })).statusCode).toBe(200);
    expect(await readFile(join(dataDir, "recipes", "existing-dish.json"))).toEqual(originalRecipeBytes);
  });

  it("份量或食材缺失时允许保留草稿，但拒绝正式提交", async () => {
    const app = await startApp(await makeDataDir());
    const withoutServings = recipeInput();
    delete withoutServings.servings;
    const withoutIngredients = recipeInput();
    delete withoutIngredients.ingredients;
    for (const incomplete of [
      { name: "缺份量", candidate: withoutServings },
      { name: "缺食材", candidate: withoutIngredients }
    ]) {
      let draft = await createDraft(app);
      draft = await putDraft(app, draft, { candidate: incomplete.candidate, reviewed: true });
      const response = await app.inject({
        method: "POST",
        url: `/api/workshop/drafts/${draft.draftId}/commit`,
        payload: { baseRevision: draft.revision, creationKey: `invalid-${incomplete.name}` }
      });
      expect(response.statusCode).toBe(400);
      expect((await app.inject({ method: "GET", url: "/api/recipes" })).json<RecipeListResponse>().total).toBe(0);
    }
  });

  it("完整 Recipe JSON 可确定性导入，不调用分析器", async () => {
    const analyze = vi.fn<NonNullable<WorkshopServiceOptions["analyze"]>>();
    const app = await startApp(await makeDataDir(), {
      config: { baseUrl: "https://model.invalid/v1", token: "fixture-token", model: "fixture-model" },
      analyze
    });
    let draft = await createDraft(app);
    const jsonRecipe = {
      id: "external-id-must-not-be-used",
      name: "JSON 土豆汤",
      category: "汤",
      difficulty: 1,
      servings: 2,
      ingredients: [{ name: "土豆", amount: 300, unit: "g" }],
      steps: [{ text: "煮熟。" }],
      createdAt: "2000-01-01"
    };
    const response = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/sources`,
      payload: { baseRevision: draft.revision, kind: "json", name: "recipe.json", text: JSON.stringify(jsonRecipe) }
    });
    expect([200, 201]).toContain(response.statusCode);
    draft = response.json<WorkshopDraft>();

    const analysis = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/analyze`,
      payload: { baseRevision: draft.revision }
    });
    expect(analysis.statusCode).toBe(202);
    const completed = await waitForDraft(app, draft.draftId, (current) => current.generation?.state === "complete");
    expect(completed.candidate).toMatchObject({ name: "JSON 土豆汤", servings: 2 });
    expect(completed.candidate).not.toHaveProperty("id");
    expect(analyze).not.toHaveBeenCalled();
  });

  it("重复整理复用一个任务；用户改过候选后，新结果作为 suggestion", async () => {
    let finishFirst!: (result: WorkshopAnalysisResult) => void;
    const firstResult = new Promise<WorkshopAnalysisResult>((resolve) => {
      finishFirst = resolve;
    });
    const analyze = vi.fn<NonNullable<WorkshopServiceOptions["analyze"]>>()
      .mockImplementationOnce(() => firstResult)
      .mockResolvedValueOnce({
        candidates: [{ key: "suggestion", recipe: recipeInput({ name: "模型建议名称" }), evidence: [], unresolved: [] }],
        explanation: "按新增材料整理"
      });
    const app = await startApp(await makeDataDir(), {
      config: { baseUrl: "https://model.invalid/v1", token: "fixture-token", model: "fixture-model" },
      analyze
    });
    let draft = await createDraft(app);
    draft = await addText(app, draft, "土豆汤：土豆 300g，加水煮熟。");

    const first = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/analyze`,
      payload: { baseRevision: draft.revision }
    });
    expect(first.statusCode).toBe(202);
    const firstAccepted = first.json<WorkshopDraft>();
    await waitForDraft(app, draft.draftId, () => analyze.mock.calls.length === 1);

    const duplicate = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/analyze`,
      payload: { baseRevision: draft.revision }
    });
    expect(duplicate.statusCode).toBe(202);
    expect(duplicate.json<WorkshopDraft>().generation?.taskId).toBe(firstAccepted.generation?.taskId);
    expect(analyze).toHaveBeenCalledTimes(1);

    finishFirst({
      candidates: [{ key: "first", recipe: recipeInput({ name: "首轮结果" }), evidence: [], unresolved: [] }],
      explanation: "首次整理"
    });
    draft = await waitForDraft(app, draft.draftId, (current) => current.generation?.state === "complete");
    expect(draft.candidate.name).toBe("首轮结果");

    draft = await putDraft(app, draft, { candidate: recipeInput({ name: "我手动编辑的名称" }), reviewed: false });
    const second = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/analyze`,
      payload: { baseRevision: draft.revision }
    });
    expect(second.statusCode).toBe(202);
    const afterSecond = await waitForDraft(app, draft.draftId, (current) => current.generation?.state === "complete");
    expect(afterSecond.candidate.name).toBe("我手动编辑的名称");
    expect(afterSecond.suggestion?.candidates[0]?.recipe.name).toBe("模型建议名称");
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it("用户改写模型候选的食材用量后，GET 与重启读取都保留 user evidence", async () => {
    let sourceId = "";
    const analyze = vi.fn<NonNullable<WorkshopServiceOptions["analyze"]>>().mockImplementation(async () => ({
      candidates: [{
        key: "source-recipe",
        recipe: recipeInput(),
        evidence: [{ field: "ingredients[0].amount", status: "source", sourceIds: [sourceId], excerpt: "土豆 300g" }],
        unresolved: []
      }],
      explanation: "从用户材料整理"
    }));
    const dataDir = await makeDataDir();
    const app = await startApp(dataDir, {
      config: { baseUrl: "https://model.invalid/v1", token: "fixture-token", model: "fixture-model" },
      analyze
    });
    let draft = await createDraft(app);
    draft = await addText(app, draft, "土豆汤：土豆 300g，加水煮熟。");
    sourceId = draft.sources[0]!.id;

    const accepted = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/analyze`,
      payload: { baseRevision: draft.revision }
    });
    expect(accepted.statusCode).toBe(202);
    draft = await waitForDraft(app, draft.draftId, (current) => current.generation?.state === "complete");
    expect(draft.evidence).toContainEqual(expect.objectContaining({
      field: "ingredients[0].amount",
      status: "source",
      sourceIds: [sourceId]
    }));

    const edited: WorkshopRecipeInput = {
      ...draft.candidate,
      ingredients: draft.candidate.ingredients?.map((ingredient, index) => index === 0 ? { ...ingredient, amount: 350 } : ingredient)
    };
    draft = await putDraft(app, draft, { candidate: edited });
    const afterGet = await getDraft(app, draft.draftId);
    const amountField = (field: string): boolean => field === "ingredients" || field.startsWith("ingredients.") || field.startsWith("ingredients[");
    expect(afterGet.hasUserEdits).toBe(true);
    expect(afterGet.evidence.some((item) => item.status === "user" && amountField(item.field))).toBe(true);
    expect(afterGet.evidence.some((item) => item.status === "source" && item.sourceIds.includes(sourceId) && amountField(item.field))).toBe(false);

    await closeApp(app);
    const restarted = await startApp(dataDir, { config: null });
    const restored = await getDraft(restarted, draft.draftId);
    expect(restored.candidate.ingredients?.[0]?.amount).toBe(350);
    expect(restored.evidence).toEqual(afterGet.evidence);
    expect(restored.evidence.some((item) => item.status === "user" && amountField(item.field))).toBe(true);
    expect(restored.evidence.some((item) => item.status === "source" && item.sourceIds.includes(sourceId) && amountField(item.field))).toBe(false);
  });

  it("JSON-LD link evidence 绑定真实 source ID；采用 suggestion 后 evidence 与 unresolved 持久化", async () => {
    const extractedCandidate = {
      key: "jsonld-candidate",
      recipe: recipeInput({ name: "链接结构化汤" }),
      evidence: [{ field: "ingredients[0].amount", status: "source" as const, sourceIds: [], excerpt: "土豆 300g" }],
      unresolved: [{ field: "servings", message: "原文未说明份量。" }]
    };
    const extract = vi.fn<NonNullable<WorkshopServiceOptions["extract"]>>().mockResolvedValue({
      url: "https://public.example/recipe",
      title: "结构化菜谱",
      text: "土豆汤，土豆 300g。",
      candidates: [extractedCandidate]
    });
    let linkSourceId = "";
    const makeSuggestionEvidence = () => [{
      field: "ingredients[0].amount",
      status: "source" as const,
      sourceIds: [linkSourceId],
      excerpt: "土豆 400g"
    }];
    const suggestedUnresolved = [{ field: "servings", message: "请确认实际份量。" }];
    const analyze = vi.fn<NonNullable<WorkshopServiceOptions["analyze"]>>().mockResolvedValue({
      candidates: [{
        key: "model-suggestion",
        recipe: recipeInput({ name: "模型建议汤", ingredients: [{ name: "土豆", amount: 400, unit: "g" }] }),
        evidence: makeSuggestionEvidence(),
        unresolved: suggestedUnresolved
      }],
      explanation: "补充文字后形成建议"
    });
    const dataDir = await makeDataDir();
    const app = await startApp(dataDir, {
      config: { baseUrl: "https://model.invalid/v1", token: "fixture-token", model: "fixture-model" },
      extract,
      analyze
    });
    let draft = await createDraft(app);
    const linkResponse = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/sources`,
      payload: { baseRevision: draft.revision, kind: "link", url: "https://public.example/recipe" }
    });
    expect([200, 201]).toContain(linkResponse.statusCode);
    draft = linkResponse.json<WorkshopDraft>();
    linkSourceId = draft.sources.find((source) => source.kind === "link")!.id;

    const firstAnalysis = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/analyze`,
      payload: { baseRevision: draft.revision }
    });
    expect(firstAnalysis.statusCode).toBe(202);
    draft = await waitForDraft(app, draft.draftId, (current) => current.generation?.state === "complete");
    expect(extract).toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
    expect(draft.evidence).toContainEqual(expect.objectContaining({
      field: "ingredients[0].amount",
      status: "source",
      sourceIds: [linkSourceId]
    }));

    draft = await putDraft(app, draft, { candidate: recipeInput({ name: "我先手动核对的候选" }) });
    draft = await addText(app, draft, "再补充：有时土豆会用到 400g。");
    const secondAnalysis = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/analyze`,
      payload: { baseRevision: draft.revision }
    });
    expect(secondAnalysis.statusCode).toBe(202);
    draft = await waitForDraft(app, draft.draftId, (current) => current.generation?.state === "complete");
    expect(draft.candidate.name).toBe("我先手动核对的候选");
    expect(draft.suggestion?.candidates[0]?.recipe.name).toBe("模型建议汤");

    const adopted = draft.suggestion!.candidates[0]!;
    draft = await putDraft(app, draft, { candidate: adopted.recipe });
    expect(draft.candidate).toEqual(adopted.recipe);
    expect(draft.evidence).toEqual(adopted.evidence);
    expect(draft.unresolved).toEqual(suggestedUnresolved);
    const afterGet = await getDraft(app, draft.draftId);
    expect(afterGet.evidence).toEqual(adopted.evidence);
    expect(afterGet.unresolved).toEqual(suggestedUnresolved);

    await closeApp(app);
    const restarted = await startApp(dataDir, { config: null });
    const restored = await getDraft(restarted, draft.draftId);
    expect(restored.candidate).toEqual(adopted.recipe);
    expect(restored.evidence).toEqual(adopted.evidence);
    expect(restored.unresolved).toEqual(suggestedUnresolved);
  });

  it("来源失败后仍保留草稿，可追加文字继续", async () => {
    const extract = vi.fn<NonNullable<WorkshopServiceOptions["extract"]>>().mockRejectedValue(new Error("fixture extraction failure"));
    const analyze = vi.fn<NonNullable<WorkshopServiceOptions["analyze"]>>();
    const app = await startApp(await makeDataDir(), {
      config: { baseUrl: "https://model.invalid/v1", token: "fixture-token", model: "fixture-model" },
      extract,
      analyze
    });
    let draft = await createDraft(app);
    const link = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/sources`,
      payload: { baseRevision: draft.revision, kind: "link", url: "https://public.example/recipe" }
    });
    expect([200, 201]).toContain(link.statusCode);
    draft = link.json<WorkshopDraft>();

    const analysis = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/analyze`,
      payload: { baseRevision: draft.revision }
    });
    expect(analysis.statusCode).toBe(202);
    draft = await waitForDraft(app, draft.draftId, (current) => current.generation?.state === "failed");
    expect(extract).toHaveBeenCalledTimes(1);
    expect(analyze).not.toHaveBeenCalled();
    expect(draft.sources).toHaveLength(1);

    draft = await addText(app, draft, "补充：土豆 300g，煮熟即可。");
    expect(draft.sources).toHaveLength(2);
    expect(draft.sources.some((source) => source.kind === "link" && source.status === "error")).toBe(true);
    expect(draft.sources.some((source) => source.kind === "text" && source.status === "ready")).toBe(true);
  });

  it("旧版本分析晚到时不覆盖用户随后添加的来源和候选", async () => {
    let finishAnalysis!: (result: WorkshopAnalysisResult) => void;
    const delayed = new Promise<WorkshopAnalysisResult>((resolve) => {
      finishAnalysis = resolve;
    });
    const analyze = vi.fn<NonNullable<WorkshopServiceOptions["analyze"]>>().mockReturnValue(delayed);
    const app = await startApp(await makeDataDir(), {
      config: { baseUrl: "https://model.invalid/v1", token: "fixture-token", model: "fixture-model" },
      analyze
    });
    let draft = await createDraft(app);
    draft = await putDraft(app, draft, { candidate: recipeInput({ name: "已确认的手工候选" }), reviewed: false });
    draft = await addText(app, draft, "第一份材料");
    const response = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/analyze`,
      payload: { baseRevision: draft.revision }
    });
    expect(response.statusCode).toBe(202);
    await waitForDraft(app, draft.draftId, () => analyze.mock.calls.length === 1);

    draft = await addText(app, await getDraft(app, draft.draftId), "整理过程中补充的材料");
    finishAnalysis({
      candidates: [{ key: "late", recipe: recipeInput({ name: "过期结果" }), evidence: [], unresolved: [] }],
      explanation: "不应应用"
    });
    const after = await waitForDraft(
      app,
      draft.draftId,
      (current) => !["queued", "extracting", "analyzing"].includes(current.generation?.state ?? "")
    );
    expect(after.sources).toHaveLength(2);
    expect(after.candidate.name).toBe("已确认的手工候选");
    expect(after.suggestion?.candidates[0]?.recipe.name).not.toBe("过期结果");
  });

  it("第二台服务持有旧 revision 时收到 409 和当前草稿", async () => {
    const dataDir = await makeDataDir();
    const firstApp = await startApp(dataDir);
    const secondApp = await startApp(dataDir);
    const initial = await createDraft(firstApp);
    const stale = await getDraft(secondApp, initial.draftId);

    const saved = await putDraft(firstApp, initial, { candidate: recipeInput({ name: "设备一的编辑" }) });
    const conflict = await secondApp.inject({
      method: "PUT",
      url: `/api/workshop/drafts/${stale.draftId}`,
      payload: { baseRevision: stale.revision, candidate: recipeInput({ name: "设备二的旧编辑" }) }
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json<{ current: WorkshopDraft }>().current).toMatchObject({
      draftId: saved.draftId,
      candidate: { name: "设备一的编辑" },
      revision: saved.revision
    });
    expect((await getDraft(firstApp, initial.draftId)).candidate.name).toBe("设备一的编辑");
  });

  it("同一 creationKey 并发双击只创建一道菜并返回相同 ID", async () => {
    const app = await startApp(await makeDataDir());
    let draft = await createDraft(app);
    draft = await putDraft(app, draft, { candidate: recipeInput(), reviewed: true });
    const payload = { baseRevision: draft.revision, creationKey: "double-click-key" };
    const [left, right] = await Promise.all([
      app.inject({ method: "POST", url: `/api/workshop/drafts/${draft.draftId}/commit`, payload }),
      app.inject({ method: "POST", url: `/api/workshop/drafts/${draft.draftId}/commit`, payload })
    ]);
    expect([200, 201]).toContain(left.statusCode);
    expect([200, 201]).toContain(right.statusCode);
    const leftId = left.json<{ recipe: RecipeDetail }>().recipe.id;
    const rightId = right.json<{ recipe: RecipeDetail }>().recipe.id;
    expect(rightId).toBe(leftId);
    expect((await app.inject({ method: "GET", url: "/api/recipes" })).json<RecipeListResponse>().total).toBe(1);
  });

  it("跨站和不匹配 Origin 的写请求返回 403", async () => {
    const app = await startApp(await makeDataDir());
    for (const headers of [
      { "sec-fetch-site": "cross-site" },
      { origin: "https://attacker.invalid" }
    ]) {
      const response = await app.inject({ method: "POST", url: "/api/workshop/drafts", headers, payload: {} });
      expect(response.statusCode).toBe(403);
    }
  });

  it("超过单图上限返回 413，且不登记材料", async () => {
    const app = await startApp(await makeDataDir());
    let draft = await createDraft(app);
    const capabilities = (await app.inject({ method: "GET", url: "/api/workshop/capabilities" })).json<WorkshopCapabilities>();
    const tooLargeBase64 = Buffer.alloc(capabilities.limits.imageBytes + 1).toString("base64");
    const response = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/sources`,
      payload: {
        baseRevision: draft.revision,
        kind: "image",
        name: "oversized.png",
        mimeType: "image/png",
        dataBase64: tooLargeBase64
      }
    });
    expect(response.statusCode).toBe(413);
    draft = await getDraft(app, draft.draftId);
    expect(draft.sources).toHaveLength(0);
  });

  it("恶意原文件名不成为路径；未知 source 与路径穿越均不能读取本地文件", async () => {
    const dataDir = await makeDataDir();
    const app = await startApp(dataDir);
    const equipmentPath = join(dataDir, "equipment.json");
    const equipmentBytes = await readFile(equipmentPath);
    const imageBytes = tinyPng();
    let draft = await createDraft(app);
    const uploaded = await app.inject({
      method: "POST",
      url: `/api/workshop/drafts/${draft.draftId}/sources`,
      payload: {
        baseRevision: draft.revision,
        kind: "image",
        name: "../../equipment.json",
        mimeType: "image/png",
        dataBase64: imageBytes.toString("base64")
      }
    });
    expect([200, 201]).toContain(uploaded.statusCode);
    draft = uploaded.json<WorkshopDraft>();
    const source = draft.sources.find((item) => item.kind === "image")!;

    const raw = await app.inject({ method: "GET", url: `/api/workshop/drafts/${draft.draftId}/sources/${source.id}` });
    expect(raw.statusCode).toBe(200);
    expect(raw.headers["content-type"]).toContain("image/png");
    expect(Buffer.from(raw.rawPayload)).toEqual(imageBytes);
    expect(await readFile(equipmentPath)).toEqual(equipmentBytes);

    const unknown = await app.inject({
      method: "GET",
      url: `/api/workshop/drafts/${draft.draftId}/sources/s-000000000000000000000000`
    });
    expect(unknown.statusCode).toBe(404);
    const traversal = await app.inject({
      method: "GET",
      url: `/api/workshop/drafts/${draft.draftId}/sources/..%2f..%2fequipment.json`
    });
    expect([400, 404]).toContain(traversal.statusCode);
    expect(traversal.payload).not.toContain('"tools"');

    const invalidSelection = await app.inject({
      method: "PUT",
      url: `/api/workshop/drafts/${draft.draftId}`,
      payload: {
        baseRevision: draft.revision,
        images: { coverSourceId: "s-000000000000000000000000", stepSourceIds: [] }
      }
    });
    expect(invalidSelection.statusCode).toBe(400);
  });
});
