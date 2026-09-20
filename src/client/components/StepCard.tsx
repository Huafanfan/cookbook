import { useEffect, useState } from "react";

import type { Step } from "../../shared/types";
import { formatClock, timerProgress } from "../lib/timer";

export type StepTimerState = "idle" | "running" | "alerting";

interface StepCardProps {
  step: Step;
  /** 0 基序号，显示时 +1 */
  index: number;
  /** 该步骤的配图 URL（CB-007）；没有图时传 null */
  image?: string | null;
  isDone: boolean;
  timerState: StepTimerState;
  /** 计时剩余秒数（仅 running 时有意义） */
  remaining: number;
  onToggleDone: () => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
}

/**
 * 单个步骤卡片。
 *
 * 结构上刻意把"标记完成"和"计时"拆成两个并列的按钮：
 * 嵌套 button 是非法 HTML，而且做菜时手滑点到计时却把步骤标成完成，很恼人。
 *
 * 已完成**不做折叠**（用户实测反馈：折叠会让页面跳动、找不到位置），
 * 只做灰化 + 划线，位置保持不变。
 */
export function StepCard({
  step,
  index,
  image,
  isDone,
  timerState,
  remaining,
  onToggleDone,
  onStartTimer,
  onStopTimer
}: StepCardProps): React.JSX.Element {
  const timable = typeof step.minutes === "number" && step.minutes > 0;

  return (
    <div className={`step-card${isDone ? " step-done" : ""}`}>
      <button type="button" className="step-main" aria-pressed={isDone} onClick={onToggleDone}>
        <span className="step-index">{index + 1}</span>
        <span className="step-content">
          {step.title && <span className="step-title">{step.title}</span>}
          <span className="step-text">{step.text}</span>
        </span>
        <span className="step-check" aria-hidden="true">
          {isDone ? "已做" : ""}
        </span>
      </button>

      {/* 步骤图刻意放在完成按钮**之外**：点图片不该把步骤标成完成 */}
      <StepImage src={image ?? null} index={index} />

      {(step.heat || timable) && (
        <div className="step-actions">
          {step.heat && <span className="badge badge-heat">{step.heat}</span>}

          {timable && timerState === "alerting" && (
            <button type="button" className="time-button time-button-alert" onClick={onStopTimer}>
              时间到 · 点我停止
            </button>
          )}

          {timable && timerState === "running" && (
            <button
              type="button"
              className="time-button time-button-running"
              aria-label="停止计时"
              onClick={onStopTimer}
            >
              <span className="time-button-clock">{formatClock(remaining)}</span>
              <span className="time-button-stop">停止</span>
              <span
                className="time-button-progress"
                style={{ width: `${timerProgress(step.minutes ?? 0, remaining / 60) * 100}%` }}
              />
            </button>
          )}

          {timable && timerState === "idle" && (
            <button type="button" className="time-button" onClick={onStartTimer}>
              ⏱ {step.minutes} 分钟
            </button>
          )}
        </div>
      )}

      {step.tip && <p className="step-tip">小提醒：{step.tip}</p>}
    </div>
  );
}

/**
 * 步骤配图（CB-007 §3.3）。
 *
 * 加载失败**不折叠**这块区域（固定 4:3 已占位，抽掉会让页面跳动），只把图换成一行提示；
 * 与打勾、计时完全无关，失败也不会影响它们。
 */
function StepImage({ src, index }: { src: string | null; index: number }): React.JSX.Element | null {
  const [failed, setFailed] = useState(false);

  // 换了图片地址要允许重新尝试（失败状态不能"粘"住下一张图）
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src) return null;

  return (
    <div className="step-image">
      {failed ? (
        <p className="step-image-hint">第 {index + 1} 步的配图加载失败</p>
      ) : (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
    </div>
  );
}
