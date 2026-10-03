import { useEffect, useRef, useState } from "react";

import type { DailyMenuResponse, RecipeListResponse, SearchParams } from "../../shared/types";
import { FilterBar } from "../components/FilterBar";
import { KitchenToolsPanel } from "../components/KitchenToolsPanel";
import { RecipeCard } from "../components/RecipeCard";
import { SearchBar } from "../components/SearchBar";
import { buildQuery, fetchDailyMenu, fetchRecipes } from "../lib/api";
import { navigate, replaceQuery } from "../lib/router";
import { readStored, STORAGE_KEYS } from "../lib/storage";
import { useMeta } from "../lib/use-meta";
import { useMyKitchen } from "../lib/use-kitchen";

/** 稳定的空数组，避免每次渲染都换引用 */
const NO_TOOLS: string[] = [];

function readInitialParams(): SearchParams {
  const search = new URLSearchParams(window.location.search);
  return {
    q: search.get("q")?.trim() || undefined,
    category: search.get("category")?.trim() || undefined,
    tag: search.get("tag")?.trim() || undefined
  };
}

export function HomePage(): React.JSX.Element {
  const [initial] = useState<SearchParams>(readInitialParams);
  const [keyword, setKeyword] = useState(initial.q ?? "");
  const [params, setParams] = useState<SearchParams>(initial);
  const { meta, failed: metaFailed } = useMeta();
  const [data, setData] = useState<RecipeListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [kitchenPanelOpen, setKitchenPanelOpen] = useState(false);
  const [dailyMenu, setDailyMenu] = useState<DailyMenuResponse | null>(null);
  const [menuFailed, setMenuFailed] = useState(false);
  const kitchen = useMyKitchen({
    available: meta?.equipment ?? NO_TOOLS,
    defaultOwned: meta?.defaultOwned ?? NO_TOOLS
  });
  const restoredScroll = useRef(false);

  // 菜单接口只读；更新中短暂轮询，回到页面时读取服务端的新菜单。
  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let pending = false;
    const load = async (): Promise<void> => {
      if (pending || controller.signal.aborted) return;
      window.clearTimeout(timer);
      pending = true;
      try {
        const response = await fetchDailyMenu(controller.signal);
        if (controller.signal.aborted) return;
        setDailyMenu(response);
        setMenuFailed(false);
        if (response.status === "updating") timer = window.setTimeout(() => { void load(); }, 2500);
      } catch {
        if (!controller.signal.aborted) setMenuFailed(true);
      } finally {
        pending = false;
      }
    };
    const onVisible = (): void => { if (!document.hidden) void load(); };
    void load();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // 输入防抖 150ms 后再发起搜索
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setParams((previous) =>
        previous.q === (keyword || undefined) ? previous : { ...previous, q: keyword || undefined }
      );
    }, 150);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  // 搜索/筛选状态写入地址栏，从详情页返回时能原样恢复
  useEffect(() => {
    replaceQuery(buildQuery(params));
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetchRecipes(params, controller.signal)
      .then((response) => {
        setData(response);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [params]);

  // 从详情页返回时恢复滚动位置（等列表渲染完成后再滚）
  useEffect(() => {
    if (restoredScroll.current || !data) return;
    restoredScroll.current = true;
    const saved = Number(readStored(STORAGE_KEYS.homeScroll) ?? "0");
    if (saved > 0) window.scrollTo(0, saved);
  }, [data]);

  // 词表载入成功才算"能判断"；载入失败/仍在载入时不给厨具结论
  const catalogReady = Boolean(meta?.equipment.length);
  const items = data?.items ?? [];
  const hasQuery = Boolean(params.q || params.category || params.tag);
  const menuItems = dailyMenu?.items ?? [];
  const menuDate = dailyMenu?.menuDate;
  const menuDateLabel = menuDate ? `${Number(menuDate.slice(5, 7))}月${Number(menuDate.slice(8, 10))}日` : "家常搭配";

  return (
    <div className="page home-page">
      <header className="home-header">
        <h1 className="home-brand">今天吃什么</h1>
        <SearchBar value={keyword} onChange={setKeyword} />
        <div className="home-header-actions">
          <button
            type="button"
            className="home-icon-button home-kitchen-button"
            aria-label="我的厨具"
            aria-expanded={kitchenPanelOpen}
            onClick={() => setKitchenPanelOpen((open) => !open)}
          >
            <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
              <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="m8 5 4 4M5 8l4 4M6.5 6.5l5 5M12 9l-3 3c-1.1 1.1-2.9 1.1-4 0L3 10M10.5 10.5 25 25" />
                <path d="M22 4c-3 1-5.3 4.4-4.5 6.7.4 1.1 1.7 1.8 2.8 1.7 1.4-.1 3.2-1.8 4.8-4.1C26.8 5.9 25 3 22 4ZM19 12 6 25" />
              </g>
            </svg>
            <span className="home-icon-tooltip" aria-hidden="true">我的厨具</span>
          </button>
          <button
            type="button"
            className="home-icon-button home-workshop-button"
            aria-label="创意工坊"
            onClick={() => navigate("/workshop")}
          >
            <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
              <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17h18l-1.1 7.1a3 3 0 0 1-3 2.5h-9.8a3 3 0 0 1-3-2.5L7 17Z" />
                <path d="M4 18.5h3.2M24.8 18.5H28M8.5 13.8h15M13 13.8v-1.2a3 3 0 0 1 6 0v1.2M10.5 6.5v2" />
              </g>
              <path
                d="m24 3 .9 2.7 2.6.8-2.6.9L24 10l-.9-2.6-2.6-.9 2.6-.8L24 3Z"
                fill="#d3a330"
              />
            </svg>
            <span className="home-icon-tooltip" aria-hidden="true">创意工坊</span>
          </button>
        </div>
      </header>

      {kitchenPanelOpen && (
        <KitchenToolsPanel
          available={meta?.equipment ?? NO_TOOLS}
          tools={kitchen.tools}
          problem={
            meta?.equipmentProblem ??
            (metaFailed ? "厨具清单载入失败，刷新页面重试。" : null)
          }
          syncFailed={kitchen.syncFailed}
          migrateFailed={kitchen.migrateFailed}
          apply={kitchen.apply}
        />
      )}

      {!hasQuery && (
        <section className="featured-section daily-menu-section" aria-labelledby="featured-title">
          <div className="daily-menu-heading">
            <h2 id="featured-title">今晚，做点好吃的</h2>
            {menuItems.length > 0 && <p>{menuDateLabel} · 2人餐</p>}
          </div>
          {dailyMenu?.status === "updating" && <p className="daily-menu-notice" role="status">今日搭配准备中</p>}
          {menuItems.length === 0 && <p className="daily-menu-notice">{menuFailed ? "今日搭配暂时没准备好，先逛逛菜谱吧。" : dailyMenu ? "再添些家常菜，就能配齐一桌。" : "正在准备搭配…"}</p>}
          <ul className="daily-menu-list">
            {menuItems.map((item) => (
              <RecipeCard
                key={item.recipe.id}
                recipe={item.recipe}
                variant="daily"
                dailyRole={item.role}
                myTools={kitchen.tools}
                catalogReady={catalogReady}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="browse-section" aria-labelledby="browse-title">
        <div className="browse-heading">
          <h2 id="browse-title">{hasQuery ? "找到的菜" : "家常菜谱"}</h2>
          <p>{data ? `共 ${data.total} 道` : "正在载入…"}</p>
        </div>
        <FilterBar
          meta={meta}
          category={params.category}
          tag={params.tag}
          onSelectCategory={(category) => setParams((previous) => ({ ...previous, category }))}
          onSelectTag={(tag) => setParams((previous) => ({ ...previous, tag }))}
        />

        {data && data.skipped.length > 0 && (
          <p className="notice notice-warn">
            有 {data.skipped.length} 个菜谱文件未载入：{data.skipped.join("、")}
          </p>
        )}

        {error && <p className="notice notice-error">{error}</p>}

        {loading && !data && <p className="notice">正在载入…</p>}

        {data && items.length === 0 && (
          <div className="empty">
            <p className="empty-title">没有找到符合条件的菜</p>
            <p className="empty-hint">
              {hasQuery ? "试试搜食材名（比如「鸡蛋」），或清空筛选条件" : "还没有菜谱，稍后再来看看"}
            </p>
            {hasQuery && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setKeyword("");
                  setParams({});
                }}
              >
                清空搜索与筛选
              </button>
            )}
          </div>
        )}

        <ul className="recipe-grid">
          {items.map((item) => (
            <RecipeCard
              key={item.id}
              recipe={item}
              keyword={params.q}
              myTools={kitchen.tools}
              catalogReady={catalogReady}
            />
          ))}
        </ul>
      </section>
      <footer className="image-credits-footer">
        <a href="/image-credits.html">图片来源与许可</a>
      </footer>
    </div>
  );
}
