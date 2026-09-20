/**
 * 计时：只做两件事——算剩余时间、格式化显示。
 *
 * 剩余时间**基于目标时间戳**而不是自增计数：息屏、切到别的 App、
 * 浏览器降频都不会让倒计时走偏。
 */

export interface RunningTimer {
  /** 对应第几步（0 基） */
  stepIndex: number;
  /** 结束时刻（epoch 毫秒） */
  endsAt: number;
  /** 该步骤的名称，用于吸顶条显示 */
  label: string;
}

/** 剩余秒数：向上取整，且永不为负 */
export function remainingSeconds(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** `09:05`；超过一小时显示 `1:02:03` */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(rest).padStart(2, "0");

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 由分钟数得到结束时刻 */
export function endsAtFromMinutes(minutes: number, now: number): number {
  return now + Math.max(0, minutes) * 60_000;
}

/** 进度比例（0–1），用于进度环/进度条 */
export function timerProgress(totalSeconds: number, remaining: number): number {
  if (totalSeconds <= 0) return 0;
  const done = totalSeconds - remaining;
  return Math.min(1, Math.max(0, done / totalSeconds));
}
