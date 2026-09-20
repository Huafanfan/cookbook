import type { RecipeMetaResponse } from "../../shared/types";

interface FilterBarProps {
  meta: RecipeMetaResponse | null;
  category?: string;
  tag?: string;
  onSelectCategory: (category: string | undefined) => void;
  onSelectTag: (tag: string | undefined) => void;
}

/**
 * 两行筛选：**分类**（单值，一道菜只属于一个）与**标签**（多值，一道菜可以有多个）。
 *
 * 两行都加了文字标签——以前两行长得一样，容易被当成同一类东西
 * （用户反馈"分了很多 tag，但好几个都是空的"，部分原因是分不清这两行）。
 */
export function FilterBar({
  meta,
  category,
  tag,
  onSelectCategory,
  onSelectTag
}: FilterBarProps): React.JSX.Element | null {
  if (!meta || (meta.categories.length === 0 && meta.tags.length === 0)) return null;

  return (
    <div className="filter-bar">
      {meta.categories.length > 0 && (
        <div className="filter-row">
          <span className="filter-label">分类</span>
          {meta.categories.map((item) => (
            <button
              key={item}
              type="button"
              className={`chip${category === item ? " chip-active" : ""}`}
              aria-pressed={category === item}
              onClick={() => onSelectCategory(category === item ? undefined : item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {meta.tags.length > 0 && (
        <div className="filter-row filter-row-tags">
          <span className="filter-label">标签</span>
          {meta.tags.map((item) => (
            <button
              key={item}
              type="button"
              className={`chip chip-tag${tag === item ? " chip-active" : ""}`}
              aria-pressed={tag === item}
              onClick={() => onSelectTag(tag === item ? undefined : item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
