import { useEffect, useRef, useState } from "react";

import type { RecipeListResponse, RecipeSummary, SearchParams } from "../../shared/types";
import { FilterBar } from "../components/FilterBar";
import { KitchenToolsPanel } from "../components/KitchenToolsPanel";
import { RecipeCard } from "../components/RecipeCard";
import { SearchBar } from "../components/SearchBar";
import { buildQuery, fetchRecipes } from "../lib/api";
import { replaceQuery } from "../lib/router";
import { readStored, STORAGE_KEYS } from "../lib/storage";
import { useMeta } from "../lib/use-meta";
import { useMyKitchen } from "../lib/use-kitchen";

/** 稳定的空数组，避免每次渲染都换引用 */
const NO_TOOLS: string[] = [];
/** 只选仓库里已有成品图的菜；失效时自动略过，不造图。 */
const FEATURED_IDS = ["you-men-da-xia", "gan-guo-hua-cai", "yu-xiang-qie-zi"];

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
  const kitchen = useMyKitchen({
    available: meta?.equipment ?? NO_TOOLS,
    defaultOwned: meta?.defaultOwned ?? NO_TOOLS
  });
  const restoredScroll = useRef(false);

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
  const featured: RecipeSummary[] = hasQuery
    ? []
    : FEATURED_IDS.flatMap((id) => {
        const item = items.find((recipe) => recipe.id === id);
        return item?.coverImage ? [item] : [];
      });

  return (
    <div className="page home-page">
      <header className="home-header">
        <h1 className="home-brand">今天吃什么</h1>
        <SearchBar value={keyword} onChange={setKeyword} />
        <button
          type="button"
          className="home-kitchen-button"
          aria-expanded={kitchenPanelOpen}
          onClick={() => setKitchenPanelOpen((open) => !open)}
        >
          我的厨具
        </button>
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

      {featured.length > 0 && (
        <section className="featured-section" aria-labelledby="featured-title">
          <h2 id="featured-title">今晚，做点好吃的</h2>
          <ul className="featured-list">
            {featured.map((item) => (
              <RecipeCard
                key={item.id}
                recipe={item}
                variant="featured"
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
    </div>
  );
}
