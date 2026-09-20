import type { RecipeMetaResponse } from "../../shared/types";

interface FilterBarProps {
  meta: RecipeMetaResponse | null;
  category?: string;
  tag?: string;
  onSelectCategory: (category: string | undefined) => void;
  onSelectTag: (tag: string | undefined) => void;
}

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
      <div className="filter-row">
        {meta.categories.map((item) => (
          <button
            key={item}
            type="button"
            className={`chip${category === item ? " chip-active" : ""}`}
            onClick={() => onSelectCategory(category === item ? undefined : item)}
          >
            {item}
          </button>
        ))}
      </div>

      {meta.tags.length > 0 && (
        <div className="filter-row filter-row-tags">
          {meta.tags.map((item) => (
            <button
              key={item}
              type="button"
              className={`chip chip-tag${tag === item ? " chip-active" : ""}`}
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
