// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  WorkshopAnalysisResult,
  WorkshopCapabilities,
  WorkshopDraft,
  WorkshopRecipeInput
} from "../src/shared/types.js";

const apiMock = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    payload: unknown;
    constructor(status: number, payload: unknown = null) {
      super(`请求失败（HTTP ${status}）`);
      this.status = status;
      this.payload = payload;
    }
  }
  return {
    ApiError,
    addWorkshopSource: vi.fn(),
    analyzeWorkshopDraft: vi.fn(),
    commitWorkshopDraft: vi.fn(),
    createWorkshopDraft: vi.fn(),
    fetchWorkshopCapabilities: vi.fn(),
    fetchWorkshopDraft: vi.fn(),
    fetchWorkshopDrafts: vi.fn(),
    updateWorkshopDraft: vi.fn(),
    workshopSourceUrl: (draftId: string, sourceId: string): string => `/api/workshop/drafts/${draftId}/sources/${sourceId}`
  };
});

const routerMock = vi.hoisted(() => ({ navigate: vi.fn() }));
const metaMock = vi.hoisted(() => ({
  meta: {
    categories: ["家常菜", "汤羹"],
    tags: ["快手", "下饭菜"],
    total: 2,
    equipment: ["炒锅", "砂锅"],
    defaultOwned: ["炒锅"],
    equipmentProblem: null
  }
}));

vi.mock("../src/client/lib/api.js", () => apiMock);
vi.mock("../src/client/lib/router.js", () => routerMock);
vi.mock("../src/client/lib/use-meta.js", () => ({ useMeta: () => ({ meta: metaMock.meta, failed: false }) }));

import { WorkshopPage } from "../src/client/pages/WorkshopPage.js";

const revision = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function makeCandidate(overrides: Partial<WorkshopRecipeInput> = {}): WorkshopRecipeInput {
  return {
    name: "番茄炒蛋",
    category: "家常菜",
    difficulty: 1,
    servings: 2,
    ingredients: [{ name: "鸡蛋", amount: 2, unit: "个" }],
    steps: [{ text: "鸡蛋炒熟。" }],
    ...overrides
  };
}

function makeDraft(overrides: Partial<WorkshopDraft> = {}): WorkshopDraft {
  return {
    version: 1,
    draftId: "draft-1",
    revision,
    inputVersion: 1,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    sources: [],
    instructions: "",
    candidate: makeCandidate(),
    hasUserEdits: false,
    alternatives: [],
    evidence: [],
    unresolved: [],
    reviewed: true,
    images: { stepSourceIds: [null] },
    generation: null,
    creation: null,
    ...overrides
  };
}

function makeCapabilities(overrides: Partial<WorkshopCapabilities> = {}): WorkshopCapabilities {
  return {
    llmAvailable: true,
    llmProblem: null,
    model: "deepseek-flash",
    imageTypes: ["image/jpeg", "image/png", "image/webp"],
    limits: { links: 5, images: 12, imageBytes: 10_000_000, totalSourceBytes: 30_000_000, textCharacters: 40_000 },
    ...overrides
  };
}

function makeGeneration(state: "analyzing" | "complete") {
  return {
    taskId: "task-1",
    state,
    inputVersion: 1,
    fingerprint: "fingerprint-1",
    startedAt: "2026-10-01T00:00:00.000Z",
    finishedAt: state === "complete" ? "2026-10-01T00:01:00.000Z" : undefined,
    model: "deepseek-flash",
    promptVersion: "v1"
  };
}

function makeAnalysis(recipe: WorkshopRecipeInput): WorkshopAnalysisResult {
  return {
    candidates: [{ key: "candidate-1", recipe, evidence: [], unresolved: [] }],
    explanation: "整理完成"
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.fetchWorkshopDraft.mockReset();
  apiMock.fetchWorkshopCapabilities.mockResolvedValue(makeCapabilities());
  apiMock.fetchWorkshopDrafts.mockResolvedValue({ items: [] });
  apiMock.fetchWorkshopDraft.mockResolvedValue(makeDraft());
  apiMock.updateWorkshopDraft.mockImplementation(async (_id: string, patch: { baseRevision: string }) =>
    makeDraft({ revision: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", inputVersion: 2, reviewed: false })
  );
  apiMock.addWorkshopSource.mockImplementation(async (_id: string, input: { kind: string; url?: string; text?: string }) =>
    makeDraft({
      revision: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      sources: [{ id: "source-1", kind: input.kind as "link" | "text", name: input.url ?? "补充文字", selected: true, status: "ready", url: input.url, text: input.text, sha256: "abc", byteSize: 10 }]
    })
  );
  apiMock.commitWorkshopDraft.mockResolvedValue({ recipe: { id: "番茄炒蛋" }, draft: makeDraft(), warnings: [] });
});

afterEach(cleanup);

describe("创意工坊", () => {
  it("把网页链接加入当前草稿并保留原来源", async () => {
    render(<WorkshopPage draftId="draft-1" />);
    await screen.findByText("番茄炒蛋");
    fireEvent.change(screen.getByPlaceholderText("粘贴公开网页地址"), {
      target: { value: "https://example.com/recipe" }
    });
    fireEvent.click(screen.getByRole("button", { name: "加入链接" }));

    expect(await screen.findByText("https://example.com/recipe")).toBeTruthy();
    expect(apiMock.addWorkshopSource).toHaveBeenCalledWith("draft-1", expect.objectContaining({
      baseRevision: revision,
      kind: "link",
      url: "https://example.com/recipe"
    }));
  });

  it("材料没有份量时保持空白，并提示保存前补齐", async () => {
    apiMock.fetchWorkshopDraft.mockResolvedValue(makeDraft({ candidate: makeCandidate({ servings: undefined }) }));
    render(<WorkshopPage draftId="draft-1" />);

    const servings = await screen.findByPlaceholderText("材料没有说明时请自行确认") as HTMLInputElement;
    expect(servings.value).toBe("");
    expect(screen.getByText(/保存前请补齐：.*份量/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存为新菜" })).toHaveProperty("disabled", true);
  });

  it("显示词表外已选标签和厨具，并允许显式取消", async () => {
    apiMock.fetchWorkshopDraft.mockResolvedValue(makeDraft({
      candidate: makeCandidate({
        tags: ["快手", "旧标签"],
        equipment: ["炒锅", "旧厨具"],
        equipmentAlternatives: [["砂锅", "旧替代锅"]]
      })
    }));
    render(<WorkshopPage draftId="draft-1" />);

    const unknownTag = await screen.findByRole("checkbox", { name: /旧标签.*未在词表中.*可取消/ }) as HTMLInputElement;
    const unknownTool = screen.getByRole("checkbox", { name: /旧厨具.*未在词表中.*可取消/ }) as HTMLInputElement;
    const unknownAlternative = screen.getByRole("checkbox", { name: /旧替代锅.*未在词表中.*可取消/ }) as HTMLInputElement;
    expect(unknownTag.checked).toBe(true);
    expect(unknownTool.checked).toBe(true);
    expect(unknownAlternative.checked).toBe(true);

    fireEvent.click(unknownTag);
    fireEvent.click(unknownTool);
    fireEvent.click(unknownAlternative);
    await waitFor(() => expect(apiMock.updateWorkshopDraft).toHaveBeenCalled());
    expect(apiMock.updateWorkshopDraft).toHaveBeenCalledWith("draft-1", expect.objectContaining({
      candidate: expect.objectContaining({
        tags: ["快手"],
        equipment: ["炒锅"],
        equipmentAlternatives: [["砂锅"]]
      })
    }));
  });

  it("手动草稿可切到空白菜谱表单，且提供拍照文件入口", async () => {
    apiMock.fetchWorkshopDraft.mockResolvedValue(makeDraft({
      candidate: makeCandidate({
        name: undefined,
        category: undefined,
        difficulty: undefined,
        servings: undefined,
        ingredients: [],
        steps: []
      }),
      reviewed: false
    }));
    const { container } = render(<WorkshopPage draftId="draft-1" />);

    const tabs = await screen.findByRole("group", { name: "创意工坊视图" });
    expect(tabs.getAttribute("data-active-view")).toBe("sources");
    fireEvent.click(screen.getByRole("button", { name: "菜谱草稿" }));
    expect(tabs.getAttribute("data-active-view")).toBe("recipe");
    expect(screen.getByRole("button", { name: "菜谱草稿" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByPlaceholderText("例如：番茄炖牛腩") as HTMLInputElement).value).toBe("");
    expect((screen.getByPlaceholderText("材料没有说明时请自行确认") as HTMLInputElement).value).toBe("");

    const cameraInput = container.querySelector('input[type="file"][accept="image/*"]');
    expect(cameraInput?.getAttribute("capture")).toBe("environment");
  });

  it("整理任务期间锁定编辑与审阅，但保留视图切换；轮询完成不改变用户选项", async () => {
    const active = makeDraft({ generation: makeGeneration("analyzing"), reviewed: false });
    const result = makeCandidate({ name: "轮询完成的菜" });
    const completed = makeDraft({
      candidate: result,
      generation: makeGeneration("complete"),
      analysis: makeAnalysis(result),
      reviewed: false
    });
    apiMock.fetchWorkshopDraft.mockResolvedValueOnce(active).mockResolvedValueOnce(completed);
    render(<WorkshopPage draftId="draft-1" />);

    const tabs = await screen.findByRole("group", { name: "创意工坊视图" });
    const workspace = document.querySelector(".workshop-workspace") as HTMLFieldSetElement;
    expect(workspace.disabled).toBe(true);
    expect(screen.getByPlaceholderText("例如：番茄炖牛腩").closest("fieldset")?.disabled).toBe(true);
    expect(screen.getByRole("checkbox", { name: /我已核对材料/ }).closest("fieldset")?.disabled).toBe(true);
    expect(tabs.closest("fieldset")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "菜谱草稿" }));
    fireEvent.click(screen.getByRole("button", { name: "原材料" }));
    await waitFor(() => expect(apiMock.fetchWorkshopDraft).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(tabs.getAttribute("data-active-view")).toBe("sources");

    fireEvent.click(screen.getByRole("button", { name: "菜谱草稿" }));
    expect(tabs.getAttribute("data-active-view")).toBe("recipe");
    expect((screen.getByPlaceholderText("例如：番茄炖牛腩") as HTMLInputElement).value).toBe("轮询完成的菜");
  });

  it("重新打开已完成的草稿默认显示菜谱结果", async () => {
    const result = makeCandidate({ name: "重新打开的整理结果" });
    apiMock.fetchWorkshopDraft.mockResolvedValue(makeDraft({
      candidate: result,
      generation: makeGeneration("complete"),
      analysis: makeAnalysis(result)
    }));
    render(<WorkshopPage draftId="draft-1" />);

    const tabs = await screen.findByRole("group", { name: "创意工坊视图" });
    expect(tabs.getAttribute("data-active-view")).toBe("recipe");
    expect(screen.getByRole("button", { name: "菜谱草稿" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByPlaceholderText("例如：番茄炖牛腩") as HTMLInputElement).value).toBe("重新打开的整理结果");
  });

  it("编辑内容会自动保存到共享草稿", async () => {
    render(<WorkshopPage draftId="draft-1" />);
    const name = await screen.findByPlaceholderText("例如：番茄炖牛腩");
    fireEvent.change(name, { target: { value: "葱香番茄炒蛋" } });

    await waitFor(() => expect(apiMock.updateWorkshopDraft).toHaveBeenCalled());
    expect(apiMock.updateWorkshopDraft).toHaveBeenCalledWith("draft-1", expect.objectContaining({
      baseRevision: revision,
      candidate: expect.objectContaining({ name: "葱香番茄炒蛋" })
    }));
  });

  it("再次整理只显示建议，点击采用后才替换当前内容", async () => {
    const suggestion = makeCandidate({ name: "建议版番茄蛋" });
    apiMock.fetchWorkshopDraft.mockResolvedValue(makeDraft({
      hasUserEdits: true,
      candidate: makeCandidate({ name: "我手动改过的菜" }),
      suggestion: {
        candidates: [{ key: "suggestion-1", recipe: suggestion, evidence: [], unresolved: [] }],
        explanation: "补充材料后的建议"
      }
    }));
    render(<WorkshopPage draftId="draft-1" />);

    const name = await screen.findByPlaceholderText("例如：番茄炖牛腩") as HTMLInputElement;
    expect(name.value).toBe("我手动改过的菜");
    fireEvent.click(screen.getByRole("button", { name: "采用新整理稿：建议版番茄蛋" }));
    expect(name.value).toBe("建议版番茄蛋");
  });

  it("409 时说明另一个版本并提供显式重载", async () => {
    const serverVersion = makeDraft({
      revision: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      candidate: makeCandidate({ name: "另一台设备的菜名" })
    });
    apiMock.updateWorkshopDraft.mockRejectedValue(new apiMock.ApiError(409, { current: serverVersion }));
    render(<WorkshopPage draftId="draft-1" />);
    const name = await screen.findByPlaceholderText("例如：番茄炖牛腩");
    fireEvent.change(name, { target: { value: "本页的修改" } });

    expect(await screen.findByText(/另一台设备已经更新/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重新加载服务器版本" }));
    await waitFor(() => expect((screen.getByPlaceholderText("例如：番茄炖牛腩") as HTMLInputElement).value).toBe("另一台设备的菜名"));
  });

  it("整理服务停用时仍可手动录入，整理按钮不可用", async () => {
    apiMock.fetchWorkshopCapabilities.mockResolvedValue(makeCapabilities({ llmAvailable: false, llmProblem: "整理暂不可用" }));
    render(<WorkshopPage draftId="draft-1" />);

    await screen.findByText("整理暂不可用");
    expect(screen.getByRole("button", { name: "整理成菜谱" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "+ 加食材" }));
    expect(screen.getAllByPlaceholderText("食材名")).toHaveLength(2);
    expect(apiMock.analyzeWorkshopDraft).not.toHaveBeenCalled();
  });

  it("重复保存只提交一次，结果未确认时通过已保存草稿恢复详情", async () => {
    const initial = makeDraft();
    const saved = makeDraft({ savedRecipeId: "recipe-42" });
    apiMock.fetchWorkshopDraft.mockResolvedValueOnce(initial).mockResolvedValueOnce(saved);
    let rejectCommit: (reason: unknown) => void = () => undefined;
    apiMock.commitWorkshopDraft.mockImplementation(() => new Promise((_resolve, reject) => { rejectCommit = reject; }));
    render(<WorkshopPage draftId="draft-1" />);
    const save = await screen.findByRole("button", { name: "保存为新菜" });

    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });
    await waitFor(() => expect(apiMock.commitWorkshopDraft).toHaveBeenCalledTimes(1));
    act(() => rejectCommit(new Error("连接中断")));
    await waitFor(() => expect(routerMock.navigate).toHaveBeenCalledWith("/recipe/recipe-42"));
    expect(apiMock.commitWorkshopDraft).toHaveBeenCalledWith("draft-1", expect.objectContaining({
      baseRevision: revision,
      creationKey: expect.any(String)
    }));
  });

  it("结果未保存时的显式重试继续使用相同的提交键", async () => {
    const initial = makeDraft();
    apiMock.fetchWorkshopDraft.mockResolvedValueOnce(initial).mockResolvedValueOnce(initial);
    apiMock.commitWorkshopDraft
      .mockRejectedValueOnce(new Error("连接中断"))
      .mockResolvedValueOnce({ recipe: { id: "recipe-42" }, draft: makeDraft({ savedRecipeId: "recipe-42" }), warnings: [] });
    render(<WorkshopPage draftId="draft-1" />);
    const save = await screen.findByRole("button", { name: "保存为新菜" });

    fireEvent.click(save);
    await screen.findByText("服务器还没有确认保存。可以重试；重试会沿用同一个提交请求。");
    fireEvent.click(screen.getByRole("button", { name: "保存为新菜" }));
    await waitFor(() => expect(routerMock.navigate).toHaveBeenCalledWith("/recipe/recipe-42"));

    expect(apiMock.commitWorkshopDraft).toHaveBeenCalledTimes(2);
    const first = apiMock.commitWorkshopDraft.mock.calls[0]?.[1];
    const second = apiMock.commitWorkshopDraft.mock.calls[1]?.[1];
    expect(first).toEqual(expect.objectContaining({ creationKey: expect.any(String) }));
    expect(second).toEqual(expect.objectContaining({ creationKey: first?.creationKey }));
  });
});
