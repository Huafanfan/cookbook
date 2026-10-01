import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/server/index.js";
import { RecipeRepository } from "../src/server/services/recipe-repository.js";
import type {
  Recipe,
  WorkshopDraft,
  WorkshopImageResult,
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

let tempDir: string | null = null;

function recipeInput(overrides: Partial<WorkshopRecipeInput> = {}): WorkshopRecipeInput {
  return {
    name: "手作土豆汤",
    category: "汤",
    difficulty: 1,
    servings: 2,
    ingredients: [{ name: "土豆", amount: 300, unit: "g" }],
    steps: [{ text: "土豆切块。" }, { text: "加水煮熟。" }],
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

function tinyPng(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from([0, 255, 64, 32, 255]))),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function makeDataDir(recipes: Recipe[] = [EXISTING_RECIPE]): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "cookbook-workshop-storage-"));
  await mkdir(join(tempDir, "recipes"), { recursive: true });
  await writeFile(join(tempDir, "equipment.json"), EQUIPMENT);
  await writeFile(join(tempDir, "tags.json"), TAGS);
  for (const recipe of recipes) {
    await writeFile(join(tempDir, "recipes", `${recipe.id}.json`), `${JSON.stringify(recipe, null, 2)}\n`);
  }
  return tempDir;
}

async function seedDraft(repository: RecipeRepository, candidate = recipeInput()): Promise<WorkshopDraft> {
  let draft = await repository.createWorkshopDraft();
  draft = await repository.updateWorkshopDraft(draft.draftId, {
    baseRevision: draft.revision,
    candidate,
    reviewed: true
  });
  return draft;
}

async function savePrepared(repository: RecipeRepository, draft: WorkshopDraft, creationKey: string) {
  return repository.commitWorkshopDraft(draft.draftId, {
    baseRevision: draft.revision,
    creationKey
  });
}

async function rawDraftPath(dir: string, draftId: string): Promise<string> {
  return join(dir, "workshop", "drafts", draftId, "draft.json");
}

async function snapshotFiles(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const path of paths) result.set(path, sha256(await readFile(path)));
  return result;
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("创意工坊 repository 持久化协议（CB-014）", () => {
  it("revision 等于 draft.json 实际字节 SHA-256，读取与摘要跨 repository 重启", async () => {
    const dir = await makeDataDir();
    const first = await RecipeRepository.load(dir);
    const draft = await first.createWorkshopDraft();
    const path = await rawDraftPath(dir, draft.draftId);
    const bytes = await readFile(path);

    expect(draft.revision).toBe(sha256(bytes));
    expect(JSON.parse(bytes.toString("utf8"))).not.toHaveProperty("revision");
    expect(await first.readWorkshopDraft(draft.draftId)).toMatchObject({
      draftId: draft.draftId,
      revision: draft.revision
    });

    const restarted = await RecipeRepository.load(dir);
    expect(await restarted.readWorkshopDraft(draft.draftId)).toMatchObject({
      draftId: draft.draftId,
      revision: draft.revision,
      inputVersion: draft.inputVersion
    });
    expect(await restarted.listWorkshopDrafts()).toContainEqual(
      expect.objectContaining({ draftId: draft.draftId, sourceCount: 0, state: "collecting" })
    );
  });

  it("坏草稿单独跳过且不阻止正式菜谱载入", async () => {
    const dir = await makeDataDir();
    const badId = "w-000000000000000000000001";
    const badDir = join(dir, "workshop", "drafts", badId);
    await mkdir(badDir, { recursive: true });
    await writeFile(join(badDir, "draft.json"), "{ broken json", "utf8");

    const repository = await RecipeRepository.load(dir);
    expect(repository.get("existing-dish")?.name).toBe("已有菜");
    expect(await repository.readWorkshopDraft(badId)).toBeNull();
    expect(await repository.listWorkshopDrafts()).toHaveLength(0);
  });

  it("原始图片和草稿在新 repository 实例中仍可读取", async () => {
    const dir = await makeDataDir();
    const first = await RecipeRepository.load(dir);
    const draft = await first.createWorkshopDraft();
    const image = tinyPng();
    const imageResult: WorkshopImageResult = {
      bytes: image,
      mimeType: "image/png",
      normalized: image,
      width: 1,
      height: 1
    };
    const saved = await first.addWorkshopSource(
      draft.draftId,
      {
        baseRevision: draft.revision,
        kind: "image",
        name: "source.png",
        mimeType: "image/png",
        dataBase64: image.toString("base64")
      },
      imageResult
    );
    const source = saved.sources.find((item) => item.kind === "image")!;

    const restarted = await RecipeRepository.load(dir);
    const sourceFile = await restarted.readWorkshopSource(draft.draftId, source.id);
    expect(sourceFile).toMatchObject({ mimeType: "image/png" });
    expect(Buffer.from(sourceFile!.bytes)).toEqual(image);
  });

  it("服务重启把执行中的生成任务标成 interrupted，且不会自动调用分析器", async () => {
    const dir = await makeDataDir();
    const first = await RecipeRepository.load(dir);
    const draft = await first.createWorkshopDraft();
    const path = await rawDraftPath(dir, draft.draftId);
    const raw = JSON.parse((await readFile(path, "utf8")) as string) as Record<string, unknown>;
    raw.generation = {
      taskId: "interrupted-task",
      state: "analyzing",
      inputVersion: draft.inputVersion,
      fingerprint: "fixture-fingerprint",
      startedAt: "2026-10-01T00:00:00.000Z",
      model: "fixture-model",
      promptVersion: "fixture-prompt"
    };
    await writeFile(path, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

    const analyze = vi.fn<NonNullable<WorkshopServiceOptions["analyze"]>>();
    const app = await createApp(
      { host: "127.0.0.1", port: 0, dataDir: dir, webDir: null },
      { config: { baseUrl: "https://model.invalid/v1", token: "fixture-token", model: "fixture-model" }, analyze }
    );
    try {
      const response = await app.inject({ method: "GET", url: `/api/workshop/drafts/${draft.draftId}` });
      expect(response.statusCode).toBe(200);
      expect(response.json<WorkshopDraft>().generation?.state).toBe("interrupted");
      expect(analyze).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("回执丢失后按同一 creationKey 恢复原 ID，不创建第二份或伪造历史", async () => {
    const dir = await makeDataDir();
    const first = await RecipeRepository.load(dir);
    const draft = await seedDraft(first);
    const committed = await savePrepared(first, draft, "recover-key");
    const originalNewRecipeBytes = await readFile(join(dir, "recipes", `${committed.recipe.id}.json`));

    // 模拟正式 JSON 已创建，但创建回执尚未写回草稿的崩溃窗口。
    const path = await rawDraftPath(dir, draft.draftId);
    const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
    raw.creation.phase = "prepared";
    delete raw.savedRecipeId;
    await writeFile(path, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

    const restarted = await RecipeRepository.load(dir);
    const pending = await restarted.readWorkshopDraft(draft.draftId);
    expect(pending?.creation?.recipeId).toBe(committed.recipe.id);
    const recovered = await savePrepared(restarted, pending!, "recover-key");
    expect(recovered.recipe.id).toBe(committed.recipe.id);
    expect(recovered.draft.savedRecipeId).toBe(committed.recipe.id);
    expect(await readFile(join(dir, "recipes", `${committed.recipe.id}.json`))).toEqual(originalNewRecipeBytes);
    expect(await restarted.listHistory(committed.recipe.id)).toHaveLength(0);
  });

  it("prepared creation 冻结了 recipe 与幂等键，编辑候选不能改写创建内容", async () => {
    const dir = await makeDataDir();
    const first = await RecipeRepository.load(dir);
    const draft = await seedDraft(first, recipeInput({ name: "冻结名称" }));
    const committed = await savePrepared(first, draft, "first-key");
    const path = await rawDraftPath(dir, draft.draftId);
    const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
    raw.creation.phase = "prepared";
    delete raw.savedRecipeId;
    raw.candidate = recipeInput({ name: "后来改过的候选" });
    await writeFile(path, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

    const restarted = await RecipeRepository.load(dir);
    const frozen = await restarted.readWorkshopDraft(draft.draftId);
    expect(frozen?.creation?.recipe.name).toBe("冻结名称");
    await expect(
      restarted.commitWorkshopDraft(draft.draftId, {
        baseRevision: frozen!.revision,
        creationKey: "different-key"
      })
    ).rejects.toThrow();
    expect(JSON.parse(await readFile(join(dir, "recipes", `${committed.recipe.id}.json`), "utf8")).name).toBe("冻结名称");
  });

  it("正式菜目标 ID 已存在且内容不同则拒绝覆盖", async () => {
    const dir = await makeDataDir();
    const first = await RecipeRepository.load(dir);
    const before = await readFile(join(dir, "recipes", "existing-dish.json"));
    const draft = await seedDraft(first);
    const path = await rawDraftPath(dir, draft.draftId);
    const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
    raw.creation = {
      key: "collision-key",
      recipeId: "existing-dish",
      recipe: { ...recipeInput(), id: "existing-dish" },
      recipeHash: "sha256:" + "0".repeat(64),
      phase: "prepared",
      images: []
    };
    await writeFile(path, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

    const restarted = await RecipeRepository.load(dir);
    const current = await restarted.readWorkshopDraft(draft.draftId);
    await expect(
      restarted.commitWorkshopDraft(draft.draftId, {
        baseRevision: current!.revision,
        creationKey: "collision-key"
      })
    ).rejects.toThrow();
    expect(await readFile(join(dir, "recipes", "existing-dish.json"))).toEqual(before);
    expect(restarted.get("existing-dish")?.name).toBe("已有菜");
  });

  it("图片准备失败时不出现正式菜谱文件；已有菜、history、user-state 字节保持不变", async () => {
    const dir = await makeDataDir();
    await mkdir(join(dir, "history", "existing-dish"), { recursive: true });
    await writeFile(join(dir, "history", "existing-dish", "preserved.json"), JSON.stringify({ marker: "history bytes" }));
    await writeFile(
      join(dir, "user-state.json"),
      JSON.stringify({ recipes: { "existing-dish": { likes: 3, favorite: true } }, kitchen: { tools: ["炒锅"] } })
    );
    const preserved = await snapshotFiles([
      join(dir, "recipes", "existing-dish.json"),
      join(dir, "history", "existing-dish", "preserved.json"),
      join(dir, "user-state.json")
    ]);

    const repository = await RecipeRepository.load(dir);
    let draft = await repository.createWorkshopDraft();
    const image = tinyPng();
    draft = await repository.addWorkshopSource(
      draft.draftId,
      {
        baseRevision: draft.revision,
        kind: "image",
        name: "confirmed-cover.png",
        mimeType: "image/png",
        dataBase64: image.toString("base64")
      },
      { bytes: image, mimeType: "image/png", normalized: image, width: 1, height: 1 }
    );
    const coverSource = draft.sources.find((source) => source.kind === "image")!;
    draft = await repository.updateWorkshopDraft(draft.draftId, {
      baseRevision: draft.revision,
      candidate: recipeInput(),
      reviewed: true,
      images: { coverSourceId: coverSource.id, stepSourceIds: [null, null] }
    });

    // 把正式图片根路径设为普通文件，令准备图片目录失败。
    await writeFile(join(dir, "images"), "block-image-directory");
    await expect(savePrepared(repository, draft, "image-failure-key")).rejects.toThrow();

    expect(await readdir(join(dir, "recipes"))).toEqual(["existing-dish.json"]);
    for (const [path, expected] of preserved) expect(sha256(await readFile(path))).toBe(expected);
    expect(repository.get("existing-dish")?.name).toBe("已有菜");
  });
});
