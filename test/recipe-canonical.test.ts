import { describe, expect, it } from "vitest";

import { canonicalRecipe, sameContent, semanticHash } from "../src/server/lib/recipe-canonical.js";
import { createRecipeSchema } from "../src/server/lib/schema.js";
import type { Recipe } from "../src/shared/types.js";

/**
 * CB-010 的基础件：语义投影/哈希 + `sourceRef` 的校验。
 *
 * 关键性质（写在这里免得以后被"顺手优化"掉）：
 * **我们补的 tag/厨具、以及应用维护的字段不参与语义哈希** ——
 * 否则导入后全部 369 道菜都会被判成"本地改过"，每次上游一更新就全要过 LLM。
 */

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "test-dish",
    name: "测试菜",
    category: "家常菜",
    difficulty: 1,
    servings: 2,
    ingredients: [{ name: "盐", amount: 2, unit: "g" }],
    steps: [{ text: "随便炒炒" }],
    ...overrides
  };
}

describe("canonicalRecipe / semanticHash", () => {
  it("内容相同 → 哈希相同（不受键顺序与空白影响）", () => {
    const a = makeRecipe({ summary: "  好吃  " });
    const b = makeRecipe({ summary: "好吃" });
    expect(semanticHash(a)).toBe(semanticHash(b));
    expect(sameContent(a, b)).toBe(true);
  });

  it("**我们补的 tag/厨具、来源说明、时间戳都不参与**（否则全会被判成本地改过）", () => {
    const imported = makeRecipe();
    const enriched = makeRecipe({
      tags: ["快手", "下饭"],
      equipment: ["炒锅"],
      equipmentAlternatives: [["炒锅", "砂锅"]],
      source: "HowToCook（Unlicense 公有领域）· 链接",
      sourceRef: { repo: "r", path: "p", baselineStatus: "matched" },
      createdAt: "2026-09-19",
      updatedAt: "2026-09-21"
    });

    expect(semanticHash(imported)).toBe(semanticHash(enriched));
    expect(sameContent(imported, enriched)).toBe(true);
  });

  it("内容真的变了 → 哈希不同（食材用量、步骤、顺序都算）", () => {
    const base = makeRecipe();

    expect(sameContent(base, makeRecipe({ name: "改过名" }))).toBe(false);
    expect(sameContent(base, makeRecipe({ servings: 3 }))).toBe(false);
    expect(sameContent(base, makeRecipe({ ingredients: [{ name: "盐", amount: 5, unit: "g" }] }))).toBe(false);
    expect(
      sameContent(
        base,
        makeRecipe({ steps: [{ text: "随便炒炒" }, { text: "多一步" }] })
      )
    ).toBe(false);
    // 顺序有意义（食材/步骤顺序就是做法顺序）
    expect(
      sameContent(
        makeRecipe({ steps: [{ text: "一" }, { text: "二" }] }),
        makeRecipe({ steps: [{ text: "二" }, { text: "一" }] })
      )
    ).toBe(false);
  });

  it("投影里确实没有那些本地字段", () => {
    const projection = canonicalRecipe(
      makeRecipe({
        tags: ["快手"],
        equipment: ["炒锅"],
        source: "出处",
        updatedAt: "2026-09-21",
        sourceRef: { repo: "r", path: "p", baselineStatus: "matched" }
      })
    );

    for (const key of ["tags", "equipment", "equipmentAlternatives", "source", "sourceRef", "updatedAt", "createdAt"]) {
      expect(Object.keys(projection)).not.toContain(key);
    }
    expect(projection.name).toBe("测试菜");
  });
});

describe("sourceRef 的运行时校验（schema.ts）", () => {
  const schema = createRecipeSchema();

  /** 故意用 `unknown` 入参：这里测的就是**运行时**校验，不该被类型挡住 */
  const parseSourceRef = (sourceRef: unknown) => schema.safeParse({ ...makeRecipe(), sourceRef });

  it("可以不带 sourceRef（手工菜）", () => {
    expect(schema.safeParse(makeRecipe()).success).toBe(true);
  });

  it("matched：只要 repo + path 就够", () => {
    const result = parseSourceRef({
      repo: "https://github.com/x/y",
      path: "汤/菜.md",
      baselineStatus: "matched"
    });
    expect(result.success).toBe(true);
  });

  it("verified：缺 commit / baselineHash / parserVersion 都要被拒（并指出缺哪个）", () => {
    const base: Record<string, unknown> = {
      repo: "https://github.com/x/y",
      path: "汤/菜.md",
      baselineStatus: "verified",
      baselineHash: "sha256:abc",
      parserVersion: "howtocook-parse@1",
      commit: "c2063eb"
    };

    expect(parseSourceRef(base).success).toBe(true);

    for (const missing of ["commit", "baselineHash", "parserVersion"]) {
      const broken = { ...base };
      delete broken[missing];
      const result = parseSourceRef(broken);
      expect(result.success, `缺 ${missing} 应被拒`).toBe(false);
      if (!result.success) expect(JSON.stringify(result.error.issues)).toContain(missing);
    }
  });

  it("baselineStatus 只能是 matched / verified；path 不能为空", () => {
    expect(parseSourceRef({ repo: "r", path: "p", baselineStatus: "unknown" }).success).toBe(false);
    expect(parseSourceRef({ repo: "r", path: "", baselineStatus: "matched" }).success).toBe(false);
  });
});
