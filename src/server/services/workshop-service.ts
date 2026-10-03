import { randomBytes } from "node:crypto";

import type {
  WorkshopAnalysisResult, WorkshopCapabilities, WorkshopDraft, WorkshopDraftPatch,
  WorkshopLlmConfig, WorkshopMaterial, WorkshopServiceOptions, WorkshopSourceInput
} from "../../shared/types.js";
import { workshopAnalysisSchema } from "../lib/schema.js";
import { extractWorkshopLink, normalizeWorkshopUrl, parseWorkshopRecipeJson } from "../lib/source-extractor.js";
import { normalizeWorkshopImage } from "../lib/workshop-image.js";
import { analyzeWorkshopMaterials, loadWorkshopLlmConfig, WORKSHOP_PROMPT_VERSION, workshopLlmProblem } from "../lib/workshop-llm.js";
import { revisionOfBytes } from "../lib/recipe-revision.js";
import { WorkshopError } from "../lib/workshop-errors.js";
import type { RecipeRepository } from "./recipe-repository.js";

/** 不碰文件：编排有界任务，资产读写统一交给 repository。 */
export class WorkshopService {
  readonly #config: WorkshopLlmConfig | null;
  readonly #analyze: typeof analyzeWorkshopMaterials;
  readonly #extract: typeof extractWorkshopLink;
  readonly #controllers = new Map<string, AbortController>();
  readonly #queue: (() => Promise<void>)[] = [];
  readonly #running = new Set<Promise<void>>();
  #active = false;
  #closed = false;
  #imageChain: Promise<unknown> = Promise.resolve();
  #imageRequests = 0;

  constructor(readonly repository: RecipeRepository, options: WorkshopServiceOptions = {}) {
    this.#config = options.config !== undefined ? options.config : loadWorkshopLlmConfig();
    this.#analyze = options.analyze ?? analyzeWorkshopMaterials;
    this.#extract = options.extract ?? extractWorkshopLink;
  }

  capabilities(): WorkshopCapabilities {
    return {
      llmAvailable: Boolean(this.#config), llmProblem: this.#config ? null : workshopLlmProblem() ?? "尚未配置 DS，仍可手动录入或导入菜谱 JSON。",
      model: this.#config?.model ?? "deepseek-flash", imageTypes: ["image/jpeg", "image/png", "image/webp"],
      limits: { links: 5, images: 12, imageBytes: 10 * 1024 * 1024, totalSourceBytes: 30 * 1024 * 1024, textCharacters: 40000 },
      vocabulary: { tags: this.repository.tags().names, equipment: this.repository.equipment().tools }
    };
  }

  async getDraft(id: string): Promise<WorkshopDraft> {
    const draft = await this.repository.recoverWorkshopDraft(id);
    if (!draft) throw new WorkshopError(404, "draft_not_found", "没有找到这份草稿。");
    return draft;
  }

  async updateDraft(id: string, input: WorkshopDraftPatch): Promise<WorkshopDraft> {
    const draft = await this.repository.updateWorkshopDraft(id, input);
    this.#cancelOutdated(draft);
    return draft;
  }

  async addSource(id: string, input: WorkshopSourceInput): Promise<WorkshopDraft> {
    let draft: WorkshopDraft;
    if (input.kind === "image") {
      if (this.#imageRequests >= 3) throw new WorkshopError(429, "image_busy", "图片正在处理，请等当前图片完成后再添加。");
      const encoded = input.dataBase64 ?? "";
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw new WorkshopError(400, "invalid_image_encoding", "图片数据格式不正确，请重新选择文件。");
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.length > 10 * 1024 * 1024) throw new WorkshopError(413, "image_limit", "单张图片不能超过 10 MiB，请先压缩或拆图。");
      this.#imageRequests += 1;
      const run = this.#imageChain.then(async () => {
        const image = await normalizeWorkshopImage(bytes);
        return this.repository.addWorkshopSource(id, input, image);
      });
      this.#imageChain = run.catch(() => undefined);
      try { draft = await run; } finally { this.#imageRequests -= 1; }
    } else {
      const source = input.kind === "link" ? { ...input, url: normalizeWorkshopUrl(input.url ?? "") } : input;
      if (input.kind === "json") parseWorkshopRecipeJson(input.text ?? "");
      draft = await this.repository.addWorkshopSource(id, source);
    }
    this.#cancelOutdated(draft);
    return draft;
  }

  async analyze(id: string, baseRevision: string): Promise<WorkshopDraft> {
    if (this.#closed) throw new WorkshopError(503, "service_stopping", "服务正在重启，草稿已保留，请稍后重试。");
    const initial = await this.getDraft(id);
    if (initial.creation) throw new WorkshopError(409, "creation_frozen", "保存已开始，请先核实保存结果。", undefined, initial);
    if (initial.generation && ["queued", "extracting", "analyzing"].includes(initial.generation.state) && initial.generation.inputVersion === initial.inputVersion) return initial;
    if (this.#controllers.size >= 3) throw new WorkshopError(429, "workshop_busy", "当前整理任务较多，请稍后再试；草稿已保留。");
    const taskId = `task-${randomBytes(12).toString("hex")}`;
    const previous = structuredClone(initial);
    const draft = await this.repository.transformWorkshopDraft(id, current => {
      if (current.generation && ["queued", "extracting", "analyzing"].includes(current.generation.state) && current.generation.inputVersion === current.inputVersion) return false;
      if (current.revision !== baseRevision) throw new WorkshopError(409, "draft_revision_conflict", "草稿已更新，请重新载入后再整理。", undefined, current);
      if (!current.sources.some(s => s.selected) && !current.instructions.trim()) throw new WorkshopError(400, "no_material", "先添加材料，或直接手动填写菜谱。");
      current.reviewed = false;
      current.generation = { taskId, state: "queued", inputVersion: current.inputVersion, fingerprint: "", startedAt: new Date().toISOString(), model: this.#config?.model ?? "deterministic", promptVersion: WORKSHOP_PROMPT_VERSION };
    });
    if (draft.generation?.taskId !== taskId) return draft;
    const controller = new AbortController();
    this.#controllers.set(taskId, controller);
    this.#queue.push(async () => {
      try { await this.#run(id, draft.inputVersion, taskId, controller, previous); }
      finally { this.#controllers.delete(taskId); }
    });
    this.#drain();
    return draft;
  }

  async #run(id: string, inputVersion: number, taskId: string, controller: AbortController, previous: WorkshopDraft): Promise<void> {
    const change = (update: (draft: WorkshopDraft) => void): Promise<WorkshopDraft> => this.repository.transformWorkshopDraft(id, draft => {
      if (draft.inputVersion !== inputVersion || draft.generation?.taskId !== taskId || controller.signal.aborted) return false;
      update(draft);
    });
    try {
      let draft = await change(current => { current.generation!.state = "extracting"; });
      if (controller.signal.aborted || draft.inputVersion !== inputVersion || draft.generation?.taskId !== taskId) return;
      const materials: WorkshopMaterial[] = [];
      const deterministic: WorkshopAnalysisResult["candidates"] = [];
      let allStructured = true;
      for (const source of draft.sources.filter(s => s.selected)) {
        if (controller.signal.aborted) return;
        try {
          if (source.kind === "link") {
            const extracted = await this.#extract(source.url!, { signal: controller.signal });
            if (!extracted.text.trim() && !extracted.candidates?.length) throw new WorkshopError(422, "no_page_content", "没有读到完整做法，请补文字或截图后继续。");
            draft = await change(current => {
              const item = current.sources.find(s => s.id === source.id)!;
              item.text = extracted.text; item.name = extracted.title || item.name; item.url = extracted.url;
              if (extracted.author) item.author = extracted.author;
              item.status = "ready"; delete item.problem;
              item.sha256 = revisionOfBytes(Buffer.from(extracted.text));
            });
            const updated = draft.sources.find(s => s.id === source.id)!;
            materials.push({ source: updated, text: extracted.text });
            if (extracted.candidates?.length) deterministic.push(...extracted.candidates.map(candidate => ({
              ...candidate, evidence: candidate.evidence.map(evidence => ({ ...evidence, sourceIds: evidence.status === "source" ? [source.id] : evidence.sourceIds }))
            })));
            else allStructured = false;
          } else if (source.kind === "image") {
            const image = await this.repository.readWorkshopSource(id, source.id, true);
            materials.push({ source, image: { mimeType: "image/jpeg", base64: image.bytes.toString("base64") } });
            allStructured = false;
          } else {
            materials.push({ source, text: source.text });
            if (source.kind === "json") deterministic.push(...parseWorkshopRecipeJson(source.text!, source.id).candidates);
            else allStructured = false;
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          await change(current => {
            const item = current.sources.find(s => s.id === source.id)!;
            item.status = "error";
            item.problem = error instanceof WorkshopError ? error.message : "没有读到完整材料，请补文字或截图。";
          });
        }
      }
      if (!materials.length && !draft.instructions.trim()) throw new WorkshopError(400, "no_readable_material", "没有读到可整理的材料，请补文字或截图后再试。");
      if (materials.reduce((total, m) => total + (m.text?.length ?? 0), draft.instructions.length) > 40000) throw new WorkshopError(413, "text_limit", "可读正文合计超过 4 万字符，请拆分草稿；正文没有被截断保存。");
      if (materials.reduce((total, m) => total + (m.image ? Buffer.byteLength(m.image.base64, "base64") : 0), 0) > 16 * 1024 * 1024) throw new WorkshopError(413, "image_request_limit", "本次处理后图片超过 16 MiB，请减少图片或拆成草稿。");
      const fingerprint = revisionOfBytes(Buffer.from(JSON.stringify({
        materials: materials.map(m => [m.source.id, m.source.sha256]), instructions: draft.instructions,
        candidate: draft.hasUserEdits ? draft.candidate : {}, model: this.#config?.model ?? "deterministic", version: WORKSHOP_PROMPT_VERSION
      })));
      draft = await change(current => { current.generation!.state = "analyzing"; current.generation!.fingerprint = fingerprint; });
      if (controller.signal.aborted || draft.inputVersion !== inputVersion || draft.generation?.taskId !== taskId) return;
      let result: WorkshopAnalysisResult;
      if (allStructured && deterministic.length && !draft.instructions.trim()) {
        result = { candidates: deterministic.map((candidate, index) => ({ ...candidate, key: `candidate-${index + 1}` })), explanation: "已读取结构化菜谱，无需调用模型。" };
        await change(current => { current.generation!.model = "deterministic"; });
      } else if (previous.generation?.state === "complete" && previous.generation.fingerprint === fingerprint && previous.analysis) {
        result = previous.analysis;
        result = { ...result, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
      } else {
        if (!this.#config) throw new WorkshopError(503, "llm_unavailable", "DS 尚未配置，材料已保留；可手动填写或导入菜谱 JSON。");
        const meta = this.repository.meta();
        result = await this.#analyze({ materials, instructions: draft.instructions, currentCandidate: draft.candidate, allowedTools: meta.equipment, allowedTags: this.repository.tags().names }, this.#config, { signal: controller.signal });
      }
      const validated = workshopAnalysisSchema.safeParse(result);
      if (!validated.success) throw new WorkshopError(503, "invalid_analysis", "整理结果没有通过结构检查，原材料已保留。");
      await change(current => {
        const outcome = validated.data;
        current.analysis = outcome;
        if (current.hasUserEdits) current.suggestion = outcome;
        else {
          current.alternatives = outcome.candidates.length > 1 ? outcome.candidates : [];
          current.candidate = outcome.candidates.length === 1 ? outcome.candidates[0].recipe : {};
          current.evidence = outcome.candidates.length === 1 ? outcome.candidates[0].evidence : [];
          current.unresolved = outcome.candidates.length === 1 ? outcome.candidates[0].unresolved : [{ field: "candidate", message: "材料包含多道菜，请先选择一道。" }];
          delete current.suggestion;
        }
        current.reviewed = false;
        current.generation!.state = "complete";
        current.generation!.finishedAt = new Date().toISOString();
        current.generation!.usage = outcome.usage;
      });
    } catch (error) {
      await this.repository.transformWorkshopDraft(id, current => {
        if (current.inputVersion !== inputVersion || current.generation?.taskId !== taskId) return false;
        current.generation.state = controller.signal.aborted ? "interrupted" : "failed";
        current.generation.finishedAt = new Date().toISOString();
        current.generation.problem = controller.signal.aborted ? "整理已中断，原材料已保留。" : error instanceof WorkshopError ? error.message : "整理暂时失败，原材料已保留，可重试或手动继续。";
      }).catch(() => undefined);
    }
  }

  #cancelOutdated(draft: WorkshopDraft): void {
    if (draft.generation?.state === "interrupted") this.#controllers.get(draft.generation.taskId)?.abort();
  }

  #drain(): void {
    if (this.#active) return;
    const job = this.#queue.shift();
    if (!job) return;
    this.#active = true;
    const run = job().finally(() => { this.#active = false; this.#running.delete(run); this.#drain(); });
    this.#running.add(run);
  }

  async close(): Promise<void> {
    this.#closed = true;
    for (const controller of this.#controllers.values()) controller.abort();
    await Promise.allSettled([...this.#running]);
  }
}
