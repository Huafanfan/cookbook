import { useEffect, useState } from "react";

/**
 * 屏幕常亮。
 *
 * 用 Screen Wake Lock API；局域网 http 属于非安全上下文，浏览器会直接拒绝，
 * 属于预期情况——界面据此提示"不支持"，功能照常可用（见 CB-001 §5 降级）。
 */

export type WakeLockStatus =
  /** 浏览器没有这个 API */
  | "unsupported"
  /** 用户关掉了开关 */
  | "off"
  /** 正在保持常亮 */
  | "active"
  /** 申请被拒绝（非安全上下文、省电模式、无用户交互等） */
  | "denied";

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
}

interface WakeLockLike {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
}

function getWakeLock(): WakeLockLike | undefined {
  const navigatorWithWakeLock = navigator as Navigator & { wakeLock?: WakeLockLike };
  return navigatorWithWakeLock.wakeLock;
}

export function useWakeLock(enabled: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>(() =>
    getWakeLock() ? "off" : "unsupported"
  );

  useEffect(() => {
    const wakeLock = getWakeLock();

    if (!wakeLock) {
      setStatus("unsupported");
      return;
    }

    if (!enabled) {
      setStatus("off");
      return;
    }

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const request = async (): Promise<void> => {
      try {
        const acquired = await wakeLock.request("screen");
        if (cancelled) {
          await acquired.release().catch(() => undefined);
          return;
        }
        sentinel = acquired;
        setStatus("active");
        acquired.addEventListener("release", () => {
          // 页面切到后台时浏览器会**正常**释放，这不是"被拒"；回到前台会重新申请
          sentinel = null;
          if (!cancelled) setStatus("off");
        });
      } catch {
        if (!cancelled) setStatus("denied");
      }
    };

    void request();

    // 页面切到后台时浏览器会自动释放，回到前台要重新申请。
    // 注意条件方向：**还持有**（sentinel 存在且未 released）时才跳过，否则要重新申请。
    const onVisibilityChange = (): void => {
      if (document.visibilityState !== "visible") return;
      if (sentinel !== null && !sentinel.released) return;
      void request();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const current = sentinel;
      sentinel = null;
      // release() 在已释放/权限变化时会 reject，属正常，不该冒成未处理拒绝
      if (current) void current.release().catch(() => undefined);
    };
  }, [enabled]);

  return status;
}
