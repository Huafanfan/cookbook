import { useEffect, useRef, useState } from "react";

import type {
  WorkshopCapabilities,
  WorkshopDraft,
  WorkshopDraftSummary,
  WorkshopEvidence,
  WorkshopRecipeInput,
  WorkshopSource,
  WorkshopSourceInput,
  WorkshopTaskState,
  WorkshopMobileView,
  WorkshopSaveState as SaveState,
  WorkshopSourceDraftInput
} from "../../shared/types";
import { WorkshopRecipeForm } from "../components/WorkshopRecipeForm";
import "../styles/workshop.css";
import {
  addWorkshopSource,
  analyzeWorkshopDraft,
  ApiError,
  commitWorkshopDraft,
  createWorkshopDraft,
  fetchWorkshopCapabilities,
  fetchWorkshopDraft,
  fetchWorkshopDrafts,
  updateWorkshopDraft,
  workshopSourceUrl
} from "../lib/api";
import { navigate } from "../lib/router";
import { useMeta } from "../lib/use-meta";

const taskLabels: Record<WorkshopTaskState | "collecting" | "saved", string> = {
  queued: "正在排队",
  extracting: "正在读取材料",
  analyzing: "正在整理",
  complete: "整理完成",
  failed: "整理没有完成",
  interrupted: "整理中断，可稍后重试",
  collecting: "继续收集材料",
  saved: "已保存"
};

const evidenceText: Record<WorkshopEvidence["status"], string> = {
  source: "来自材料",
  user: "你补充的",
  suggested: "整理建议",
  unknown: "还不知道"
};

function isWorkshopDraft(value: unknown): value is WorkshopDraft {
  return typeof value === "object" && value !== null &&
    "draftId" in value && "revision" in value && "candidate" in value;
}

function currentFromError(error: ApiError): WorkshopDraft | null {
  if (isWorkshopDraft(error.payload)) return error.payload;
  if (typeof error.payload === "object" && error.payload !== null && "current" in error.payload) {
    const current = (error.payload as { current?: unknown }).current;
    if (isWorkshopDraft(current)) return current;
  }
  if (typeof error.payload === "object" && error.payload !== null && "draft" in error.payload) {
    const current = (error.payload as { draft?: unknown }).draft;
    if (isWorkshopDraft(current)) return current;
  }
  return null;
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    const payload = error.payload as { error?: unknown; message?: unknown; issues?: unknown } | null;
    const issues = Array.isArray(payload?.issues) ? payload.issues.filter((item): item is string => typeof item === "string").map(item => {
      const split = item.indexOf(":");
      return split > 0 ? `${fieldLabel(item.slice(0, split))}：${item.slice(split + 1).trim()}` : item;
    }) : [];
    const detail = [typeof payload?.message === "string" ? payload.message : "", ...issues].filter(Boolean).join("；");
    if (error.status === 413) return detail || "这份材料太大，请缩小文件或拆成几份后再添加。";
    if (error.status === 415) return detail || "暂不支持这个文件格式，请使用 JPG、PNG、WebP、TXT、MD 或 JSON。";
    if (error.status === 503) return detail || "整理服务暂时不可用，可以继续手动录入。";
    return detail || error.message;
  }
  return error instanceof Error ? error.message : "操作没有完成，请稍后重试。";
}

function fieldLabel(field: string): string {
  const normalized = field.replace(/^(?:recipe|candidate)\./, "").replace(/\[(\d+)\]/g, ".$1");
  const labels: Record<string, string> = { recipe: "菜谱内容", candidate: "菜谱选择", name: "菜名", category: "分类", difficulty: "难度", servings: "份量", summary: "介绍", prepMinutes: "准备时间", cookMinutes: "总烹饪时间", ingredients: "食材", steps: "做法", tips: "小贴士", tags: "标签", equipment: "厨具", equipmentAlternatives: "替代厨具", source: "来源", materials: "原材料" };
  const parts = normalized.split(".");
  if ((parts[0] === "ingredients" || parts[0] === "steps") && /^\d+$/.test(parts[1] ?? "")) {
    const detail: Record<string, string> = { name: "名称", amount: "用量", unit: "单位", group: "分组", note: "处理说明", text: "操作", title: "小标题", minutes: "计时时长", heat: "火候", tip: "提醒" };
    return `第 ${Number(parts[1]) + 1} ${parts[0] === "ingredients" ? "项食材" : "步"}${parts[2] ? `的${detail[parts[2]] ?? "内容"}` : ""}`;
  }
  return labels[parts[0]] ?? "待核对的信息";
}

function isActiveTask(state: WorkshopTaskState | undefined): boolean {
  return state === "queued" || state === "extracting" || state === "analyzing";
}

function sameRecipe(left: WorkshopRecipeInput, right: WorkshopRecipeInput): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function makeCreationKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `workshop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sourceOrder(draft: WorkshopDraft): string[] {
  return draft.sources.map((source) => source.id);
}

function patchFor(draft: WorkshopDraft): {
  baseRevision: string;
  candidate: WorkshopRecipeInput;
  instructions: string;
  reviewed: boolean;
  sources: { id: string; selected: boolean }[];
  sourceOrder: string[];
  images: WorkshopDraft["images"];
} {
  return {
    baseRevision: draft.revision,
    candidate: draft.candidate,
    instructions: draft.instructions,
    reviewed: draft.reviewed,
    sources: draft.sources.map(({ id, selected }) => ({ id, selected })),
    sourceOrder: sourceOrder(draft),
    images: draft.images
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function imageMime(file: File): "image/jpeg" | "image/png" | "image/webp" | null {
  const normalized = file.type.toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/png" || normalized === "image/webp") {
    return normalized;
  }
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}

function sourceInputFromFile(file: File, limits: WorkshopCapabilities["limits"]): Promise<WorkshopSourceDraftInput> {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "heic" || extension === "heif") {
    return Promise.reject(new Error("暂不支持 HEIC 照片，请在相册中转为 JPEG 后再添加。"));
  }
  if (extension === "gif" || file.type === "image/gif") {
    return Promise.reject(new Error("暂不支持 GIF，请导出为 JPG、PNG 或 WebP 后再添加。"));
  }
  const mimeType = imageMime(file);
  if (mimeType) {
    if (file.size > limits.imageBytes) {
      return Promise.reject(new Error(`图片超过 ${Math.ceil(limits.imageBytes / 1024 / 1024)} MB 上限，请压缩或拆图后再试。`));
    }
    return file.arrayBuffer().then((buffer) => ({
      kind: "image",
      name: file.name,
      mimeType,
      dataBase64: bytesToBase64(new Uint8Array(buffer))
    }));
  }

  if (extension === "txt" || extension === "md" || extension === "markdown") {
    if (file.size > limits.totalSourceBytes) {
      return Promise.reject(new Error("文字文件超过本草稿素材总容量，请拆成较小的文件后再添加。"));
    }
    return file.text().then((text) => ({ kind: "text", name: file.name, text }));
  }

  if (extension === "json") {
    if (file.size > limits.totalSourceBytes) {
      return Promise.reject(new Error("菜谱文件超过本草稿素材总容量，请拆成较小的文件后再添加。"));
    }
    return file.text().then((text) => ({ kind: "json", name: file.name, text }));
  }

  return Promise.reject(new Error(`“${file.name}”格式暂不支持。请添加 JPG、PNG、WebP、TXT、MD 或 JSON。`));
}

export function WorkshopPage({ draftId }: { draftId?: string }): React.JSX.Element {
  const { meta } = useMeta();
  const [capabilities, setCapabilities] = useState<WorkshopCapabilities | null>(null);
  const formMeta = meta && capabilities?.vocabulary ? { ...meta, tags: capabilities.vocabulary.tags, equipment: capabilities.vocabulary.equipment } : meta;
  const [summaries, setSummaries] = useState<WorkshopDraftSummary[]>([]);
  const [indexLoading, setIndexLoading] = useState(!draftId);
  const [draft, setDraft] = useState<WorkshopDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(Boolean(draftId));
  const [indexError, setIndexError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [busyCreating, setBusyCreating] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [conflictDraft, setConflictDraft] = useState<WorkshopDraft | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [editVersion, setEditVersion] = useState(0);
  const [userEditedFields, setUserEditedFields] = useState<string[]>([]);
  const [mobileView, setMobileView] = useState<WorkshopMobileView>("sources");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<WorkshopDraft | null>(null);
  const serverDraftRef = useRef<WorkshopDraft | null>(null);
  const editVersionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const saveBlockedRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const busyRef = useRef(false);
  const analyzePendingRef = useRef(false);
  const commitPendingRef = useRef(false);
  const createPendingRef = useRef(false);
  const creationKeyRef = useRef<string | null>(null);
  const currentDraftIdRef = useRef(draftId);
  const activeOperationRef = useRef(0);
  currentDraftIdRef.current = draftId;

  const setCurrentDraft = (next: WorkshopDraft): void => {
    if (currentDraftIdRef.current !== next.draftId) return;
    serverDraftRef.current = next;
    draftRef.current = next;
    if (next.creation?.key) creationKeyRef.current = next.creation.key;
    setDraft(next);
  };

  const loadDraft = async (id: string, signal?: AbortSignal): Promise<void> => {
    setDraftLoading(true);
    setDraftError(null);
    try {
      const loaded = await fetchWorkshopDraft(id, signal);
      if (signal?.aborted || currentDraftIdRef.current !== id) return;
      serverDraftRef.current = loaded;
      draftRef.current = loaded;
      creationKeyRef.current = loaded.creation?.key ?? null;
      editVersionRef.current = 0;
      savedVersionRef.current = 0;
      setEditVersion(0);
      setUserEditedFields([]);
      setMobileView(loaded.analysis || loaded.generation?.state === "complete" ? "recipe" : "sources");
      saveBlockedRef.current = false;
      setConflictOpen(false);
      setConflictDraft(null);
      setDraft(loaded);
    } catch (error) {
      if (!signal?.aborted) setDraftError(errorText(error));
    } finally {
      if (!signal?.aborted) setDraftLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchWorkshopCapabilities(controller.signal)
      .then(setCapabilities)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setIndexError((previous) => previous ?? errorText(error));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (draftId) return;
    const controller = new AbortController();
    setIndexLoading(true);
    setIndexError(null);
    fetchWorkshopDrafts(controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      setSummaries(response.items);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setIndexError((previous) => previous ?? errorText(error));
    }).finally(() => {
      if (!controller.signal.aborted) setIndexLoading(false);
    });
    return () => controller.abort();
  }, [draftId]);

  useEffect(() => {
    currentDraftIdRef.current = draftId;
    activeOperationRef.current += 1;
    busyRef.current = false;
    analyzePendingRef.current = false;
    commitPendingRef.current = false;
    draftRef.current = null;
    serverDraftRef.current = null;
    creationKeyRef.current = null;
    editVersionRef.current = 0;
    savedVersionRef.current = 0;
    saveBlockedRef.current = false;
    setEditVersion(0);
    setUserEditedFields([]);
    setMobileView("sources");
    setBusyAction(null);
    setActionError(null);
    setSaveState("saved");
    setSaveHint(null);
    setConflictOpen(false);
    setConflictDraft(null);
    setNotice(null);
    setSourceUrl("");
    setSourceText("");
    setDraftError(null);
    setDraftLoading(Boolean(draftId));
    setDraft(null);
    if (!draftId) return;
    const controller = new AbortController();
    void loadDraft(draftId, controller.signal);
    return () => controller.abort();
  }, [draftId]);

  const dirty = Boolean(draft && editVersion !== savedVersionRef.current);

  const changeLocal = (update: (current: WorkshopDraft) => WorkshopDraft): void => {
    const current = draftRef.current;
    if (!current || busyRef.current || isActiveTask(current.generation?.state) || current.creation) return;
    const next = update(current);
    draftRef.current = next;
    setDraft(next);
    editVersionRef.current += 1;
    setEditVersion(editVersionRef.current);
    setSaveState("dirty");
    setSaveHint(null);
    setNotice(null);
  };

  const saveLatest = (): Promise<void> => {
    const id = draftId;
    if (!id || currentDraftIdRef.current !== id || draftRef.current?.draftId !== id || saveBlockedRef.current) return Promise.resolve();
    const operation = saveChainRef.current.catch(() => undefined).then(async () => {
      const current = draftRef.current;
      const server = serverDraftRef.current;
      if (currentDraftIdRef.current !== id || current?.draftId !== id || !current || !server || editVersionRef.current <= savedVersionRef.current) return;
      const version = editVersionRef.current;
      setSaveState("saving");
      try {
        const saved = await updateWorkshopDraft(id, {
          ...patchFor(current),
          baseRevision: server.revision
        });
        if (currentDraftIdRef.current !== id || draftRef.current?.draftId !== id) return;
        serverDraftRef.current = saved;
        savedVersionRef.current = version;
        const local = draftRef.current;
        if (local) {
          const merged = { ...local, revision: saved.revision, inputVersion: saved.inputVersion, updatedAt: saved.updatedAt };
          draftRef.current = merged;
          setDraft(merged);
        }
        setSaveState(editVersionRef.current > version ? "dirty" : "saved");
        setSaveHint(null);
      } catch (error) {
        if (currentDraftIdRef.current !== id || draftRef.current?.draftId !== id) return;
        if (error instanceof ApiError && error.status === 409) {
          saveBlockedRef.current = true;
          setSaveState("failed");
          setConflictOpen(true);
          setConflictDraft(currentFromError(error));
          setSaveHint("另一台设备已经更新了这份草稿。当前页面的内容还在，请先查看或重新加载服务器版本。" );
          if (!currentFromError(error)) {
            void fetchWorkshopDraft(id).then((current) => {
              if (currentDraftIdRef.current === id) setConflictDraft(current);
            }).catch(() => undefined);
          }
        } else {
          setSaveState("failed");
          setSaveHint(errorText(error));
        }
        throw error;
      }
    });
    saveChainRef.current = operation;
    return operation;
  };

  const flushEdits = async (): Promise<void> => {
    const id = draftId;
    if (saveBlockedRef.current) throw new Error("草稿版本冲突尚未处理，请先重新加载服务器版本。" );
    while (id && currentDraftIdRef.current === id && editVersionRef.current > savedVersionRef.current) {
      await saveLatest();
    }
  };

  useEffect(() => {
    if (!draftId || !draft || !dirty || busyAction || conflictOpen) return;
    const timer = window.setTimeout(() => {
      void saveLatest().catch(() => undefined);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draftId, draft, dirty, busyAction, conflictOpen]);

  useEffect(() => {
    if (!draftId || !draft?.generation || !isActiveTask(draft.generation.state)) return;
    let stopped = false;
    let timer = 0;
    let delay = 1200;
    const poll = async (): Promise<void> => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      try {
        const remote = await fetchWorkshopDraft(draftId, controller.signal);
        if (stopped || currentDraftIdRef.current !== draftId) return;
        serverDraftRef.current = remote;
        const local = draftRef.current;
        const localChanges = editVersionRef.current > savedVersionRef.current;
        const merged = localChanges && local ? {
          ...remote,
          candidate: local.candidate,
          instructions: local.instructions,
          reviewed: local.reviewed,
          sources: local.sources,
          images: local.images
        } : remote;
        if (!localChanges) setUserEditedFields([]);
        draftRef.current = merged;
        setDraft(merged);
        if (isActiveTask(remote.generation?.state)) {
          delay = Math.min(4000, delay + 700);
          timer = window.setTimeout(() => void poll(), delay);
        }
      } catch {
        if (!stopped) {
          delay = Math.min(4000, delay + 1000);
          timer = window.setTimeout(() => void poll(), delay);
        }
      } finally {
        window.clearTimeout(timeout);
      }
    };
    timer = window.setTimeout(() => void poll(), delay);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [draftId, draft?.generation?.taskId, draft?.generation?.state]);

  const createDraft = async (): Promise<void> => {
    if (createPendingRef.current) return;
    createPendingRef.current = true;
    setBusyCreating(true);
    setIndexError(null);
    try {
      const created = await createWorkshopDraft();
      navigate(`/workshop/${encodeURIComponent(created.draftId)}`);
    } catch (error) {
      setIndexError(errorText(error));
    } finally {
      createPendingRef.current = false;
      setBusyCreating(false);
    }
  };

  const lockAction = async (label: string, action: (latest: WorkshopDraft) => Promise<void>): Promise<void> => {
    if (busyRef.current) return;
    const actionDraftId = draftId;
    const operation = ++activeOperationRef.current;
    busyRef.current = true;
    setBusyAction(label);
    setActionError(null);
    try {
      await flushEdits();
      if (!actionDraftId || currentDraftIdRef.current !== actionDraftId) return;
      const latest = serverDraftRef.current;
      if (!latest) throw new Error("草稿尚未载入。");
      await action(latest);
    } catch (error) {
      if (currentDraftIdRef.current !== actionDraftId) return;
      if (error instanceof ApiError && error.status === 409) {
        saveBlockedRef.current = true;
        setConflictOpen(true);
        setConflictDraft(currentFromError(error));
        setSaveHint("另一台设备已经更新了这份草稿。请查看服务器版本或重新加载。" );
        if (draftId && !currentFromError(error)) {
          const id = draftId;
          void fetchWorkshopDraft(id).then((current) => {
            if (currentDraftIdRef.current === id) setConflictDraft(current);
          }).catch(() => undefined);
        }
      } else {
        setActionError(errorText(error));
      }
    } finally {
      if (activeOperationRef.current === operation) {
        busyRef.current = false;
        setBusyAction(null);
      }
    }
  };

  const addInput = async (input: WorkshopSourceDraftInput): Promise<boolean> => {
    if (!draftId) return false;
    let added = false;
    await lockAction("正在添加材料", async (latest) => {
      if (!capabilities) throw new Error("输入上限还没有载入，请刷新后再添加。" );
      if (input.kind === "link" && latest.sources.filter((source) => source.kind === "link").length >= capabilities.limits.links) {
        throw new Error(`一份草稿最多添加 ${capabilities.limits.links} 个链接。`);
      }
      if (input.kind === "image") {
        if (latest.sources.filter((source) => source.kind === "image").length >= capabilities.limits.images) {
          throw new Error(`一份草稿最多添加 ${capabilities.limits.images} 张图片。`);
        }
      }
      const estimatedBytes = input.kind === "image" ? Math.floor((input.dataBase64?.length ?? 0) * 0.75)
        : new TextEncoder().encode(input.text ?? input.url ?? "").byteLength;
      const usedBytes = latest.sources.reduce((total, source) => total + source.byteSize, 0);
      if (usedBytes + estimatedBytes > capabilities.limits.totalSourceBytes) {
        throw new Error("材料总量超过本草稿上限，请分几次整理或缩小图片后再添加。" );
      }
      const textLength = latest.sources.reduce((total, source) => total + (source.text?.length ?? 0), 0) + (input.text?.length ?? 0);
      if (textLength > capabilities.limits.textCharacters) {
        throw new Error("文字材料超过本草稿字数上限，请删减无关内容后再添加。" );
      }
      const saved = await addWorkshopSource(draftId, { ...input, baseRevision: latest.revision });
      if (currentDraftIdRef.current !== draftId) return;
      setCurrentDraft(saved);
      savedVersionRef.current = editVersionRef.current;
      setSaveState("saved");
      setNotice("材料已加入这份草稿。你还可以继续添加其他来源。" );
      added = true;
    });
    return added;
  };

  const addFiles = async (files: FileList | File[]): Promise<void> => {
    const selected = Array.from(files);
    if (selected.length === 0) return;
    if (!capabilities) {
      setActionError("输入上限还没有载入，请刷新后再添加。" );
      return;
    }
    if (draftId) {
      await lockAction("正在添加材料", async (latest) => {
        let working = latest;
        const problems: string[] = [];
        for (const file of selected) {
          if (currentDraftIdRef.current !== draftId) return;
          try {
            const input = await sourceInputFromFile(file, capabilities.limits);
            const usedBytes = working.sources.reduce((total, source) => total + source.byteSize, 0);
            const nextSize = input.kind === "image" ? Math.floor((input.dataBase64?.length ?? 0) * 0.75)
              : new TextEncoder().encode(input.text ?? "").byteLength;
            if (usedBytes + nextSize > capabilities.limits.totalSourceBytes) {
              throw new Error("材料总量超过本草稿上限，请减少文件数量或缩小图片后再添加。" );
            }
            const textLength = working.sources.reduce((total, source) => total + (source.text?.length ?? 0), 0) + (input.text?.length ?? 0);
            if (textLength > capabilities.limits.textCharacters) {
              throw new Error("文字材料超过本草稿字数上限，请删减无关内容后再添加。" );
            }
            if (input.kind === "image" && working.sources.filter((source) => source.kind === "image").length >= capabilities.limits.images) {
              throw new Error(`一份草稿最多添加 ${capabilities.limits.images} 张图片。`);
            }
            const next = await addWorkshopSource(draftId, { ...input, baseRevision: working.revision });
            if (currentDraftIdRef.current !== draftId) return;
            working = next;
            setCurrentDraft(next);
          } catch (error) {
            problems.push(`${file.name}：${errorText(error)}`);
            if (error instanceof ApiError && error.status === 409) throw error;
          }
        }
        savedVersionRef.current = editVersionRef.current;
        setSaveState("saved");
        if (problems.length) setActionError(problems.join("\n"));
        else setNotice(`${selected.length} 份材料已加入草稿。长图文字较小时，建议先拆成几张清晰的图片。`);
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const addLink = async (): Promise<void> => {
    const value = sourceUrl.trim();
    if (!value) return;
    let parsed: URL;
    try {
      parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch {
      setActionError("请输入完整的网页链接，例如 https://example.com/recipe。" );
      return;
    }
    if (await addInput({ kind: "link", url: parsed.toString(), name: parsed.hostname })) setSourceUrl("");
  };

  const addText = async (): Promise<void> => {
    if (!sourceText.trim()) return;
    const text = sourceText.trim();
    if (capabilities && text.length > capabilities.limits.textCharacters) {
      setActionError(`文字超过 ${capabilities.limits.textCharacters.toLocaleString()} 字，请分几段添加。`);
      return;
    }
    if (await addInput({ kind: "text", name: "补充文字", text })) setSourceText("");
  };

  const handleCandidateChange = (candidate: WorkshopRecipeInput, stepSourceIds?: (string | null)[]): void => {
    const current = draftRef.current;
    if (!current) return;
    const nextSteps = candidate.steps ?? [];
    const currentImages = current.images.stepSourceIds;
    const alignedImages = stepSourceIds ?? nextSteps.map((_, index) => currentImages[index] ?? null);
    const changedFields = new Set(userEditedFields);
    const fields = new Set([...Object.keys(current.candidate), ...Object.keys(candidate)]);
    for (const field of fields) {
      if (JSON.stringify(current.candidate[field as keyof WorkshopRecipeInput]) !== JSON.stringify(candidate[field as keyof WorkshopRecipeInput])) {
        changedFields.add(field);
      }
    }
    setUserEditedFields([...changedFields]);
    const chosen = [...current.alternatives, ...(current.suggestion?.candidates ?? [])]
      .find((item) => sameRecipe(item.recipe, candidate));
    changeLocal((previous) => ({
      ...previous,
      candidate,
      evidence: chosen?.evidence ?? previous.evidence,
      unresolved: chosen?.unresolved ?? previous.unresolved,
      images: { ...previous.images, stepSourceIds: alignedImages.slice(0, nextSteps.length) },
      reviewed: false,
      hasUserEdits: true
    }));
  };

  const applyAlternative = (recipe: WorkshopRecipeInput): void => {
    const item = [...(draftRef.current?.alternatives ?? []), ...(draftRef.current?.suggestion?.candidates ?? [])]
      .find((candidate) => sameRecipe(candidate.recipe, recipe));
    const nextImages = (recipe.steps ?? []).map((_, index) => draftRef.current?.images.stepSourceIds[index] ?? null);
    setUserEditedFields([]);
    changeLocal((current) => ({
      ...current,
      candidate: recipe,
      evidence: item?.evidence ?? current.evidence,
      unresolved: item?.unresolved ?? current.unresolved,
      images: { ...current.images, stepSourceIds: nextImages },
      reviewed: false,
      hasUserEdits: true
    }));
  };

  const changeSourceSelection = (id: string, selected: boolean): void => {
    changeLocal((current) => ({
      ...current,
      sources: current.sources.map((source) => source.id === id ? { ...source, selected } : source),
      images: selected ? current.images : {
        coverSourceId: current.images.coverSourceId === id ? undefined : current.images.coverSourceId,
        stepSourceIds: current.images.stepSourceIds.map((sourceId) => sourceId === id ? null : sourceId)
      },
      reviewed: false
    }));
  };

  const moveSource = (index: number, delta: -1 | 1): void => {
    const current = draftRef.current;
    if (!current) return;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= current.sources.length) return;
    const sources = [...current.sources];
    [sources[index], sources[nextIndex]] = [sources[nextIndex], sources[index]];
    changeLocal((latest) => ({ ...latest, sources, reviewed: false }));
  };

  const analyze = async (): Promise<void> => {
    if (!draftId || analyzePendingRef.current) return;
    analyzePendingRef.current = true;
    await lockAction("正在开始整理", async (latest) => {
      if (!latest.sources.some((source) => source.selected)) {
        throw new Error("先添加并勾选至少一份材料，或直接手动填写菜谱。" );
      }
      const hasJson = latest.sources.some((source) => source.selected && source.kind === "json");
      if (!capabilities?.llmAvailable && !hasJson) {
        throw new Error(capabilities?.llmProblem || "整理服务暂不可用，可以继续手动填写菜谱。" );
      }
      try {
        const started = await analyzeWorkshopDraft(draftId, latest.revision);
        if (currentDraftIdRef.current !== draftId) return;
        setCurrentDraft(started);
        setNotice("已开始整理。离开页面后任务仍会继续，回来后可以查看结果。" );
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) throw error;
        // 回应丢失时请求可能已被服务端接收，先核实已有任务再决定重试。
        const current = await fetchWorkshopDraft(draftId).catch(() => null);
        if (currentDraftIdRef.current !== draftId) return;
        if (current?.generation && isActiveTask(current.generation.state)) {
          setCurrentDraft(current);
          setNotice("整理任务已经开始，正在跟进结果。" );
          return;
        }
        throw error;
      }
    });
    analyzePendingRef.current = false;
  };

  const missingFields = (current: WorkshopDraft): string[] => {
    const recipe = current.candidate;
    const missing: string[] = [];
    if (!recipe.name?.trim()) missing.push("菜名");
    if (!recipe.category?.trim()) missing.push("分类");
    if (![1, 2, 3].includes(recipe.difficulty ?? -1)) missing.push("难度");
    if (typeof recipe.servings !== "number" || !Number.isFinite(recipe.servings) || recipe.servings <= 0) missing.push("份量");
    if (!recipe.ingredients?.length) missing.push("至少一项食材");
    else if (recipe.ingredients.some((ingredient) => !ingredient.name.trim())) missing.push("食材名称");
    if (!recipe.steps?.length) missing.push("至少一个步骤");
    else if (recipe.steps.some((step) => !step.text.trim())) missing.push("步骤内容");
    if ([recipe.prepMinutes, recipe.cookMinutes, ...(recipe.steps ?? []).map((step) => step.minutes)]
      .some((value) => typeof value === "number" && (!Number.isFinite(value) || value < 0))) missing.push("有效的时间");
    return missing;
  };

  const commit = async (): Promise<void> => {
    if (!draftId || commitPendingRef.current) return;
    const current = draftRef.current;
    if (!current) return;
    const missing = missingFields(current);
    if (missing.length) {
      setActionError(`保存前请补齐：${missing.join("、")}`);
      return;
    }
    if (!current.reviewed) {
      setActionError("请先确认已经核对材料、待确认项和配图。" );
      return;
    }
    commitPendingRef.current = true;
    await lockAction("正在保存新菜", async (latest) => {
      if (latest.savedRecipeId) {
        navigate(`/recipe/${encodeURIComponent(latest.savedRecipeId)}`);
        return;
      }
      if (!creationKeyRef.current) creationKeyRef.current = latest.creation?.key ?? makeCreationKey();
      try {
        const result = await commitWorkshopDraft(draftId, {
          baseRevision: latest.revision,
          creationKey: creationKeyRef.current
        });
        if (currentDraftIdRef.current !== draftId) return;
        setCurrentDraft(result.draft);
        navigate(`/recipe/${encodeURIComponent(result.recipe.id)}`);
      } catch (error) {
        if (error instanceof ApiError && [400, 403, 413, 415].includes(error.status)) {
          setActionError(errorText(error));
          return;
        }
        if (error instanceof ApiError && error.status === 409) throw error;
        setActionError("保存结果还没有确认，正在核对这份草稿是否已经生成新菜。" );
        try {
          const checked = await fetchWorkshopDraft(draftId);
          if (currentDraftIdRef.current !== draftId) return;
          setCurrentDraft(checked);
          if (checked.savedRecipeId) {
            navigate(`/recipe/${encodeURIComponent(checked.savedRecipeId)}`);
            return;
          }
          if (checked.creation?.recipeId && checked.creation.phase === "committed") {
            navigate(`/recipe/${encodeURIComponent(checked.creation.recipeId)}`);
            return;
          }
          setActionError("服务器还没有确认保存。可以重试；重试会沿用同一个提交请求。" );
        } catch {
          setActionError("无法确认保存结果。请保持这份草稿，网络恢复后再试；重试会沿用同一个提交请求。" );
        }
      }
    });
    commitPendingRef.current = false;
  };

  const reloadConflict = async (): Promise<void> => {
    if (!draftId) return;
    const current = conflictDraft ?? await fetchWorkshopDraft(draftId).catch(() => null);
    if (!current) {
      setActionError("暂时无法读取服务器版本，请检查网络后重试。" );
      return;
    }
    setCurrentDraft(current);
    editVersionRef.current = 0;
    savedVersionRef.current = 0;
    setEditVersion(0);
    setUserEditedFields([]);
    saveBlockedRef.current = false;
    setConflictOpen(false);
    setConflictDraft(null);
    setSaveState("saved");
    setSaveHint(null);
    setActionError(null);
  };

  if (!draftId) {
    return (
      <div className="page workshop-page workshop-index-page">
        <header className="workshop-topbar">
          <button type="button" className="workshop-text-button" onClick={() => navigate("/")}>← 回到菜谱</button>
          <span className="workshop-brand-mark">厨房灵感收集处</span>
        </header>
        <section className="workshop-index-hero">
          <div className="workshop-index-copy">
            <p className="workshop-eyebrow">留住灵感，再慢慢核对</p>
            <h1>创意工坊</h1>
            <p>网页、截图、笔记都可以放在一起。菜谱会先整理成草稿，你确认过材料和做法后才会保存。</p>
          </div>
          <div className="workshop-hero-art" aria-hidden="true">
            <span className="workshop-art-leaf">✦</span>
            <span className="workshop-art-plate"><span>＋</span></span>
            <span className="workshop-art-spark">·</span>
          </div>
          <div className="workshop-index-actions">
            <button type="button" className="workshop-button workshop-button-primary" onClick={() => void createDraft()} disabled={busyCreating}>
              {busyCreating ? "正在准备…" : "开始一份新菜"}
            </button>
            <p>也可以只用手动填写，不需要整理服务。</p>
          </div>
        </section>
        {indexError && <p className="workshop-alert workshop-alert-error" role="alert">{indexError}</p>}
        {capabilities && (
          <p className={`workshop-capability ${capabilities.llmAvailable ? "is-ready" : "is-limited"}`}>
            <span aria-hidden="true">{capabilities.llmAvailable ? "●" : "○"}</span>
            {capabilities.llmAvailable ? `材料整理已就绪 · ${capabilities.model}` : capabilities.llmProblem || "材料整理暂不可用，手动录入仍可使用。"}
          </p>
        )}
        <section className="workshop-draft-list" aria-labelledby="workshop-drafts-title">
          <div className="workshop-section-heading">
            <div>
              <p className="workshop-eyebrow">未完成的灵感</p>
              <h2 id="workshop-drafts-title">继续整理</h2>
            </div>
            <span className="workshop-count">{summaries.length} 份</span>
          </div>
          {indexLoading && <p className="workshop-empty-state">正在找回草稿…</p>}
          {!indexLoading && summaries.length === 0 && <p className="workshop-empty-state">还没有草稿。先把刚想到的菜名记下来吧。</p>}
          <div className="workshop-summary-grid">
            {summaries.map((item) => (
              <button type="button" key={item.draftId} className="workshop-draft-card" onClick={() => navigate(`/workshop/${encodeURIComponent(item.draftId)}`)}>
                <span className="workshop-draft-card-icon" aria-hidden="true">✳</span>
                <span className="workshop-draft-card-copy">
                  <strong>{item.name || "还没命名的菜"}</strong>
                  <span>{item.sourceCount} 份材料 · {taskLabels[item.state]}</span>
                </span>
                <span className="workshop-draft-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const readyPhotos = draft?.sources.filter((source) => source.kind === "image" && source.status === "ready" && source.selected) ?? [];
  const canAnalyze = Boolean(draft && !draft.creation && draft.sources.some((source) => source.selected) &&
    (capabilities?.llmAvailable || draft.sources.some((source) => source.selected && source.kind === "json")));
  const activeGeneration = draft?.generation && isActiveTask(draft.generation.state);
  const activeEvidence = [
    ...(draft?.evidence ?? []),
    ...userEditedFields.map((field) => ({ field, status: "user" as const, sourceIds: [] }))
  ];
  const missing = draft ? missingFields(draft) : [];

  if (draftLoading) {
    return <div className="page workshop-page"><p className="workshop-empty-state">正在打开你的草稿…</p></div>;
  }
  if (draftError || !draft) {
    return (
      <div className="page workshop-page">
        <header className="workshop-topbar"><button type="button" className="workshop-text-button" onClick={() => navigate("/workshop")}>← 工坊首页</button></header>
        <p className="workshop-alert workshop-alert-error" role="alert">{draftError || "没有找到这份草稿。"}</p>
        <button type="button" className="workshop-button workshop-button-light" onClick={() => void loadDraft(draftId)}>重新加载</button>
      </div>
    );
  }

  const selectedCandidate = draft.candidate;
  const alternativeRecipes = draft.alternatives.filter((item) => !sameRecipe(item.recipe, selectedCandidate));
  const suggestionCandidates = draft.suggestion?.candidates ?? [];
  const imageCover = draft.images.coverSourceId ?? "";

  return (
    <div className="page workshop-page">
      <header className="workshop-topbar">
        <button type="button" className="workshop-text-button" onClick={() => navigate("/workshop")}>← 工坊首页</button>
        <div className="workshop-save-indicator" aria-live="polite">
          <span className={`workshop-save-dot save-${saveState}`} />
          {saveState === "saving" ? "正在保存" : saveState === "dirty" ? "修改待保存" : saveState === "failed" ? "保存遇到问题" : "草稿已保存"}
        </div>
      </header>

      <section className="workshop-editor-hero">
        <div>
          <p className="workshop-eyebrow">收集到的材料，先放在这里</p>
          <h1>{draft.candidate.name?.trim() || "一份新菜"}</h1>
          <p>草稿会自动保存。你可以先记下灵感，稍后再补齐用量和做法。</p>
        </div>
        <span className="workshop-editor-state">{draft.savedRecipeId ? "已保存为新菜" : draft.generation ? taskLabels[draft.generation.state] : "正在收集"}</span>
      </section>

      {capabilities && !capabilities.llmAvailable && (
        <p className="workshop-alert workshop-alert-warm" role="status">
          {capabilities.llmProblem || "整理服务暂不可用。你仍可以添加材料并手动填写。"}
        </p>
      )}
      {saveHint && <div className="workshop-alert workshop-alert-warm" role="status"><p>{saveHint}</p>{dirty && <button type="button" className="workshop-text-button" onClick={() => void saveLatest().catch(() => undefined)}>重试保存</button>}</div>}
      {notice && <p className="workshop-alert workshop-alert-success" role="status">{notice}</p>}
      {actionError && <p className="workshop-alert workshop-alert-error" role="alert">{actionError}</p>}
      {draft.savedRecipeId && (
        <div className="workshop-alert workshop-alert-success workshop-saved-recipe" role="status">
          <span>这份草稿已保存为新菜。</span>
          <button type="button" className="workshop-button workshop-button-light" onClick={() => navigate(`/recipe/${encodeURIComponent(draft.savedRecipeId!)}`)}>打开菜谱</button>
        </div>
      )}
      {conflictOpen && (
        <section className="workshop-conflict" aria-labelledby="workshop-conflict-title">
          <div>
            <h2 id="workshop-conflict-title">这份草稿在另一台设备上也有修改</h2>
            <p>本页的编辑内容仍保留在当前页面。请先查看服务器版本，决定是否重新载入。</p>
            {conflictDraft && <p>服务器上的菜名：{conflictDraft.candidate.name || "还没命名"} · {conflictDraft.sources.length} 份材料</p>}
          </div>
          <button type="button" className="workshop-button workshop-button-light" onClick={() => void reloadConflict()}>重新加载服务器版本</button>
        </section>
      )}

      <div className="workshop-mobile-tabs" role="group" aria-label="创意工坊视图" data-active-view={mobileView}>
        <button type="button" aria-pressed={mobileView === "sources"} onClick={() => setMobileView("sources")}>原材料</button>
        <button type="button" aria-pressed={mobileView === "recipe"} onClick={() => setMobileView("recipe")}>菜谱草稿</button>
      </div>

      <fieldset className="workshop-workspace" data-mobile-view={mobileView} disabled={Boolean(busyAction) || Boolean(activeGeneration) || Boolean(draft.creation)} aria-busy={Boolean(busyAction) || Boolean(activeGeneration)}>
        <legend className="workshop-sr-only">整理材料与编辑菜谱</legend>
        <section
          className="workshop-card workshop-material-card"
          aria-labelledby="workshop-materials-title"
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            const imageFiles = files.filter((file) => file.type.startsWith("image/"));
            if (imageFiles.length) {
              event.preventDefault();
              void addFiles(imageFiles);
            }
          }}
          onDragOver={(event) => { if (event.dataTransfer.files.length) event.preventDefault(); }}
          onDrop={(event) => {
            if (!event.dataTransfer.files.length) return;
            event.preventDefault();
            void addFiles(event.dataTransfer.files);
          }}
        >
          <div className="workshop-section-heading">
            <div>
              <p className="workshop-eyebrow">从一个来源开始，也可以慢慢补充</p>
              <h2 id="workshop-materials-title">菜谱材料</h2>
            </div>
            <span className="workshop-count">{draft.sources.length} 份</span>
          </div>
          <div className="workshop-add-grid">
            <div className="workshop-add-box">
              <label className="workshop-field">
                <span>网页链接</span>
                <input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addLink(); } }} placeholder="粘贴公开网页地址" />
              </label>
              <button type="button" className="workshop-button workshop-button-light" disabled={!sourceUrl.trim() || Boolean(busyAction)} onClick={() => void addLink()}>加入链接</button>
            </div>
            <div className="workshop-add-box">
              <label className="workshop-field">
                <span>文字笔记</span>
                <textarea rows={3} value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="粘贴菜谱、聊天记录或自己的做法" />
              </label>
              <button type="button" className="workshop-button workshop-button-light" disabled={!sourceText.trim() || Boolean(busyAction)} onClick={() => void addText()}>加入文字</button>
            </div>
            <div className="workshop-add-box workshop-file-box">
              <span className="workshop-file-heading">图片或文件</span>
              <p>选择照片、TXT、MD 或一道菜的 JSON；也可把文件拖到这里，或粘贴图片。</p>
              <button type="button" className="workshop-button workshop-button-light" disabled={Boolean(busyAction)} onClick={() => fileInputRef.current?.click()}>选择图片或文件</button>
              <input ref={fileInputRef} type="file" className="workshop-sr-only" accept=".jpg,.jpeg,.png,.webp,.txt,.md,.markdown,.json,image/jpeg,image/png,image/webp" multiple onChange={(event) => void addFiles(event.currentTarget.files ?? [])} />
              <button type="button" className="workshop-button workshop-button-light workshop-camera-button" disabled={Boolean(busyAction)} onClick={() => cameraInputRef.current?.click()}>拍照添加</button>
              <input ref={cameraInputRef} type="file" className="workshop-sr-only" accept="image/*" capture="environment" aria-label="拍照添加照片" onChange={(event) => void addFiles(event.currentTarget.files ?? [])} />
              <small>支持 JPG、PNG、WebP、TXT、MD、JSON。HEIC 和 GIF 暂不支持；长图文字较小时请拆图。</small>
              <small className="workshop-camera-note">若浏览器不支持相机入口，此按钮会改为打开相册或文件选择。</small>
            </div>
          </div>

          <label className="workshop-field workshop-instructions">
            <span>补充或更正 <span className="workshop-field-status">你补充的</span></span>
            <textarea
              rows={2}
              value={draft.instructions}
              onChange={(event) => changeLocal((current) => ({ ...current, instructions: event.target.value, reviewed: false, hasUserEdits: true }))}
              placeholder="例如：我家用 300g 土豆；不吃辣。只写你确认过的信息。"
            />
          </label>

          <div className="workshop-source-list">
            {draft.sources.map((source, index) => (
              <SourceCard
                key={source.id}
                source={source}
                draftId={draft.draftId}
                index={index}
                total={draft.sources.length}
                onSelected={(selected) => changeSourceSelection(source.id, selected)}
                onMove={(delta) => moveSource(index, delta)}
              />
            ))}
          </div>
          {draft.sources.length === 0 && <p className="workshop-empty-inline">还没有材料。手动填写也可以直接开始。</p>}
          {draft.sources.some((source) => source.kind === "image") && (
            <p className="workshop-photo-note">截图和原始照片只用于核对。图片不会自动成为正式封面；只把你自己拍摄的照片选作配图。</p>
          )}
          {activeGeneration && (
            <div className="workshop-generation" role="status" aria-live="polite">
              <span className="workshop-loader" aria-hidden="true" />
              <div><strong>{taskLabels[draft.generation!.state]}</strong><span>已选 {draft.sources.filter((source) => source.selected).length} 份材料。完成后可继续校对。</span></div>
            </div>
          )}
          {draft.generation && (draft.generation.state === "failed" || draft.generation.state === "interrupted") && (
            <p className="workshop-alert workshop-alert-warm" role="status">{draft.generation.problem || taskLabels[draft.generation.state]}。已有材料和编辑内容仍保留，可以手动继续或再次整理。</p>
          )}
          <div className="workshop-analyze-row">
            <button type="button" className="workshop-button workshop-button-primary" disabled={!canAnalyze || Boolean(activeGeneration) || Boolean(busyAction)} onClick={() => void analyze()}>
              {busyAction === "正在开始整理" ? "正在开始…" : activeGeneration ? "正在整理…" : "整理成菜谱"}
            </button>
            <span>{capabilities?.llmAvailable ? "整理只生成草稿，不会直接保存新菜。" : "可以继续手动填写；合规菜谱 JSON 仍可尝试直接整理。"}</span>
          </div>
        </section>

        <section className="workshop-card workshop-review-card" aria-labelledby="workshop-candidate-title">
          <div className="workshop-section-heading">
            <div>
              <p className="workshop-eyebrow">缺的内容请明确补上</p>
              <h2 id="workshop-candidate-title">整理后的菜谱</h2>
            </div>
            <span className={`workshop-review-count ${missing.length ? "needs-work" : "ready"}`}>
              {missing.length ? `还差 ${missing.length} 项` : "必填内容齐了"}
            </span>
          </div>
          {alternativeRecipes.length > 0 && (
            <div className="workshop-alternatives">
              <h3>材料里有几道菜，选择要整理的这一道</h3>
              <div className="workshop-alternative-list">
                {alternativeRecipes.map((item) => (
                  <button type="button" key={item.key} className="workshop-alternative" onClick={() => applyAlternative(item.recipe)}>
                    <strong>{item.recipe.name || "未命名的菜"}</strong><span>采用这道菜</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {draft.suggestion && draft.hasUserEdits && (
            <div className="workshop-suggestion">
              <div>
                <span className="workshop-suggestion-label">有一份新的整理建议</span>
                <p>你已经改过草稿，这份建议不会覆盖当前内容。选中后才会采用。</p>
              </div>
              {suggestionCandidates.map((item) => (
                <button type="button" className="workshop-button workshop-button-light" key={item.key} onClick={() => applyAlternative(item.recipe)}>
                  采用新整理稿{item.recipe.name ? `：${item.recipe.name}` : ""}
                </button>
              ))}
            </div>
          )}
          {draft.evidence.length > 0 && (
            <details className="workshop-evidence-details">
              <summary>查看材料依据与待确认项</summary>
              <ul>
                {draft.evidence.map((item, index) => (
                  <li key={`${item.field}-${index}`}>
                    <strong>{fieldLabel(item.field)}</strong><span>{evidenceText[item.status]}</span>
                    {item.excerpt && <blockquote>{item.excerpt}</blockquote>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {draft.unresolved.length > 0 && (
            <div className="workshop-unresolved" role="status">
              <h3>这些地方还要你确认</h3>
              <ul>{draft.unresolved.map((item, index) => <li key={`${item.field}-${index}`}><strong>{fieldLabel(item.field)}</strong> {item.message}</li>)}</ul>
            </div>
          )}
          <WorkshopRecipeForm
            candidate={selectedCandidate}
            meta={formMeta}
            evidence={activeEvidence}
            stepSourceIds={draft.images.stepSourceIds}
            photos={readyPhotos}
            onChange={handleCandidateChange}
          />
          <div className="workshop-cover-choice">
            <label className="workshop-field">
              <span>封面照片</span>
              <select value={imageCover} onChange={(event) => changeLocal((current) => ({
                ...current,
                images: { ...current.images, coverSourceId: event.target.value || undefined },
                reviewed: false
              }))}>
                <option value="">先不选封面</option>
                {readyPhotos.map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}
              </select>
              <small>仅选择你自己拍摄的照片；原始截图不会自动成为封面。</small>
            </label>
            {imageCover && <img className="workshop-cover-preview" src={workshopSourceUrl(draft.draftId, imageCover)} alt="已选封面预览" />}
          </div>

          {missing.length > 0 && <p className="workshop-alert workshop-alert-warm">保存前请补齐：{missing.join("、")}。材料没写明的内容不会自动填入。</p>}
          <label className="workshop-review-check">
            <input type="checkbox" checked={draft.reviewed} onChange={(event) => changeLocal((current) => ({ ...current, reviewed: event.target.checked }))} />
            <span>我已核对材料、待确认项；选为配图的是自己的照片</span>
          </label>
          <div className="workshop-commit-row">
            <button type="button" className="workshop-button workshop-button-primary workshop-save-recipe" disabled={Boolean(missing.length) || !draft.reviewed || Boolean(busyAction) || Boolean(activeGeneration)} onClick={() => void commit()}>
              {busyAction === "正在保存新菜" ? "正在保存…" : draft.savedRecipeId ? "打开已保存的新菜" : "保存为新菜"}
            </button>
            <span>保存后会进入菜谱列表；原材料和这份草稿仍可回看。</span>
          </div>
        </section>
      </fieldset>

      {busyAction && <div className="workshop-busy-note" role="status">{busyAction}…</div>}
    </div>
  );
}

function SourceCard({
  source,
  draftId,
  index,
  total,
  onSelected,
  onMove
}: {
  source: WorkshopSource;
  draftId: string;
  index: number;
  total: number;
  onSelected: (selected: boolean) => void;
  onMove: (delta: -1 | 1) => void;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const kindLabel = source.kind === "link" ? "网页" : source.kind === "text" ? "文字" : source.kind === "json" ? "菜谱文件" : "照片";
  return (
    <article className={`workshop-source ${source.status === "error" ? "source-error" : ""}`}>
      <div className="workshop-source-order">{String(index + 1).padStart(2, "0")}</div>
      {source.kind === "image" && <a href={workshopSourceUrl(draftId, source.id)} target="_blank" rel="noreferrer" aria-label={`查看原图：${source.name}`}><img className="workshop-source-thumb" src={workshopSourceUrl(draftId, source.id)} alt="原始材料预览" /></a>}
      <div className="workshop-source-main">
        <div className="workshop-source-title"><span className="workshop-source-kind">{kindLabel}</span><strong>{source.name || source.url || "未命名材料"}</strong></div>
        {source.url && <a href={source.url} target="_blank" rel="noreferrer" className="workshop-source-link">查看原网页</a>}
        {source.problem && <p className="workshop-source-problem">{source.problem}</p>}
        {(source.kind === "text" || source.kind === "link") && source.text && <p className="workshop-source-excerpt">{source.text.slice(0, 180)}{source.text.length > 180 ? "…" : ""}</p>}
        {source.text && <details className="workshop-expand-source" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}><summary className="workshop-text-button">查看原文</summary><pre className="workshop-source-fulltext">{source.text}</pre></details>}
        <span className={`workshop-source-status status-${source.status}`}>
          {source.status === "ready" ? "已收好" : source.status === "pending" ? "等待读取" : "需要处理"}
        </span>
      </div>
      <div className="workshop-source-controls">
        <button type="button" className="workshop-icon-button" disabled={index === 0} aria-label={`材料 ${index + 1} 上移`} onClick={() => onMove(-1)}>上移</button>
        <button type="button" className="workshop-icon-button" disabled={index === total - 1} aria-label={`材料 ${index + 1} 下移`} onClick={() => onMove(1)}>下移</button>
        <label className="workshop-source-select"><input type="checkbox" checked={source.selected} onChange={(event) => onSelected(event.target.checked)} /><span>用于整理</span></label>
      </div>
    </article>
  );
}
