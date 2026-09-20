import { useEffect, useState } from "react";

interface RecipeCoverProps {
  /** 封面图 URL；null = 这道菜没有图 */
  src: string | null;
  /** 菜名：没有图时用首字当占位 */
  name: string;
  /**
   * `card`：卡片封面 —— 图片盖在首字色块上层，加载失败就露出色块，永远不出现破图。
   * `hero`：详情页头图 —— 没有图就不渲染这块；失败给一行提示（大图位置放个字母太怪）。
   */
  variant?: "card" | "hero";
  className?: string;
}

/**
 * 封面图（CB-007）。
 *
 * 失败的降级是**两层保险**：服务端只会在图片存在时给出 URL，但图片仍可能
 * 在运行期被删掉、链接失效、或在手机上加载失败 —— 那时必须退回占位，而不是破图。
 */
export function RecipeCover({
  src,
  name,
  variant = "card",
  className
}: RecipeCoverProps): React.JSX.Element | null {
  const [failed, setFailed] = useState(false);

  // 换了图片地址要允许重新尝试：失败状态不能"粘"住下一张图
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (variant === "hero") {
    if (!src) return null;
    if (failed) return <p className="notice notice-warn">封面图加载失败</p>;
    return (
      <img
        className={className ?? "recipe-hero"}
        src={src}
        alt=""
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={`cover${className ? ` ${className}` : ""}`}>
      <span className="cover-letter" aria-hidden="true">
        {name.slice(0, 1)}
      </span>
      {src && !failed && (
        <img
          className="cover-image"
          src={src}
          /* 列表可能很长：视口外的图片不下载 */
          loading="lazy"
          decoding="async"
          alt=""
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
