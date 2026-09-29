import { useState } from "react";

import type { RecipeMetaResponse } from "../../shared/types";

interface FilterBarProps {
  meta: RecipeMetaResponse | null;
  category?: string;
  tag?: string;
  onSelectCategory: (category: string | undefined) => void;
  onSelectTag: (tag: string | undefined) => void;
}

/** 分类常显、标签按需展开；两类筛选仍独立叠加，由服务端执行。 */
export function FilterBar({
  meta,
  category,
  tag,
  onSelectCategory,
  onSelectTag
}: FilterBarProps): React.JSX.Element | null {
  const [tagsOpen, setTagsOpen] = useState(Boolean(tag));
  if (!meta || (meta.categories.length === 0 && meta.tags.length === 0)) return null;

  return (
    <div className="filter-bar">
      {meta.categories.length > 0 && (
        <div className="filter-row filter-row-categories" role="group" aria-label="分类">
          <button
            type="button"
            className={`category-button${!category ? " category-active" : ""}`}
            aria-pressed={!category}
            onClick={() => onSelectCategory(undefined)}
          >
            全部
          </button>
          {meta.categories.map((item) => (
            <button
              key={item}
              type="button"
              className={`category-button${category === item ? " category-active" : ""}`}
              aria-pressed={category === item}
              onClick={() => onSelectCategory(category === item ? undefined : item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      <div className="filter-secondary">
        {meta.tags.length > 0 && (
          <button
            type="button"
            className={`filter-toggle${tag ? " filter-toggle-active" : ""}`}
            aria-expanded={tagsOpen}
            aria-controls="tag-filters"
            onClick={() => setTagsOpen((open) => !open)}
          >
            {tag ? `标签：${tag}` : "筛选标签"}
            <span aria-hidden="true">{tagsOpen ? "−" : "+"}</span>
          </button>
        )}
        {(category || tag) && (
          <button
            type="button"
            className="filter-clear"
            onClick={() => {
              onSelectCategory(undefined);
              onSelectTag(undefined);
            }}
          >
            清除筛选
          </button>
        )}
      </div>
      {meta.tags.length > 0 && (
        <div
          className="filter-row filter-row-tags"
          id="tag-filters"
          role="group"
          aria-label="标签"
          hidden={!tagsOpen}
        >
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
