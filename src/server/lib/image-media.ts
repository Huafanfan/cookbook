import type { RecipeMedia } from "../../shared/types.js";

/**
 * 图片文件名 → 槽位的纯函数（CB-007）。
 *
 * 约定（docs/DATA_MODEL.md §4）：`data/images/<recipe-id>/` 下只认
 * `cover.jpg` 与 `step-<N>.jpg`（N 从 1 开始）。**不做扩展名兼容**：
 * 认不出来的名字要告警，而不是猜（猜错了就是"图放上去却不显示"）。
 *
 * 这里不碰文件系统：目录扫描在 recipe-repository.ts（唯一的数据访问入口）。
 */

const COVER_FILE = "cover.jpg";
const STEP_FILE = /^step-(\d+)\.jpg$/;

export interface ImageSlots {
  /** 封面文件名（没有则为 null） */
  coverFile: string | null;
  /** 步骤号（1 基）→ 文件名 */
  stepFiles: Map<number, string>;
  /** 认不出来的文件名，用于告警 */
  unknownFiles: string[];
}

/** 从目录里的文件名中挑出封面与步骤图（不改动入参） */
export function matchImageFiles(fileNames: readonly string[]): ImageSlots {
  const slots: ImageSlots = { coverFile: null, stepFiles: new Map(), unknownFiles: [] };

  // 显式按码点比较：同一槽位有多个候选时挑哪个必须是确定的，且不随 locale 变
  const byCodePoint = (a: string, b: string): number => {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  };

  for (const name of [...fileNames].sort(byCodePoint)) {
    if (name === COVER_FILE) {
      slots.coverFile = name;
      continue;
    }

    const step = STEP_FILE.exec(name);
    if (step) {
      const index = Number.parseInt(step[1], 10);
      // step-0.jpg 与 step-00.jpg 都无意义：步骤号从 1 开始
      if (index >= 1 && !slots.stepFiles.has(index)) {
        slots.stepFiles.set(index, name);
        continue;
      }
    }

    slots.unknownFiles.push(name);
  }

  return slots;
}

export interface BuiltMedia {
  media: RecipeMedia;
  /** 真正被采用的图片文件名（封面 + 范围内步骤图）；路由据此做白名单 */
  files: string[];
  /** 目录内的问题（文件名不认识、步骤号越界），由调用方补上目录名前缀 */
  warnings: string[];
}

function imageUrl(id: string, file: string): string {
  // id 只用小写字母/数字/连字符（schema 保证），encodeURIComponent 只是防御
  return `/images/${encodeURIComponent(id)}/${encodeURIComponent(file)}`;
}

/**
 * 把槽位变成接口用的 URL。
 *
 * 越界的步骤图（`step-9.jpg` 但只有 5 步）**不生成 URL**：宁可不显示，
 * 也不能给出一个必然 404 的地址。
 */
export function buildMedia(id: string, slots: ImageSlots, stepCount: number): BuiltMedia {
  const warnings: string[] = [];
  const files: string[] = [];

  for (const [index, file] of [...slots.stepFiles].sort(([a], [b]) => a - b)) {
    if (index > stepCount) {
      // 越界的步骤图：不生成 URL，也不进白名单（宁可不提供，也不给一个必然 404 的地址）
      warnings.push(
        `${file}：第 ${index} 步不存在（共 ${stepCount} 步），已忽略`
      );
      continue;
    }
    files.push(file);
  }

  for (const name of slots.unknownFiles) {
    warnings.push(`${name}：无法识别的文件名（只认 cover.jpg 与 step-<N>.jpg），已忽略`);
  }

  if (slots.coverFile) files.push(slots.coverFile);

  const stepImages: (string | null)[] = [];
  for (let index = 1; index <= stepCount; index += 1) {
    const file = slots.stepFiles.get(index);
    stepImages.push(file && index <= stepCount ? imageUrl(id, file) : null);
  }

  return {
    media: {
      coverImage: slots.coverFile ? imageUrl(id, slots.coverFile) : null,
      stepImages
    },
    files,
    warnings
  };
}
