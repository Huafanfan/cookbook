import { useEffect, useMemo, useState } from "react";

import type { Step } from "../../shared/types";
import { alertTimerFinished, primeTimerAudio } from "../lib/alert";
import { readStored, STORAGE_KEYS, writeStored } from "../lib/storage";
import { endsAtFromMinutes, formatClock, remainingSeconds, type RunningTimer } from "../lib/timer";
import { StepCard, type StepTimerState } from "./StepCard";

interface StepListProps {
  recipeId: string;
  steps: Step[];
  /** 步骤配图（CB-007）：与 steps 等长，无图那项为 null；缺省视为全无图 */
  stepImages?: (string | null)[];
}

/**
 * 读取已完成步骤索引。
 *
 * 必须清洗：sessionStorage 里可能残留**越界**（菜谱删掉了步骤）、**重复**或非整数
 * 的索引，直接使用会让"已完成 N/M"越界、进度条超过 100%。
 */
function readDoneSteps(recipeId: string, stepCount: number): number[] {
  const raw = readStored(STORAGE_KEYS.stepsDone(recipeId));
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (value): value is number =>
        typeof value === "number" && Number.isInteger(value) && value >= 0 && value < stepCount
    );
    return [...new Set(valid)];
  } catch {
    return [];
  }
}

export function StepList({
  recipeId,
  steps,
  stepImages
}: StepListProps): React.JSX.Element {
  const [done, setDone] = useState<number[]>(() => readDoneSteps(recipeId, steps.length));
  const [timer, setTimer] = useState<RunningTimer | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [alertingStep, setAlertingStep] = useState<number | null>(null);

  // 切换到另一道菜时重新读取状态
  useEffect(() => {
    setDone(readDoneSteps(recipeId, steps.length));
    setTimer(null);
    setAlertingStep(null);
  }, [recipeId]);

  useEffect(() => {
    writeStored(STORAGE_KEYS.stepsDone(recipeId), JSON.stringify(done));
  }, [recipeId, done]);

  // 计时中：每秒刷新一次"现在"（剩余时间由时间戳算出，息屏回来也是准的）
  useEffect(() => {
    if (!timer) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  // 到点：清掉计时器并提醒一次（页面在后台时，回到前台在这里补一次）
  useEffect(() => {
    if (!timer) return;
    if (remainingSeconds(timer.endsAt, now) > 0) return;

    setTimer(null);
    setAlertingStep(timer.stepIndex);
    alertTimerFinished();
  }, [timer, now]);

  const currentIndex = useMemo(() => {
    const index = steps.findIndex((_, position) => !done.includes(position));
    return index === -1 ? steps.length - 1 : index;
  }, [steps, done]);

  const allDone = done.length === steps.length;
  const remaining = timer ? remainingSeconds(timer.endsAt, now) : 0;
  const percent = steps.length > 0 ? (done.length / steps.length) * 100 : 0;

  const toggleDone = (index: number): void => {
    setDone((previous) =>
      previous.includes(index) ? previous.filter((value) => value !== index) : [...previous, index]
    );
  };

  const startTimer = (index: number, minutes: number): void => {
    // 必须在用户手势里唤醒音频上下文（iOS 上否则到点发不出声音）
    primeTimerAudio();
    setAlertingStep(null);
    setTimer({
      stepIndex: index,
      endsAt: endsAtFromMinutes(minutes, Date.now()),
      label: steps[index].title ?? `第 ${index + 1} 步`
    });
    setNow(Date.now());
  };

  const jumpToCurrent = (): void => {
    // 有到点提醒时优先跳到那一步（用户点吸顶条多半就是想知道哪步到点了）；
    // 全部完成时提示写的是"回到第一步"，就得真的回到第一步
    const target = alertingStep ?? (allDone ? 0 : currentIndex);
    document.getElementById(`step-${target}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  };

  const timerStateFor = (index: number): StepTimerState => {
    if (alertingStep === index) return "alerting";
    if (timer?.stepIndex === index) return "running";
    return "idle";
  };

  return (
    <section className="section" aria-labelledby="steps-title">
      <h2 className="section-title" id="steps-title">
        做法
        <span className="section-note">
          已完成 {done.length}/{steps.length}
        </span>
      </h2>

      {/* 吸顶：滚过头也能一键回到当前步 */}
      <div className="step-sticky">
        <div className="progress" role="presentation">
          <span className="progress-bar" style={{ width: `${percent}%` }} />
        </div>

        <button type="button" className="step-sticky-button" onClick={jumpToCurrent}>
          <span className="step-sticky-index">
            {currentIndex + 1}/{steps.length}
          </span>
          <span className="step-sticky-label">
            {allDone ? "全部完成" : (steps[currentIndex].title ?? `第 ${currentIndex + 1} 步`)}
          </span>
          {timer && <span className="badge badge-timer">计时 {formatClock(remaining)}</span>}
          {alertingStep !== null && (
            <span className="badge badge-timer">
              {steps[alertingStep].title ?? `第 ${alertingStep + 1} 步`} 已到点
            </span>
          )}
          <span className="step-sticky-hint">
            {alertingStep !== null ? "去看那一步" : allDone ? "回到第一步" : "回到当前步"}
          </span>
        </button>
      </div>

      <ol className="step-list">
        {steps.map((step, index) => (
          <li className="step-item" key={`${index}-${step.text}`} id={`step-${index}`}>
            <StepCard
              step={step}
              index={index}
              image={stepImages?.[index] ?? null}
              isDone={done.includes(index)}
              timerState={timerStateFor(index)}
              remaining={remaining}
              onToggleDone={() => toggleDone(index)}
              onStartTimer={() => startTimer(index, step.minutes ?? 0)}
              onStopTimer={() => {
                setTimer(null);
                setAlertingStep(null);
              }}
            />
          </li>
        ))}
      </ol>

      {done.length > 0 && (
        <button
          type="button"
          className="button button-quiet"
          onClick={() => {
            setDone([]);
            setAlertingStep(null);
          }}
        >
          重置完成状态
        </button>
      )}
    </section>
  );
}
