interface HighlightProps {
  text: string;
  keyword?: string;
}

/** 把命中的关键词包成 <mark>，让搜索结果一眼看到命中位置 */
export function Highlight({ text, keyword }: HighlightProps): React.JSX.Element {
  const needle = keyword?.replace(/\s+/g, "").trim();

  if (!needle) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: React.ReactNode[] = [];

  let cursor = 0;
  let index = lowerText.indexOf(lowerNeedle);

  while (index !== -1) {
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <mark key={`${index}-${parts.length}`}>{text.slice(index, index + needle.length)}</mark>
    );
    cursor = index + needle.length;
    index = lowerText.indexOf(lowerNeedle, cursor);
  }

  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
}
