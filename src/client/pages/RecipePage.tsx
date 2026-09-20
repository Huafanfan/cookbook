import { useEffect, useState } from "react";

import type { Recipe } from "../../shared/types";
import { EquipmentRow } from "../components/EquipmentRow";
import { IngredientList } from "../components/IngredientList";
import { KitchenToolsPanel } from "../components/KitchenToolsPanel";
import { StepList } from "../components/StepList";
import { ApiError, fetchRecipe } from "../lib/api";
import { difficultyText, minutesText } from "../lib/format";
import { navigate } from "../lib/router";
import { servingNotice } from "../lib/scale";
import {
  readFlag,
  readStored,
  removeStored,
  STORAGE_KEYS,
  writeStored
} from "../lib/storage";
import { useMeta } from "../lib/use-meta";
import { useMyKitchen } from "../lib/use-kitchen";
import { useWakeLock, type WakeLockStatus } from "../lib/wake-lock";

/** 做菜时可选的几档字号（配合厨房场景：手上有油、距离远） */
const FONT_SCALES = [0.9, 1, 1.12, 1.25, 1.4];

/** 稳定的空数组，避免每次渲染都换引用 */
const NO_TOOLS: string[] = [];

function initialFontIndex(): number {
  const saved = Number(readStored(STORAGE_KEYS.fontScale) ?? "1");
  const index = FONT_SCALES.indexOf(saved);
  return index === -1 ? 1 : index;
}

function keepAwakeLabel(enabled: boolean, status: WakeLockStatus): string {
  if (status === "unsupported") return "常亮不可用";
  if (status === "denied") return "常亮被拒";
  if (!enabled) return "常亮 关";
  if (status === "active") return "常亮 开";
  return "常亮申请中";
}

/** 能力不可用时给出原因；能正常工作时返回 null，不制造噪音 */
function wakeLockExplanation(status: WakeLockStatus): string | null {
  if (status === "unsupported") {
    return "当前浏览器不支持保持常亮，建议手动关掉自动锁屏（不影响其他功能）。";
  }
  if (status === "denied") {
    return "浏览器拒绝了常亮请求（局域网 http 不是安全上下文，或处于省电模式）。建议手动关掉自动锁屏（不影响其他功能）。";
  }
  return null;
}

export function RecipePage({ id }: { id: string }): React.JSX.Element {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [fontIndex, setFontIndex] = useState(initialFontIndex);
  // 默认值按**能力**决定：http 非安全上下文下 Wake Lock 不存在，
  // 默认开等于每天提示一次"不可用"，纯噪音
  const [keepAwake, setKeepAwake] = useState(() =>
    readFlag(STORAGE_KEYS.keepAwake, typeof navigator !== "undefined" && "wakeLock" in navigator)
  );
  const [hint, setHint] = useState<string | null>(null);
  const [kitchenPanelOpen, setKitchenPanelOpen] = useState(false);
  /** 人数档位；null = 用菜谱基准份量 */
  const [servingsChoice, setServingsChoice] = useState<number | null>(null);
  const { meta, failed: metaFailed } = useMeta();
  const kitchen = useMyKitchen({
    available: meta?.equipment ?? NO_TOOLS,
    defaultOwned: meta?.defaultOwned ?? NO_TOOLS
  });

  const wakeStatus = useWakeLock(keepAwake && recipe !== null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setRecipe(null);
    setError(null);
    setHint(null);

    fetchRecipe(id, controller.signal)
      .then(setRecipe)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause : new Error("加载失败"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    window.scrollTo(0, 0);
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    writeStored(STORAGE_KEYS.fontScale, String(FONT_SCALES[fontIndex]));
  }, [fontIndex]);

  // 人数档位按菜谱记住
  useEffect(() => {
    if (!recipe) return;
    const stored = Number(readStored(STORAGE_KEYS.servings(recipe.id)) ?? "");
    setServingsChoice(Number.isFinite(stored) && stored > 0 ? stored : null);
  }, [recipe]);

  // 只要开着常亮且能力不可用，就给出原因；状态一变就更新（避免"第一次点没反应"）
  useEffect(() => {
    setHint(keepAwake ? wakeLockExplanation(wakeStatus) : null);
  }, [keepAwake, wakeStatus]);

  const goBack = (): void => {
    navigate(readStored(STORAGE_KEYS.homeUrl) ?? "/");
  };

  const toggleKeepAwake = (): void => {
    const next = !keepAwake;
    setKeepAwake(next);
    writeStored(STORAGE_KEYS.keepAwake, next ? "1" : "0");
    // 提示不在这里给：直接用切换前的 status 会答错，交给下面跟随状态变化的 effect
  };

  if (loading) {
    return (
      <div className="page">
        <p className="notice">正在载入…</p>
      </div>
    );
  }

  if (error || !recipe) {
    const notFound = error instanceof ApiError && error.status === 404;

    return (
      <div className="page">
        <button type="button" className="link-button" onClick={goBack}>
          ← 返回列表
        </button>
        <div className="empty">
          <p className="empty-title">{notFound ? "没有这道菜" : "加载失败"}</p>
          <p className="empty-hint">
            {notFound ? `菜谱 id「${id}」不存在，可能文件被改名或删除了` : error?.message}
          </p>
        </div>
      </div>
    );
  }

  const servings = servingsChoice ?? recipe.servings;
  const timeText = minutesText(recipe.prepMinutes, recipe.cookMinutes);

  return (
    <div
      className="page recipe-page"
      style={{ ["--recipe-scale" as string]: FONT_SCALES[fontIndex] }}
    >
      <div className="recipe-topbar">
        <button type="button" className="link-button" onClick={goBack}>
          ← 返回列表
        </button>

        <div className="topbar-controls">
          <button
            type="button"
            className={`chip chip-small${keepAwake && wakeStatus === "active" ? " chip-active" : ""}`}
            aria-pressed={keepAwake}
            onClick={toggleKeepAwake}
          >
            {keepAwakeLabel(keepAwake, wakeStatus)}
          </button>

          <div className="font-controls" role="group" aria-label="正文字号">
            <button
              type="button"
              className="font-button"
              aria-label="缩小字号"
              disabled={fontIndex === 0}
              onClick={() => setFontIndex((index) => Math.max(0, index - 1))}
            >
              A-
            </button>
            <button
              type="button"
              className="font-button"
              aria-label="放大字号"
              disabled={fontIndex === FONT_SCALES.length - 1}
              onClick={() => setFontIndex((index) => Math.min(FONT_SCALES.length - 1, index + 1))}
            >
              A+
            </button>
          </div>
        </div>
      </div>

      {hint && <p className="notice notice-warn">{hint}</p>}

      <header className="recipe-header">
        <h1 className="recipe-title">{recipe.name}</h1>
        {recipe.summary && <p className="recipe-summary">{recipe.summary}</p>}

        <p className="recipe-meta">
          <span className="badge badge-category">{recipe.category}</span>
          <span className="badge">{recipe.servings} 人份</span>
          <span className="badge">难度：{difficultyText(recipe.difficulty)}</span>
          {timeText && <span className="badge">{timeText}</span>}
        </p>

        <EquipmentRow
          recipe={recipe}
          myTools={kitchen.tools}
          kitchenConfigured={kitchen.configured}
          catalogReady={Boolean(meta?.equipment.length)}
          onOpenPanel={() => setKitchenPanelOpen((open) => !open)}
        />

        {kitchenPanelOpen && (
          <KitchenToolsPanel
            available={meta?.equipment ?? NO_TOOLS}
            tools={kitchen.tools}
            problem={
              meta?.equipmentProblem ??
              (metaFailed ? "厨具清单载入失败，刷新页面重试。" : null)
            }
            apply={kitchen.apply}
          />
        )}

        {recipe.aliases && recipe.aliases.length > 0 && (
          <p className="recipe-aliases">也叫：{recipe.aliases.join("、")}</p>
        )}
      </header>

      <IngredientList
        ingredients={recipe.ingredients}
        baseServings={recipe.servings}
        servings={servings}
        onServingsChange={(next) => {
          setServingsChoice(next === recipe.servings ? null : next);
          // 切回基准档位就清掉记录，不留"等于基准的选择"
          if (next === recipe.servings) removeStored(STORAGE_KEYS.servings(recipe.id));
          else writeStored(STORAGE_KEYS.servings(recipe.id), String(next));
        }}
      />

      <StepList
        recipeId={recipe.id}
        steps={recipe.steps}
        portionNotice={servingNotice(recipe.servings, servings)}
      />

      {recipe.tips && recipe.tips.length > 0 && (
        <section className="section" aria-labelledby="tips-title">
          <h2 className="section-title" id="tips-title">
            小贴士
          </h2>
          <ul className="tip-list">
            {recipe.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      )}

      {recipe.source && <p className="recipe-source">来源：{recipe.source}</p>}
    </div>
  );
}
