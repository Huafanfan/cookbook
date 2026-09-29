import { useEffect, useState } from "react";

import type { RecipeHistoryEntry, RecipeHistoryRecord } from "../../shared/types";
import { ApiError, fetchHistory, fetchHistoryRecord, fetchRecipe, saveRecipe } from "../lib/api";
import { difficultyText } from "../lib/format";
import { navigate } from "../lib/router";
import { removeStored, STORAGE_KEYS } from "../lib/storage";

/**
 * 修改记录（CB-009）：列表 + 单条查看 + 恢复。
 *
 * 恢复 = **一次新的保存**（来源标记 `restore`）：不删历史，历史反而多一条。
 * 保存时提交的 `baseRevision` 是**当前**文件的 revision（不是旧版那份），
 * 否则会悄悄盖掉别人刚做的修改。
 */

const SOURCE_LABEL: Record<RecipeHistoryEntry["source"], string> = {
  manual: "网页修改",
  "llm-merge": "LLM 合并",
  import: "导入/同步",
  restore: "恢复旧版"
};

const OUTCOME_LABEL: Record<RecipeHistoryEntry["outcome"], string> = {
  pending: "结果未确认",
  replaced: "已替换",
  failed: "替换失败"
};

function savedAtText(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function RecipeHistoryPage({ id }: { id: string }): React.JSX.Element {
  const [items, setItems] = useState<RecipeHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    setError(null);

    fetchHistory(id, controller.signal)
      .then((response) => setItems(response.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "加载失败");
      });

    return () => controller.abort();
  }, [id]);

  return (
    <div className="page history-page">
      <div className="recipe-topbar">
        <button type="button" className="link-button" onClick={() => navigate(`/recipe/${id}`)}>
          ← 返回这道菜
        </button>
        <div className="topbar-controls">
          <button type="button" className="chip chip-small" onClick={() => navigate(`/recipe/${id}/edit`)}>
            ✎ 编辑
          </button>
        </div>
      </div>

      <h1 className="recipe-title">修改记录</h1>
      <p className="empty-hint">
        每次保存前的那一版都会留在这里（不自动删除），可以查看与恢复。
      </p>

      {error && <p className="notice notice-error">{error}</p>}
      {!items && !error && <p className="notice">正在载入…</p>}

      {items && items.length === 0 && (
        <div className="empty">
          <p className="empty-title">还没有修改记录</p>
          <p className="empty-hint">这道菜从建好之后没被改过（或者在改动记录功能上线之前改的）。</p>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="history-list">
          {items.map((item) => (
            <li key={item.historyId} className="history-item">
              <button
                type="button"
                className="history-main"
                onClick={() => navigate(`/recipe/${id}/history/${item.historyId}`)}
              >
                <span className="history-when">{savedAtText(item.savedAt)}</span>
                <span className="badge">{SOURCE_LABEL[item.source]}</span>
                {item.outcome !== "replaced" && <span className="badge">{OUTCOME_LABEL[item.outcome]}</span>}
                {item.note && <span className="history-note">{item.note}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RecipeHistoryVersionPage({
  id,
  historyId
}: {
  id: string;
  historyId: string;
}): React.JSX.Element {
  const [record, setRecord] = useState<RecipeHistoryRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setRecord(null);
    setError(null);

    fetchHistoryRecord(id, historyId, controller.signal)
      .then(setRecord)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "加载失败");
      });

    return () => controller.abort();
  }, [historyId, id]);

  const restore = (): void => {
    if (!record) return;
    if (
      !window.confirm(
        `把这道菜恢复成 ${savedAtText(record.savedAt)} 之前的那一版？\n（当前内容会进修改记录，可以再回退）`
      )
    ) {
      return;
    }

    setRestoring(true);
    setNotice(null);

    // 先拿**当前**文件的 revision：恢复也要过版本守卫
    fetchRecipe(id)
      .then((current) =>
        saveRecipe(id, {
          recipe: record.beforeRecipe,
          baseRevision: current.revision,
          note: `恢复到 ${savedAtText(record.savedAt)} 的版本`,
          source: "restore"
        })
      )
      .then(({ recipe }) => {
        // 步骤可能变了：清掉完成标记与计时，免得对错步
        removeStored(STORAGE_KEYS.stepsDone(recipe.id));
        navigate(`/recipe/${recipe.id}`);
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 409) {
          setNotice("这道菜刚又被改过（版本冲突），请重新打开这一版再恢复。");
          return;
        }
        if (cause instanceof ApiError) {
          setNotice(`${cause.message}（内容未变）`);
          return;
        }
        setNotice("没能确认恢复结果（请求中断）。请刷新页面查看当前内容。");
      })
      .finally(() => setRestoring(false));
  };

  const before = record?.beforeRecipe;

  return (
    <div className="page history-page">
      <div className="recipe-topbar">
        <button type="button" className="link-button" onClick={() => navigate(`/recipe/${id}/history`)}>
          ← 修改记录
        </button>
        <div className="topbar-controls">
          <button type="button" className="chip chip-active" disabled={!record || restoring} onClick={restore}>
            {restoring ? "恢复中…" : "恢复这一版"}
          </button>
        </div>
      </div>

      {error && <p className="notice notice-error">{error}</p>}
      {notice && <p className="notice notice-warn">{notice}</p>}
      {!record && !error && <p className="notice">正在载入…</p>}

      {record && before && (
        <>
          <h1 className="recipe-title">{before.name}</h1>
          <p className="empty-hint">
            这是 {savedAtText(record.savedAt)} 保存**之前**的那一版（只读）。
          </p>

          <p className="recipe-meta">
            <span className="badge badge-category">{before.category}</span>
            <span className="badge">{before.servings} 人份</span>
            <span className="badge">难度：{difficultyText(before.difficulty)}</span>
            {before.source && <span className="badge">来源：{before.source}</span>}
          </p>

          <section className="section">
            <h2 className="section-title">食材</h2>
            <ul className="ingredient-list">
              {before.ingredients.map((item, index) => (
                <li className="ingredient-item" key={`${item.name}-${index}`}>
                  <span className="ingredient-name">{item.name}</span>
                  <span className="ingredient-amount">
                    {item.amount === undefined ? "" : String(item.amount)}
                    {item.unit ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="section">
            <h2 className="section-title">步骤</h2>
            <ol className="step-list">
              {before.steps.map((step, index) => (
                <li className="step-item" key={`${index}-${step.text}`}>
                  <div className="step-card">
                    <div className="step-main">
                      <span className="step-index">{index + 1}</span>
                      <span className="step-content">
                        {step.title && <span className="step-title">{step.title}</span>}
                        <span className="step-text">{step.text}</span>
                      </span>
                    </div>
                    {(step.heat || step.minutes) && (
                      <div className="step-actions">
                        {step.heat && <span className="badge badge-heat">{step.heat}</span>}
                        {step.minutes !== undefined && <span className="badge">{step.minutes} 分钟</span>}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {before.tips && before.tips.length > 0 && (
            <section className="section">
              <h2 className="section-title">小贴士</h2>
              <ul className="tip-list">
                {before.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
