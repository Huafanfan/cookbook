import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { WorkshopError } from "../src/server/lib/workshop-errors.js";
import { normalizeWorkshopImage } from "../src/server/lib/workshop-image.js";

async function makePng(width: number, height: number): Promise<Uint8Array> {
  const png = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  }).png({ compressionLevel: 9 }).toBuffer();
  return new Uint8Array(png);
}

async function expectWorkshopError(promise: Promise<unknown>, code: string): Promise<WorkshopError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(WorkshopError);
    expect((error as WorkshopError).code).toBe(code);
    return error as WorkshopError;
  }
  throw new Error("expected WorkshopError");
}

describe("normalizeWorkshopImage", () => {
  it("checks image signatures and rejects unsupported or forged formats", async () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    await expectWorkshopError(normalizeWorkshopImage(gif), "workshop_image_unsupported");

    const forgedPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const error = await expectWorkshopError(normalizeWorkshopImage(forgedPng), "workshop_image_invalid");
    expect(error.message).not.toContain("sharp");
  });

  it("rejects original byte arrays above 10 MiB", async () => {
    const tooLarge = new Uint8Array(10 * 1024 * 1024 + 1);
    const error = await expectWorkshopError(normalizeWorkshopImage(tooLarge), "workshop_image_too_large");
    expect(error.statusCode).toBe(413);
  });

  it("rejects images above the 16-million-pixel decode boundary", async () => {
    const png = await makePng(4001, 4000);
    const error = await expectWorkshopError(normalizeWorkshopImage(png), "workshop_image_too_many_pixels");
    expect(error.statusCode).toBe(413);
    expect(error.message).toContain("1600 万像素");
  });

  it("decodes real PNG bytes and emits a valid metadata-free JPEG under 2 MiB", async () => {
    const png = await makePng(1200, 800);
    const result = await normalizeWorkshopImage(png);
    const metadata = await sharp(Buffer.from(result.normalized)).metadata();

    expect(result.mimeType).toBe("image/png");
    expect(result.normalized.byteLength).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect([...result.normalized.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(metadata.format).toBe("jpeg");
    expect(metadata.exif).toBeUndefined();
    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
    expect(result.bytes).toEqual(png);
  });

  it("does not accept a file path in place of in-memory image bytes", async () => {
    await expectWorkshopError(
      normalizeWorkshopImage("/tmp/recipe.png" as unknown as Uint8Array),
      "workshop_image_invalid"
    );
  });
});
