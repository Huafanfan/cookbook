import { useState } from "react";

import { setAllMyTools, toggleMyTool } from "../lib/kitchen";

interface KitchenToolsPanelProps {
  /** 厨具权威词表（来自 /api/meta） */
  available: string[];
  /** 我有的厨具 */
  tools: string[];
  /** 词表载入失败的原因 */
  problem: string | null;
  /** 服务端用户状态没同步上（此时用的是默认清单） */
  syncFailed?: boolean;
  /** 旧本地值迁移失败（本地键还留着，下次打开再试） */
  migrateFailed?: boolean;
  /** 用更新函数修改（连续调不会互相覆盖）；返回是否保存成功 */
  apply: (updater: (tools: string[]) => string[]) => Promise<boolean>;
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
  syncFailed = false,
  migrateFailed = false,
  apply
}: KitchenToolsPanelProps): React.JSX.Element {
  const [saveFailed, setSaveFailed] = useState(false);

  /** 提交并**如实反馈保存结果**：离线/隐私模式/写盘失败时不能让改动静默失效 */
  const commit = (updater: (current: string[]) => string[]): void => {
    void apply(updater).then((saved) => setSaveFailed(!saved));
  };

  return (
    <section className="kitchen-panel" aria-label="我的厨具">
      <div className="kitchen-panel-head">
        <h3 className="kitchen-panel-title">我的厨具</h3>
        <p className="kitchen-panel-note">
          勾选你有的厨具。菜谱只能使用这份清单里的名字，所以不用担心对不上。
        </p>
        {/* 存在哪要说清楚：以前存浏览器本地，换网址就"丢了"；现在存服务端（CB-008） */}
        <p className="kitchen-panel-note">
          存在服务端（跟点赞、收藏一起），两口子共用一份：换手机、换网址、清缓存都在。
        </p>
      </div>

      {problem && <p className="notice notice-warn">{problem}</p>}

      {syncFailed && (
        <p className="notice notice-warn">
          厨具清单没从服务器同步上，现在用的是默认清单。刷新页面试试。
        </p>
      )}

      {migrateFailed && (
        <p className="notice notice-warn">
          这台设备浏览器里存的旧设置没能同步上（本地那份先留着），下次打开会自动再试一次。
        </p>
      )}

      {saveFailed && (
        <p className="notice notice-warn">
          这次改动没能保存（没能写到服务器），已恢复原状；刷新后看到的是服务器存的那份。
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
