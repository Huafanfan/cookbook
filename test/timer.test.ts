import { describe, expect, it } from "vitest";

import {
  endsAtFromMinutes,
  formatClock,
  remainingSeconds,
  timerProgress
} from "../src/client/lib/timer.js";

describe("remainingSeconds", () => {
  it("按时间戳算剩余，向上取整", () => {
    expect(remainingSeconds(60_000, 0)).toBe(60);
    expect(remainingSeconds(90_500, 0)).toBe(91);
  });

  it("已过期返回 0 而不是负数（息屏回来也不会出现负计时）", () => {
    expect(remainingSeconds(0, 5000)).toBe(0);
    expect(remainingSeconds(1000, 60_000)).toBe(0);
  });

  it("跨息屏：时间戳不受暂停影响", () => {
    // 10 分钟计时，5 分钟后回来（期间页面被挂起，没有 tick）
    const endsAt = endsAtFromMinutes(10, 0);
    expect(remainingSeconds(endsAt, 5 * 60_000)).toBe(300);
    expect(remainingSeconds(endsAt, 11 * 60_000)).toBe(0);
  });
});

describe("formatClock", () => {
  it("分秒格式", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(59)).toBe("00:59");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(600)).toBe("10:00");
  });

  it("超过一小时带小时位", () => {
    expect(formatClock(3661)).toBe("1:01:01");
  });

  it("负数按 0 处理", () => {
    expect(formatClock(-5)).toBe("00:00");
  });
});

describe("endsAtFromMinutes", () => {
  it("按分钟换算结束时刻", () => {
    expect(endsAtFromMinutes(10, 1000)).toBe(1000 + 600_000);
  });

  it("负数分钟不退化成倒着跑", () => {
    expect(endsAtFromMinutes(-5, 1000)).toBe(1000);
  });
});

describe("timerProgress", () => {
  it("一半进度", () => {
    expect(timerProgress(600, 300)).toBe(0.5);
  });

  it("夹在 0–1 之间", () => {
    expect(timerProgress(600, 900)).toBe(0);
    expect(timerProgress(600, -5)).toBe(1);
  });

  it("总时长为 0 时不除零", () => {
    expect(timerProgress(0, 0)).toBe(0);
  });
});
