import { describe, expect, it } from "vitest";

import { buildMedia, matchImageFiles } from "../src/server/lib/image-media.js";

describe("matchImageFiles", () => {
  it("认出封面与步骤图", () => {
    const slots = matchImageFiles(["cover.jpg", "step-1.jpg", "step-12.jpg"]);

    expect(slots.coverFile).toBe("cover.jpg");
    expect([...slots.stepFiles]).toEqual([
      [1, "step-1.jpg"],
      [12, "step-12.jpg"]
    ]);
    expect(slots.unknownFiles).toEqual([]);
  });

  it("白名单外的名字一律不认：不猜、不兼容其他扩展名、不看大小写", () => {
    const names = [
      ".DS_Store",
      "IMG_0001.jpg",
      "cover.jpeg",
      "cover.png",
      "notes.md",
      "step-0.jpg",
      "step-2.JPG"
    ];

    const slots = matchImageFiles(names);

    expect(slots.coverFile).toBeNull();
    expect(slots.stepFiles.size).toBe(0);
    expect(slots.unknownFiles).toEqual([...names].sort());
  });

  it("同一槽位有多个候选时结果确定（按码点取第一个，其余进 unknown）", () => {
    const slots = matchImageFiles(["step-1.jpg", "step-01.jpg"]);

    expect([...slots.stepFiles]).toEqual([[1, "step-01.jpg"]]);
    expect(slots.unknownFiles).toEqual(["step-1.jpg"]);
  });
});

describe("buildMedia", () => {
  it("stepImages 与步骤数等长，缺图那项是 null", () => {
    const built = buildMedia("ke-le-ji-chi", matchImageFiles(["cover.jpg", "step-2.jpg"]), 3);

    expect(built.media).toEqual({
      coverImage: "/images/ke-le-ji-chi/cover.jpg",
      stepImages: [null, "/images/ke-le-ji-chi/step-2.jpg", null]
    });
    expect(built.warnings).toEqual([]);
  });

  it("没有图片时 cover 为 null、stepImages 全是 null", () => {
    const built = buildMedia("dan-chao-fan", matchImageFiles([]), 2);

    expect(built.media.coverImage).toBeNull();
    expect(built.media.stepImages).toEqual([null, null]);
    expect(built.warnings).toEqual([]);
  });

  it("越界的步骤图不生成 URL（不能给出必然 404 的地址），并给出警告", () => {
    const built = buildMedia("xiao-cai", matchImageFiles(["step-9.jpg"]), 2);

    expect(built.media.stepImages).toEqual([null, null]);
    expect(built.warnings[0]).toContain("第 9 步不存在");
    expect(built.warnings[0]).toContain("共 2 步");
  });

  it("认不出的文件名给出可定位的警告", () => {
    const built = buildMedia("xiao-cai", matchImageFiles(["cover.png"]), 1);

    expect(built.media.coverImage).toBeNull();
    expect(built.warnings[0]).toContain("cover.png");
    expect(built.warnings[0]).toContain("只认 cover.jpg");
  });
});
