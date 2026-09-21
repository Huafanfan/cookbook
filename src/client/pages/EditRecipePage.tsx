import { useEffect, useMemo, useState } from "react";

import type { Difficulty, Recipe, RecipeDetail } from "../../shared/types";
import { ApiError, fetchRecipe, issuesOf, saveRecipe } from "../lib/api";
import { navigate } from "../lib/router";
import { readStored, removeStored, STORAGE_KEYS, writeStored } from "../lib/storage";
import { useMeta } from "../lib/use-meta";

/**
 * 编辑页（CB-009）。
 *
 * 三件必须做对的事（Astra 复核的硬要求）：
 * 1. **版本守卫**：带上加载时的 `revision` 保存；409 时**不静默覆盖**，让人选「重新加载」或「用我的覆盖」
 *    （覆盖也要带服务端刚返回的最新 `revision` 再提交，可能再次 409）。
 * 2. **草稿不换 baseRevision**：草稿存 `{recipeId, baseRevision, draft, savedAt}`；恢复草稿时
 *    仍然用当初加载的那版 revision（否则会悄悄盖掉别人的修改）。
 * 3. **失败语义如实**：400 → 字段级报错；503 → "内容未变"；**网络中断 → "结果未确认，请刷新"**。
 *
 * 另外：步骤增/删/重排会让 `step-N.jpg` 与完成标记对不上 —— 保存前提示，保存后清掉完成标记。
 */

interface FormIngredient {
  name: string;
  amount: string;
  unit: string;
  group: string;
  note: string;
}

interface FormStep {
  text: string;
  title: string;
  minutes: string;
  heat: string;
  tip: string;
}

interface FormState {
  name: string;
  aliases: string;
  category: string;
  tags: string[];
  summary: string;
  difficulty: Difficulty;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  equipment: string[];
  /** 每个元素是一个"任选其一"的组（组内用逗号分隔） */
  alternatives: string;
  ingredients: FormIngredient[];
  steps: FormStep[];
  /** 一行一条 */
  tips: string;
  source: string;
}

function textOf(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
}

function toForm(recipe: RecipeDetail): FormState {
  return {
    name: recipe.name,
    aliases: (recipe.aliases ?? []).join("、"),
    category: recipe.category,
    tags: recipe.tags ?? [],
    summary: recipe.summary ?? "",
    difficulty: recipe.difficulty,
    servings: String(recipe.servings),
    prepMinutes: recipe.prepMinutes === undefined ? "" : String(recipe.prepMinutes),
    cookMinutes: recipe.cookMinutes === undefined ? "" : String(recipe.cookMinutes),
    equipment: recipe.equipment ?? [],
    alternatives: (recipe.equipmentAlternatives ?? []).map((group) => group.join("、")).join("\n"),
    ingredients: recipe.ingredients.map((item) => ({
      name: item.name,
      amount: item.amount === undefined ? "" : String(item.amount),
      unit: textOf(item.unit),
      group: textOf(item.group),
      note: textOf(item.note)
    })),
    steps: recipe.steps.map((item) => ({
      text: item.text,
      title: textOf(item.title),
      minutes: item.minutes === undefined ? "" : String(item.minutes),
      heat: textOf(item.heat),
      tip: textOf(item.tip)
    })),
    tips: (recipe.tips ?? []).join("\n"),
    source: recipe.source ?? ""
  };
}

function splitList(text: string): string[] {
  return text
    .split(/[、,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function optional(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed ? trimmed : undefined;
}

/** 用量：纯数字就存 number，其余（"适量"）存字符串 */
function amountValue(text: string): number | string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed) ? numeric : trimmed;
}

function fromForm(form: FormState, recipe: RecipeDetail): Record<string, unknown> {
  const ingredients = form.ingredients.map((item) => ({
    name: item.name.trim(),
    ...(amountValue(item.amount) !== undefined ? { amount: amountValue(item.amount) } : {}),
    ...(optional(item.unit) ? { unit: item.unit.trim() } : {}),
    ...(optional(item.group) ? { group: item.group.trim() } : {}),
    ...(optional(item.note) ? { note: item.note.trim() } : {})
  }));

  const steps = form.steps.map((item) => ({
    text: item.text.trim(),
    ...(optional(item.title) ? { title: item.title.trim() } : {}),
    ...(optional(item.minutes) ? { minutes: Number(item.minutes) } : {}),
    ...(optional(item.heat) ? { heat: item.heat.trim() } : {}),
    ...(optional(item.tip) ? { tip: item.tip.trim() } : {})
  }));

  const alternatives = form.alternatives
    .split("\n")
    .map(splitList)
    .filter((group) => group.length > 0);

  return {
    // id 必须等于 URL 里的（服务端也会校验）；其余省略的字段会被服务端当成"没填"
    id: recipe.id,
    ...(optional(form.source) ? { source: form.source.trim() } : {}),
    ...(optional(form.summary) ? { summary: form.summary.trim() } : {}),
    name: form.name.trim(),
    category: form.category.trim(),
    difficulty: form.difficulty,
    servings: Number(form.servings),
    ingredients,
    steps,
    ...(splitList(form.aliases).length > 0 ? { aliases: splitList(form.aliases) } : {}),
    ...(form.tags.length > 0 ? { tags: form.tags } : {}),
    ...(form.equipment.length > 0 ? { equipment: form.equipment } : {}),
    ...(alternatives.length > 0 ? { equipmentAlternatives: alternatives } : {}),
    ...(optional(form.prepMinutes) ? { prepMinutes: Number(form.prepMinutes) } : {}),
    ...(optional(form.cookMinutes) ? { cookMinutes: Number(form.cookMinutes) } : {}),
    ...(splitList(form.tips).length > 0 ? { tips: form.tips.split("\n").map((line) => line.trim()).filter(Boolean) } : {})
  };
}

/** 步骤有没有动过（数量/文案/顺序/时长）——决定是否要清完成标记、是否提示步骤图 */
function stepsChanged(recipe: RecipeDetail, form: FormState): boolean {
  if (recipe.steps.length !== form.steps.length) return true;
  return recipe.steps.some((step, index) => {
    const next = form.steps[index];
    return (
      step.text.trim() !== next.text.trim() ||
      textOf(step.title) !== next.title.trim() ||
      String(step.minutes ?? "") !== next.minutes.trim()
    );
  });
}

interface Draft {
  recipeId: string;
  baseRevision: string;
  draft: FormState;
  savedAt: string;
}

/** 字段级报错的路径集合（服务端给的是 `ingredients.0.name: 食材名不能为空` 这种） */
function invalidPaths(issues: string[]): Set<string> {
  return new Set(issues.map((issue) => issue.split(":")[0].trim()));
}

function isInvalid(paths: Set<string>, path: string): boolean {
  for (const candidate of paths) {
    if (candidate === path || candidate.startsWith(`${path}.`) || path.startsWith(`${candidate}.`)) {
      return true;
    }
  }
  return false;
}

export function EditRecipePage({ id }: { id: string }): React.JSX.Element {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [conflict, setConflict] = useState<{
    currentRevision: string;
    /** 服务端读盘解析出来的当前版本（内存索引看不到手工改的文件，所以用它） */
    current: Recipe | null;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const { meta, failed: metaFailed } = useMeta();

  // 载入菜谱 + 看看有没有草稿
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchRecipe(id, controller.signal)
      .then((loaded) => {
        setRecipe(loaded);
        setForm(toForm(loaded));

        const raw = readStored(STORAGE_KEYS.editDraft(id));
        if (!raw) return;
        try {
          const saved = JSON.parse(raw) as Draft;
          if (saved.recipeId === id && saved.draft) setDraft(saved);
        } catch {
          removeStored(STORAGE_KEYS.editDraft(id)); // 坏草稿直接丢掉，别挡路
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  const dirty = useMemo(() => {
    if (!recipe || !form) return false;
    return JSON.stringify(toForm(recipe)) !== JSON.stringify(form);
  }, [recipe, form]);

  // 草稿：只有真的改过才存（否则下次进来会白弹一次"继续编辑"）
  useEffect(() => {
    if (!recipe || !form || draft) return;
    if (dirty) {
      const payload: Draft = {
        recipeId: recipe.id,
        baseRevision: recipe.revision,
        draft: form,
        savedAt: new Date().toISOString()
      };
      writeStored(STORAGE_KEYS.editDraft(recipe.id), JSON.stringify(payload));
    } else {
      removeStored(STORAGE_KEYS.editDraft(recipe.id));
    }
  }, [draft, dirty, form, recipe]);

  // 未保存就离开 → 拦一下（手机上误触返回很常见）
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const back = (): void => {
    if (dirty && !window.confirm("还有没保存的修改，确定离开吗？（草稿会留着）")) return;
    navigate(`/recipe/${id}`);
  };

  const vocabularyReady = Boolean(meta?.equipment.length);

  const submit = (baseRevision: string): void => {
    if (!recipe || !form) return;

    setSaving(true);
    setIssues([]);
    setConflict(null);
    setNotice(null);

    saveRecipe(id, {
      recipe: fromForm(form, recipe),
      baseRevision,
      ...(note.trim() ? { note: note.trim() } : {})
    })
      .then(({ recipe: saved }) => {
        // 步骤动了 → 完成标记/计时按旧的步骤顺序存着，必须清掉
        if (stepsChanged(recipe, form)) removeStored(STORAGE_KEYS.stepsDone(saved.id));
        removeStored(STORAGE_KEYS.editDraft(id));
        navigate(`/recipe/${saved.id}`);
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiError) {
          if (cause.status === 409) {
            const payload = cause.payload as {
              currentRevision?: string;
              current?: Recipe | null;
            } | null;
            setConflict({
              currentRevision: payload?.currentRevision ?? "",
              current: payload?.current ?? null
            });
            return;
          }
          if (cause.status === 400) {
            const list = issuesOf(cause);
            setIssues(list.length > 0 ? list : [cause.message]);
            return;
          }
          if (cause.status === 503) {
            setNotice("没能保存（服务器写盘失败），**内容未变**。可以稍后重试。");
            return;
          }
          setNotice(`${cause.message}（内容未变）`);
          return;
        }
        // 网络中断：请求可能已经到达并写成功 —— 不能谎称"没保存"
        setNotice("没能确认保存结果（请求中断）。请刷新页面查看当前内容。");
      })
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="page">
        <p className="notice">正在载入…</p>
      </div>
    );
  }

  if (error || !recipe || !form) {
    return (
      <div className="page">
        <button type="button" className="link-button" onClick={() => navigate(`/recipe/${id}`)}>
          ← 返回
        </button>
        <div className="empty">
          <p className="empty-title">打开编辑页失败</p>
          <p className="empty-hint">{error ?? "这道菜的数据有问题（可能被手工改坏了）"}</p>
        </div>
      </div>
    );
  }

  const paths = invalidPaths(issues);
  const update = (patch: Partial<FormState>): void => setForm({ ...form, ...patch });

  const moveRow = <T,>(rows: T[], index: number, delta: number): T[] => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return rows;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  };

  return (
    <div className="page edit-page">
      <div className="recipe-topbar">
        <button type="button" className="link-button" onClick={back}>
          ← 取消
        </button>
        <div className="topbar-controls">
          <button
            type="button"
            className="chip chip-active"
            disabled={saving || !vocabularyReady}
            onClick={() => submit(recipe.revision)}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      <h1 className="recipe-title">编辑：{recipe.name}</h1>

      {!vocabularyReady && (
        <p className="notice notice-warn">
          {metaFailed ? "厨具/tag 清单载入失败" : "厨具/tag 清单还在载入"}——保存先禁用，刷新页面试试。
        </p>
      )}

      {draft && (
        <div className="notice notice-warn">
          <p>检测到 {new Date(draft.savedAt).toLocaleString()} 的未保存草稿。</p>
          <div className="action-row">
            <button
              type="button"
              className="chip"
              onClick={() => {
                setForm(draft.draft);
                setDraft(null);
              }}
            >
              继续编辑草稿
            </button>
            <button
              type="button"
              className="link-button link-button-sm"
              onClick={() => {
                removeStored(STORAGE_KEYS.editDraft(id));
                setDraft(null);
              }}
            >
              丢弃草稿
            </button>
          </div>
        </div>
      )}

      {conflict && (
        <div className="notice notice-error">
          <p>
            <strong>服务端上已经是另一个版本</strong>
            —— 这道菜在别处被改过（另一台设备、或手工编辑了文件）。你的改动还在这个页面里。
          </p>
          <div className="action-row">
            <button
              type="button"
              className="chip"
              onClick={() => {
                // 用 409 响应里带的**磁盘版本**（服务端读盘解析出来的），
                // 而不是重新 GET：内存索引只在启动时载入，手工改的文件 GET 看不到
                const payload = conflict.current;
                removeStored(STORAGE_KEYS.editDraft(id));
                setDraft(null);
                setConflict(null);
                setNotice(null);

                if (!payload) {
                  // 文件被删/读不出来 → 退回重新拉取
                  fetchRecipe(id).then((loaded) => {
                    setRecipe(loaded);
                    setForm(toForm(loaded));
                  });
                  return;
                }

                const merged: RecipeDetail = {
                  ...recipe,
                  ...payload,
                  revision: conflict.currentRevision
                };
                setRecipe(merged);
                setForm(toForm(merged));
              }}
            >
              重新加载（放弃我的改动）
            </button>
            <button
              type="button"
              className="chip chip-danger"
              onClick={() => {
                if (!window.confirm("用你这份覆盖服务端最新的版本？覆盖后旧版会进修改记录，可以回退。")) return;
                submit(conflict.currentRevision);
              }}
            >
              用我的覆盖
            </button>
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="notice notice-error">
          <p>没能保存：这些地方要改一下</p>
          <ul className="tip-list">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {notice && <p className="notice notice-warn">{notice}</p>}

      {stepsChanged(recipe, form) && recipe.stepImages.some(Boolean) && (
        <p className="notice notice-warn">
          这道菜有步骤图，而步骤动过：步骤图按位置（`step-N.jpg`）对应，顺序变了就对不上，
          需要你自己改文件名（服务端会按新步骤数重算可用的那些）。保存后完成标记也会重置。
        </p>
      )}

      {/* ---------- 基本 ---------- */}
      <section className="section">
        <h2 className="section-title">基本</h2>
        <div className="form-grid">
          <label className="field">
            <span>菜名 *</span>
            <input
              className={isInvalid(paths, "name") ? "invalid" : ""}
              value={form.name}
              onChange={(event) => update({ name: event.target.value })}
            />
          </label>
          <label className="field">
            <span>别名（、分隔）</span>
            <input
              value={form.aliases}
              onChange={(event) => update({ aliases: event.target.value })}
              placeholder="番茄炒蛋、西红柿炒蛋"
            />
          </label>
          <label className="field">
            <span>分类 *</span>
            <select
              className={isInvalid(paths, "category") ? "invalid" : ""}
              value={form.category}
              onChange={(event) => update({ category: event.target.value })}
            >
              {(meta?.categories ?? [form.category]).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>难度 *</span>
            <select
              value={form.difficulty}
              onChange={(event) =>
                update({ difficulty: Number(event.target.value) as Difficulty })
              }
            >
              <option value={1}>1 简单</option>
              <option value={2}>2 适中</option>
              <option value={3}>3 有点挑战</option>
            </select>
          </label>
          <label className="field">
            <span>份量（人）*</span>
            <input
              type="number"
              min={1}
              className={isInvalid(paths, "servings") ? "invalid" : ""}
              value={form.servings}
              onChange={(event) => update({ servings: event.target.value })}
            />
          </label>
          <label className="field">
            <span>备料（分钟）</span>
            <input
              type="number"
              min={0}
              value={form.prepMinutes}
              onChange={(event) => update({ prepMinutes: event.target.value })}
            />
          </label>
          <label className="field">
            <span>烹饪（分钟）</span>
            <input
              type="number"
              min={0}
              value={form.cookMinutes}
              onChange={(event) => update({ cookMinutes: event.target.value })}
            />
          </label>
          <label className="field field-wide">
            <span>一句话介绍</span>
            <input value={form.summary} onChange={(event) => update({ summary: event.target.value })} />
          </label>
          <label className="field field-wide">
            <span>来源</span>
            <input
              value={form.source}
              onChange={(event) => update({ source: event.target.value })}
              placeholder="妈妈的做法 / HowToCook（公有领域）· 链接"
            />
          </label>
        </div>

        {meta && meta.tags.length > 0 && (
          <div className="field">
            <span>标签</span>
            <div className="chip-row">
              {meta.tags.map((tag) => {
                const active = form.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`chip chip-small${active ? " chip-active" : ""}`}
                    aria-pressed={active}
                    onClick={() =>
                      update({
                        tags: active ? form.tags.filter((item) => item !== tag) : [...form.tags, tag]
                      })
                    }
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ---------- 厨具 ---------- */}
      <section className="section">
        <h2 className="section-title">厨具</h2>
        <div className="field">
          <span>必需（全部要有）</span>
          <div className="chip-row">
            {(meta?.equipment ?? []).map((tool) => {
              const active = form.equipment.includes(tool);
              return (
                <button
                  key={tool}
                  type="button"
                  className={`chip chip-small${active ? " chip-active" : ""}`}
                  aria-pressed={active}
                  onClick={() =>
                    update({
                      equipment: active
                        ? form.equipment.filter((item) => item !== tool)
                        : [...form.equipment, tool]
                    })
                  }
                >
                  {tool}
                </button>
              );
            })}
          </div>
        </div>
        <label className="field">
          <span>任选其一（一行一组，组内用、分隔）</span>
          <textarea
            rows={2}
            value={form.alternatives}
            onChange={(event) => update({ alternatives: event.target.value })}
            placeholder={"炒锅、砂锅\n烤箱、空气炸锅"}
          />
        </label>
      </section>

      {/* ---------- 食材 ---------- */}
      <section className="section">
        <h2 className="section-title">食材</h2>
        {form.ingredients.map((item, index) => {
          const at = (name: string): string => `ingredients.${index}.${name}`;
          return (
            <div className="form-row" key={`ing-${index}`}>
              <input
                className={`row-main${isInvalid(paths, at("name")) ? " invalid" : ""}`}
                aria-label={`食材 ${index + 1} 名称`}
                value={item.name}
                placeholder="食材名"
                onChange={(event) => {
                  const next = [...form.ingredients];
                  next[index] = { ...item, name: event.target.value };
                  update({ ingredients: next });
                }}
              />
              <input
                className="row-num"
                aria-label={`食材 ${index + 1} 用量`}
                value={item.amount}
                placeholder="用量"
                onChange={(event) => {
                  const next = [...form.ingredients];
                  next[index] = { ...item, amount: event.target.value };
                  update({ ingredients: next });
                }}
              />
              <input
                className="row-small"
                aria-label={`食材 ${index + 1} 单位`}
                value={item.unit}
                placeholder="单位"
                onChange={(event) => {
                  const next = [...form.ingredients];
                  next[index] = { ...item, unit: event.target.value };
                  update({ ingredients: next });
                }}
              />
              <input
                className="row-small"
                aria-label={`食材 ${index + 1} 分组`}
                value={item.group}
                placeholder="主料/调料"
                onChange={(event) => {
                  const next = [...form.ingredients];
                  next[index] = { ...item, group: event.target.value };
                  update({ ingredients: next });
                }}
              />
              <input
                className="row-small"
                aria-label={`食材 ${index + 1} 备注`}
                value={item.note}
                placeholder="切块/泡发"
                onChange={(event) => {
                  const next = [...form.ingredients];
                  next[index] = { ...item, note: event.target.value };
                  update({ ingredients: next });
                }}
              />
              <span className="row-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`上移食材 ${index + 1}`}
                  disabled={index === 0}
                  onClick={() => update({ ingredients: moveRow(form.ingredients, index, -1) })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`下移食材 ${index + 1}`}
                  disabled={index === form.ingredients.length - 1}
                  onClick={() => update({ ingredients: moveRow(form.ingredients, index, 1) })}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`删除食材 ${index + 1}`}
                  onClick={() =>
                    update({ ingredients: form.ingredients.filter((_, i) => i !== index) })
                  }
                >
                  ✕
                </button>
              </span>
            </div>
          );
        })}
        <button
          type="button"
          className="button button-quiet"
          onClick={() =>
            update({
              ingredients: [
                ...form.ingredients,
                { name: "", amount: "", unit: "", group: "主料", note: "" }
              ]
            })
          }
        >
          ＋ 加一条食材
        </button>
      </section>

      {/* ---------- 步骤 ---------- */}
      <section className="section">
        <h2 className="section-title">步骤</h2>
        {form.steps.map((item, index) => {
          const at = (name: string): string => `steps.${index}.${name}`;
          return (
            <div className="form-block" key={`step-${index}`}>
              <div className="form-row">
                <span className="step-index" aria-hidden="true">
                  {index + 1}
                </span>
                <input
                  className={`row-main${isInvalid(paths, at("text")) ? " invalid" : ""}`}
                  aria-label={`步骤 ${index + 1} 文案`}
                  value={item.text}
                  placeholder="一句话说清这一步"
                  onChange={(event) => {
                    const next = [...form.steps];
                    next[index] = { ...item, text: event.target.value };
                    update({ steps: next });
                  }}
                />
                <span className="row-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`上移步骤 ${index + 1}`}
                    disabled={index === 0}
                    onClick={() => update({ steps: moveRow(form.steps, index, -1) })}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`下移步骤 ${index + 1}`}
                    disabled={index === form.steps.length - 1}
                    onClick={() => update({ steps: moveRow(form.steps, index, 1) })}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`删除步骤 ${index + 1}`}
                    onClick={() => update({ steps: form.steps.filter((_, i) => i !== index) })}
                  >
                    ✕
                  </button>
                </span>
              </div>
              <div className="form-row form-row-sub">
                <input
                  className="row-small"
                  aria-label={`步骤 ${index + 1} 小标题`}
                  value={item.title}
                  placeholder="小标题"
                  onChange={(event) => {
                    const next = [...form.steps];
                    next[index] = { ...item, title: event.target.value };
                    update({ steps: next });
                  }}
                />
                <input
                  className={`row-num${isInvalid(paths, at("minutes")) ? " invalid" : ""}`}
                  aria-label={`步骤 ${index + 1} 分钟`}
                  value={item.minutes}
                  placeholder="分钟"
                  onChange={(event) => {
                    const next = [...form.steps];
                    next[index] = { ...item, minutes: event.target.value };
                    update({ steps: next });
                  }}
                />
                <input
                  className="row-small"
                  aria-label={`步骤 ${index + 1} 火候`}
                  value={item.heat}
                  placeholder="火候"
                  onChange={(event) => {
                    const next = [...form.steps];
                    next[index] = { ...item, heat: event.target.value };
                    update({ steps: next });
                  }}
                />
                <input
                  className="row-main"
                  aria-label={`步骤 ${index + 1} 提醒`}
                  value={item.tip}
                  placeholder="这一步的小提醒"
                  onChange={(event) => {
                    const next = [...form.steps];
                    next[index] = { ...item, tip: event.target.value };
                    update({ steps: next });
                  }}
                />
              </div>
            </div>
          );
        })}
        <button
          type="button"
          className="button button-quiet"
          onClick={() =>
            update({ steps: [...form.steps, { text: "", title: "", minutes: "", heat: "", tip: "" }] })
          }
        >
          ＋ 加一条步骤
        </button>
      </section>

      {/* ---------- 小贴士与改动说明 ---------- */}
      <section className="section">
        <h2 className="section-title">小贴士</h2>
        <textarea
          rows={3}
          aria-label="小贴士（一行一条）"
          value={form.tips}
          onChange={(event) => update({ tips: event.target.value })}
          placeholder="一行一条"
        />
      </section>

      <section className="section">
        <h2 className="section-title">这次改了什么（可选）</h2>
        <input
          aria-label="改动说明"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="例如：盐 3g → 4g"
        />
        <p className="empty-hint">会记进这道菜的修改记录里，方便以后回看。</p>
      </section>

      <div className="action-row">
        <button
          type="button"
          className="button"
          disabled={saving || !vocabularyReady}
          onClick={() => submit(recipe.revision)}
        >
          {saving ? "保存中…" : "保存"}
        </button>
        <button type="button" className="button button-quiet" onClick={back}>
          取消
        </button>
      </div>
    </div>
  );
}
