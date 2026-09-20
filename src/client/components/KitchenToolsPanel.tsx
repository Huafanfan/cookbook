import { useState } from "react";

import { setAllMyTools, toggleMyTool } from "../lib/kitchen";

interface KitchenToolsPanelProps {
  /** 厨具权威词表（来自 /api/meta） */
  available: string[];
  /** 我有的厨具 */
  tools: string[];
  /** 词表载入失败的原因 */
  problem: string | null;
  /** 用更新函数修改（连续调不会互相覆盖）；返回是否保存成功 */
  apply: (updater: (tools: string[]) => string[]) => boolean;
}

/**
 * "我的厨具"面板（就地展开，不做弹窗）。
 *
 * 只能从词表里**勾选**，没有自由输入——厨具名必须统一，
 * 否则录入菜谱时"不粘锅"和"煎锅"永远匹配不上（见 CB-002 规格）。
 */
export function KitchenToolsPanel({
  available,
  tools,
  problem,
  apply
}: KitchenToolsPanelProps): React.JSX.Element {
  const [saveFailed, setSaveFailed] = useState(false);

  /** 提交并**如实反馈保存结果**：隐私模式/配额满时不能让改动静默失效 */
  const commit = (updater: (current: string[]) => string[]): void => {
    setSaveFailed(!apply(updater));
  };

  return (
    <section className="kitchen-panel" aria-label="我的厨具">
      <div className="kitchen-panel-head">
        <h3 className="kitchen-panel-title">我的厨具</h3>
        <p className="kitchen-panel-note">
          勾选你有的厨具。菜谱只能使用这份清单里的名字，所以不用担心对不上。
        </p>
      </div>

      {problem && <p className="notice notice-warn">{problem}</p>}

      {saveFailed && (
        <p className="notice notice-warn">
          这次改动没能保存（浏览器限制，如隐私模式），刷新后会恢复原样。
        </p>
      )}

      {available.length === 0 ? (
        <p className="kitchen-panel-empty">厨具清单未载入，无法勾选。</p>
      ) : (
        <>
          <div className="kitchen-bulk">
            <button
              type="button"
              className="chip chip-small"
              onClick={() => commit(() => setAllMyTools(available, true))}
            >
              全选
            </button>
            <button
              type="button"
              className="chip chip-small"
              onClick={() => commit(() => setAllMyTools(available, false))}
            >
              全不选
            </button>
            <span className="kitchen-count">已选 {tools.length} 件</span>
          </div>

          <ul className="kitchen-list">
            {available.map((tool) => {
              const owned = tools.includes(tool);
              return (
                <li key={tool} className="kitchen-item">
                  <label className="kitchen-check">
                    <input
                      type="checkbox"
                      checked={owned}
                      onChange={() => commit((current) => toggleMyTool(current, tool))}
                    />
                    <span>{tool}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
