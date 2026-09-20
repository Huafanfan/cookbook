/**
 * 计时到点的提醒：响铃 + 震动。
 *
 * 响铃用 Web Audio 现场合成，不引入音频文件。
 *
 * **iOS 的关键约束**：AudioContext 必须在用户手势里创建或 `resume()`，否则会被挂起（静音）。
 * 因此分两步：
 * 1. 用户点【计时】时调 `primeTimerAudio()`（在用户手势内），把上下文唤醒；
 * 2. 到点时 `playTimerAlert()` 复用同一个上下文发声，并**如实返回是否真的在运行**。
 */

type AudioContextConstructor = typeof AudioContext;

let sharedContext: AudioContext | null = null;

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  const scope = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? scope.webkitAudioContext;
}

function getContext(): AudioContext | null {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) return null;

  if (!sharedContext || sharedContext.state === "closed") {
    try {
      sharedContext = new AudioContextCtor();
    } catch {
      return null;
    }
  }

  return sharedContext;
}

/**
 * 在**用户手势**里调用（点计时按钮时）。
 * iOS 上不先唤醒，到点那一刻再创建/恢复上下文是发不出声音的。
 */
export function primeTimerAudio(): void {
  const context = getContext();
  if (!context) return;
  if (context.state === "suspended") void context.resume();
}

/** 三声短提示音；**返回是否真的在运行**（不是"构造函数存在"） */
export function playTimerAlert(): boolean {
  const context = getContext();
  if (!context) return false;

  if (context.state === "suspended") {
    void context.resume();
    // 恢复是异步的：本次不一定来得及，如实返回 false，由界面退回视觉提示
    return false;
  }

  try {
    const start = context.currentTime;

    for (let index = 0; index < 3; index += 1) {
      const at = start + index * 0.36;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(index === 2 ? 1180 : 880, at);

      // 短促的哔声：快速起音、快速衰减，避免糊在一起
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.3);
    }

    return context.state === "running";
  } catch {
    return false;
  }
}

/** 震动（不支持的设备静默跳过） */
export function vibratePattern(): void {
  try {
    navigator.vibrate?.([220, 120, 220, 120, 320]);
  } catch {
    // 某些实现会在权限受限时抛错，忽略即可
  }
}

/** 到点提醒：响铃 + 震动，**返回是否真的发出声音**（界面据此决定是否额外提示） */
export function alertTimerFinished(): boolean {
  vibratePattern();
  return playTimerAlert();
}
