import sharp from "sharp";

import type { WorkshopImageResult } from "../../shared/types.js";
import { WorkshopError } from "./workshop-errors.js";

const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
const MAX_NORMALIZED_BYTES = 2 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;

// 工坊会处理 OCR 长图；限制原生线程和缓存，避免挤占现有应用内存。
sharp.concurrency(1);
sharp.cache(false);

function fail(statusCode: number, code: string, message: string): never {
  throw new WorkshopError(statusCode, code, message);
}

function sniffMimeType(bytes: Uint8Array): WorkshopImageResult["mimeType"] | null {
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.byteLength >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.byteLength >= 12
    && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function imageError(error: unknown): never {
  if (error instanceof WorkshopError) throw error;
  return fail(400, "workshop_image_invalid", "图片无法解码，请确认文件完整后重试");
}

/** 仅从内存字节解码 JPEG/PNG/WebP，输出纠正方向并去除元数据的 JPEG。 */
export async function normalizeWorkshopImage(bytes: Uint8Array): Promise<WorkshopImageResult> {
  if (!(bytes instanceof Uint8Array)) {
    return fail(400, "workshop_image_invalid", "图片内容无效");
  }
  if (bytes.byteLength === 0) return fail(400, "workshop_image_invalid", "图片内容为空");
  if (bytes.byteLength > MAX_ORIGINAL_BYTES) {
    return fail(413, "workshop_image_too_large", "单张原始图片不能超过 10 MiB");
  }
  const mimeType = sniffMimeType(bytes);
  if (!mimeType) return fail(415, "workshop_image_unsupported", "只支持 JPEG、PNG 或 WebP 图片");

  try {
    const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // 只读头部以获得真实尺寸，然后在任何像素解码前执行自有上限。
    const metadata = await sharp(input, { limitInputPixels: false, failOn: "error" }).metadata();
    if (metadata.format !== mimeType.slice("image/".length).replace("jpeg", "jpeg")) {
      return fail(415, "workshop_image_format_mismatch", "图片文件标记与实际格式不一致");
    }
    if (!metadata.width || !metadata.height) return fail(400, "workshop_image_invalid", "图片尺寸无法识别");
    const pixels = metadata.width * metadata.height;
    if (pixels > MAX_PIXELS) {
      return fail(413, "workshop_image_too_many_pixels", "图片超过 1600 万像素，请压缩或降低分辨率");
    }

    const swapsDimensions = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8;
    const displayWidth = swapsDimensions ? metadata.height : metadata.width;
    const displayHeight = swapsDimensions ? metadata.width : metadata.height;
    const qualities = [90, 86, 82, 78, 74, 70, 66, 62, 58, 54];
    let scale = 1;
    let lastLength = 0;

    for (let pass = 0; pass < 7; pass += 1) {
      const width = Math.max(1, Math.floor(displayWidth * scale));
      const height = Math.max(1, Math.floor(displayHeight * scale));
      for (const quality of qualities) {
        let pipeline = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate();
        if (scale < 1) {
          pipeline = pipeline.resize({
            width,
            height,
            fit: "inside",
            withoutEnlargement: true,
            kernel: sharp.kernel.lanczos3
          });
        }
        const output = await pipeline
          .jpeg({
            quality,
            mozjpeg: true,
            chromaSubsampling: "4:4:4",
            progressive: true,
            optimiseScans: true
          })
          .toBuffer();
        lastLength = output.byteLength;
        if (lastLength <= MAX_NORMALIZED_BYTES) {
          const normalizedMetadata = await sharp(output, { failOn: "error" }).metadata();
          if (!normalizedMetadata.width || !normalizedMetadata.height) {
            return fail(500, "workshop_image_encode_failed", "图片转换失败，请重新选择图片");
          }
          return {
            bytes: new Uint8Array(bytes),
            mimeType,
            normalized: new Uint8Array(output),
            width: normalizedMetadata.width,
            height: normalizedMetadata.height
          };
        }
      }
      const ratio = Math.sqrt(MAX_NORMALIZED_BYTES / lastLength);
      scale *= Math.min(0.88, Math.max(0.55, ratio * 0.94));
    }
    return fail(413, "workshop_image_cannot_fit", "图片无法在 2 MiB 内保留可读细节，请拆分长图或降低分辨率");
  } catch (error) {
    return imageError(error);
  }
}
