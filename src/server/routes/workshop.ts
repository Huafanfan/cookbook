import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { formatIssueList, workshopAnalyzeInputSchema, workshopCommitInputSchema, workshopDraftPatchSchema, workshopSourceInputSchema } from "../lib/schema.js";
import { WorkshopError } from "../lib/workshop-errors.js";
import { WorkshopService } from "../services/workshop-service.js";
import type { RecipeRepository } from "../services/recipe-repository.js";

/** 与现有 LAN 写入口相同信任边界；回环开发特例只对回环 Host 开放。 */
function isSameOrigin(request: FastifyRequest): boolean {
  const site = request.headers["sec-fetch-site"];
  if (typeof site === "string" && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (typeof origin !== "string" || !host) return true;
  try {
    const supplied = new URL(origin);
    const actual = new URL(`http://${host}`);
    if (supplied.host === actual.host) return true;
    const loopback = (name: string): boolean => ["localhost", "127.0.0.1", "[::1]"].includes(name);
    return loopback(supplied.hostname) && loopback(actual.hostname);
  } catch { return false; }
}

async function guardWrite(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!isSameOrigin(request)) {
    await reply.code(403).send({ error: "cross_origin", message: "工坊写入只接受同源请求。" });
    return;
  }
  if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    await reply.code(415).send({ error: "json_required", message: "请求需要使用 JSON 格式。" });
  }
}

function report(error: unknown, request: FastifyRequest, reply: FastifyReply): unknown {
  if (error instanceof WorkshopError) return reply.code(error.statusCode).send({
    error: error.code, message: error.message,
    ...(error.issues ? { issues: error.issues } : {}),
    ...(error.current ? { current: error.current, currentRevision: error.current.revision } : {})
  });
  request.log.warn({ operation: "workshop", cause: error instanceof Error ? error.name : "unknown" }, "工坊操作暂时不可用");
  return reply.code(503).send({ error: "workshop_unavailable", message: "工坊暂时无法完成此操作，已接收的材料和原有菜谱会保留。" });
}

export function registerWorkshopRoutes(app: FastifyInstance, repository: RecipeRepository, service: WorkshopService): void {
  app.get("/api/workshop/capabilities", async () => service.capabilities());
  app.get("/api/workshop/drafts", async (request, reply) => {
    try { return { items: await repository.listWorkshopDrafts() }; }
    catch (error) { return report(error, request, reply); }
  });
  app.post("/api/workshop/drafts", { bodyLimit: 4096, onRequest: guardWrite }, async (request, reply) => {
    try { return await repository.createWorkshopDraft(); }
    catch (error) { return report(error, request, reply); }
  });
  app.get<{ Params: { id: string } }>("/api/workshop/drafts/:id", async (request, reply) => {
    try { return await service.getDraft(request.params.id); }
    catch (error) { return report(error, request, reply); }
  });
  app.put<{ Params: { id: string }; Body: unknown }>("/api/workshop/drafts/:id", { bodyLimit: 256 * 1024, onRequest: guardWrite }, async (request, reply) => {
    try {
      const parsed = workshopDraftPatchSchema.safeParse(request.body);
      if (!parsed.success) throw new WorkshopError(400, "invalid_draft", "请检查草稿内容。", formatIssueList(parsed.error));
      return await service.updateDraft(request.params.id, parsed.data);
    } catch (error) { return report(error, request, reply); }
  });
  app.post<{ Params: { id: string }; Body: unknown }>("/api/workshop/drafts/:id/sources", { bodyLimit: 16 * 1024 * 1024, onRequest: guardWrite }, async (request, reply) => {
    try {
      const parsed = workshopSourceInputSchema.safeParse(request.body);
      if (!parsed.success) throw new WorkshopError(400, "invalid_source", "请检查材料格式。", formatIssueList(parsed.error));
      return await service.addSource(request.params.id, parsed.data);
    } catch (error) { return report(error, request, reply); }
  });
  app.post<{ Params: { id: string }; Body: unknown }>("/api/workshop/drafts/:id/analyze", { bodyLimit: 4096, onRequest: guardWrite }, async (request, reply) => {
    try {
      const parsed = workshopAnalyzeInputSchema.safeParse(request.body);
      if (!parsed.success) throw new WorkshopError(400, "invalid_analysis_request", "请重新载入草稿后整理。");
      return reply.code(202).send(await service.analyze(request.params.id, parsed.data.baseRevision));
    } catch (error) { return report(error, request, reply); }
  });
  app.post<{ Params: { id: string }; Body: unknown }>("/api/workshop/drafts/:id/commit", { bodyLimit: 4096, onRequest: guardWrite }, async (request, reply) => {
    try {
      const parsed = workshopCommitInputSchema.safeParse(request.body);
      if (!parsed.success) throw new WorkshopError(400, "invalid_commit", "请先核对草稿，再确认保存。");
      return await repository.commitWorkshopDraft(request.params.id, parsed.data);
    } catch (error) { return report(error, request, reply); }
  });
  app.get<{ Params: { id: string; sourceId: string } }>("/api/workshop/drafts/:id/sources/:sourceId", async (request, reply) => {
    try {
      const source = await repository.readWorkshopSource(request.params.id, request.params.sourceId);
      return reply.header("x-content-type-options", "nosniff").header("content-security-policy", "default-src 'none'; sandbox").type(source.mimeType).send(source.bytes);
    } catch (error) { return report(error, request, reply); }
  });
}
