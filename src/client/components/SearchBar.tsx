interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps): React.JSX.Element {
  return (
    <div className="search-bar">
      <input
        className="search-input"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        placeholder="搜菜名、食材，如「西红柿」「鸡蛋」"
        aria-label="搜索菜谱"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button type="button" className="search-clear" aria-label="清空搜索" onClick={() => onChange("")}>
          ×
        </button>
      )}
    </div>
  );
}
