import * as http from "node:http";

import { describe, expect, it, vi } from "vitest";

import type { WorkshopExtractOptions } from "../src/shared/types.js";
import { WorkshopError } from "../src/server/lib/workshop-errors.js";
import {
  extractWorkshopLink,
  isPublicWorkshopAddress,
  normalizeWorkshopUrl,
  parseWorkshopRecipeJson,
  requestOnePage
} from "../src/server/lib/source-extractor.js";

const publicAddress = { address: "93.184.216.34", family: 4 };

function options(
  requestPage: NonNullable<WorkshopExtractOptions["requestPage"]>,
  resolveHost: NonNullable<WorkshopExtractOptions["resolveHost"]> = async () => [publicAddress]
): WorkshopExtractOptions {
  return { resolveHost, requestPage };
}

async function workshopError(promise: Promise<unknown>, code: string): Promise<WorkshopError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(WorkshopError);
    expect((error as WorkshopError).code).toBe(code);
    return error as WorkshopError;
  }
  throw new Error("expected WorkshopError");
}

describe("workshop source URL and network bounds", () => {
  it("takes the shared URL from a pasted share sentence and rejects unsafe forms", () => {
    expect(normalizeWorkshopUrl("朋友分享：土豆汤 https://recipes.example/soup?from=share。")).toBe(
      "https://recipes.example/soup?from=share"
    );
    for (const url of [
      "http://127.0.0.1/admin",
      "http://127.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://[::ffff:7f00:1]/",
      "https://user:pass@example.com/recipe",
      "https://example.com:8443/recipe"
    ]) {
      expect(() => normalizeWorkshopUrl(url)).toThrow(WorkshopError);
    }
  });

  it("blocks private, mapped, documentation and reserved address ranges", () => {
    const blocked = [
      "0.0.0.0",
      "10.2.3.4",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.10.2",
      "172.31.0.1",
      "192.168.1.2",
      "192.0.2.12",
      "198.18.0.1",
      "198.51.100.10",
      "203.0.113.99",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "::ffff:192.168.1.2",
      "fe80::1",
      "fc00::1",
      "2001:db8::1",
      "2001:2::1",
      "2002:7f00:1::1",
      "3fff::1"
    ];
    for (const address of blocked) expect(isPublicWorkshopAddress(address), address).toBe(false);
    expect(isPublicWorkshopAddress("93.184.216.34")).toBe(true);
    expect(isPublicWorkshopAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("rejects a DNS answer set containing one private address before connecting", async () => {
    const requestPage = vi.fn(async () => ({ status: 200, headers: { "content-type": "text/plain" }, body: "no" }));
    const error = await workshopError(
      extractWorkshopLink("https://recipes.example/soup", options(
        requestPage,
        async () => [publicAddress, { address: "10.0.0.8", family: 4 }]
      )),
      "workshop_unsafe_url"
    );
    expect(error.statusCode).toBe(403);
    expect(requestPage).not.toHaveBeenCalled();
  });

  it("rechecks every redirect and blocks a public page redirecting to loopback", async () => {
    const requestPage = vi.fn(async () => ({
      status: 302,
      headers: { location: "http://127.0.0.1/private" },
      body: ""
    }));
    const error = await workshopError(
      extractWorkshopLink("https://recipes.example/soup", options(requestPage)),
      "workshop_unsafe_url"
    );
    expect(error.statusCode).toBe(403);
    expect(requestPage).toHaveBeenCalledTimes(1);
  });

  it("resolves and rechecks the host after a redirect to another public hostname", async () => {
    const resolveHost = vi.fn()
      .mockResolvedValueOnce([publicAddress])
      .mockResolvedValueOnce([{ address: "192.168.1.4", family: 4 }]);
    const requestPage = vi.fn(async () => ({
      status: 302,
      headers: { location: "https://redirect.example/recipe" },
      body: ""
    }));
    await workshopError(
      extractWorkshopLink("https://recipes.example/soup", options(requestPage, resolveHost)),
      "workshop_unsafe_url"
    );
    expect(resolveHost).toHaveBeenCalledTimes(2);
    expect(requestPage).toHaveBeenCalledTimes(1);
  });

  it("passes only the validated DNS address to the page connector", async () => {
    const requestPage = vi.fn(async (_url, address) => ({
      status: 200,
      headers: { "content-type": "text/markdown" },
      body: "# 土豆汤\n土豆加水煮熟。"
    }));
    const result = await extractWorkshopLink(
      "https://recipes.example/soup",
      options(requestPage, async () => [publicAddress])
    );
    expect(requestPage).toHaveBeenCalledWith(expect.any(URL), publicAddress, expect.any(AbortSignal));
    expect(result.text).toContain("土豆加水煮熟");
  });

  it("uses a pinned Node TCP family against a local server and keeps the original Host", async () => {
    let observedHost = "";
    const server = http.createServer((request, response) => {
      observedHost = request.headers.host ?? "";
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("transport-ok");
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("local test server did not bind");
      const url = new URL("http://recipes.example:" + address.port + "/article");
      const result = await requestOnePage(
        url,
        { address: "127.0.0.1", family: 4 },
        AbortSignal.timeout(2000)
      );
      expect(result.status).toBe(200);
      expect(result.body).toBe("transport-ok");
      expect(observedHost).toBe("recipes.example:" + address.port);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("rejects a page body above 2 MiB instead of silently truncating it", async () => {
    const requestPage = async () => ({
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "x".repeat(2 * 1024 * 1024 + 1)
    });
    const error = await workshopError(
      extractWorkshopLink("https://recipes.example/notes", options(requestPage)),
      "workshop_page_too_large"
    );
    expect(error.statusCode).toBe(413);
  });

  it("honors an already cancelled extraction signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const requestPage = vi.fn(async () => ({ status: 200, headers: {}, body: "unused" }));
    await workshopError(
      extractWorkshopLink("https://recipes.example/notes", { ...options(requestPage), signal: controller.signal }),
      "workshop_extract_cancelled"
    );
    expect(requestPage).not.toHaveBeenCalled();
  });
});

describe("workshop recipe extraction", () => {
  it("splits multiple JSON-LD recipes in @graph and keeps grouped instructions", async () => {
    const structuredData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Recipe",
          name: "土豆汤",
          recipeIngredient: ["300 g 土豆", "适量盐"],
          recipeYield: "Serves 2",
          recipeInstructions: [
            { "@type": "HowToSection", name: "准备", itemListElement: [
              { "@type": "HowToStep", name: "切菜", text: "土豆洗净并切块。" }
            ] },
            { "@type": "HowToSection", name: "炖煮", itemListElement: [
              { "@type": "HowToStep", text: "加水煮熟。" }
            ] }
          ]
        },
        {
          "@type": "Recipe",
          name: "凉拌黄瓜",
          recipeIngredient: ["1 根黄瓜"],
          recipeInstructions: ["拍碎后拌匀。"]
        }
      ]
    };
    const html = "<!doctype html><html><head><title>家庭菜谱</title>"
      + '<script type="application/ld+json">' + JSON.stringify(structuredData) + "</script>"
      + "</head><body><main><article><h1>两道家常菜</h1><p>按各自材料与步骤制作。</p></article></main></body></html>";
    const requestPage = async () => ({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: html
    });
    const result = await extractWorkshopLink("https://recipes.example/menu", options(requestPage));
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates?.[0].recipe.name).toBe("土豆汤");
    expect(result.candidates?.[0].recipe.servings).toBe(2);
    expect(result.candidates?.[0].recipe.ingredients?.[0]).toEqual({ name: "土豆", amount: "300", unit: "g" });
    expect(result.candidates?.[0].recipe.steps?.map((step) => step.title)).toEqual(["准备", "炖煮"]);
    expect(result.candidates?.[1].recipe.name).toBe("凉拌黄瓜");
  });

  it("保留现有 Recipe JSON 的可编辑字段，且只保留显式提供的时间", () => {
    const result = parseWorkshopRecipeJson(JSON.stringify({
      id: "original-recipe-id",
      sourceRef: { repo: "https://example.com/recipes", path: "soup.json", baselineStatus: "matched" },
      createdAt: "2020-01-01",
      updatedAt: "2020-01-02",
      name: "番茄土豆汤",
      aliases: ["番茄汤"],
      category: "汤",
      tags: ["下饭"],
      summary: "清爽的家常汤。",
      difficulty: 2,
      servings: 2,
      prepMinutes: 5,
      cookMinutes: 0,
      equipment: ["炒锅"],
      equipmentAlternatives: [["炒锅", "砂锅"]],
      ingredients: [{ name: "番茄", amount: 2, unit: "个", group: "汤底", note: "切块", ignored: true }],
      steps: [
        { title: "备料", text: "番茄切块。", minutes: 3, heat: "中火", tip: "先烧热锅。", ignored: true },
        { text: "加水煮至入味。" },
        { title: "调味", text: "加入盐。", minutes: 0 }
      ],
      tips: ["趁热食用。"],
      source: "家庭记录",
      ignored: "unknown field"
    }));
    const recipe = result.candidates[0].recipe as Record<string, unknown>;

    expect(recipe).toEqual({
      name: "番茄土豆汤",
      aliases: ["番茄汤"],
      category: "汤",
      tags: ["下饭"],
      summary: "清爽的家常汤。",
      difficulty: 2,
      servings: 2,
      prepMinutes: 5,
      cookMinutes: 0,
      equipment: ["炒锅"],
      equipmentAlternatives: [["炒锅", "砂锅"]],
      ingredients: [{ name: "番茄", amount: 2, unit: "个", group: "汤底", note: "切块" }],
      steps: [
        { title: "备料", text: "番茄切块。", minutes: 3, heat: "中火", tip: "先烧热锅。" },
        { text: "加水煮至入味。" },
        { title: "调味", text: "加入盐。", minutes: 0 }
      ],
      tips: ["趁热食用。"],
      source: "家庭记录"
    });
  });

  it("keeps a range or vague recipe yield unknown and strips protected Recipe fields", () => {
    const result = parseWorkshopRecipeJson(JSON.stringify({
      id: "original-recipe-id",
      name: "土豆汤",
      category: "汤",
      servings: "2-4 人份",
      sourceRef: { repo: "https://github.com/example/recipes", path: "soup.json", baselineStatus: "matched" },
      createdAt: "2020-01-01",
      updatedAt: "2020-01-02",
      ingredients: [{ name: "土豆", amount: "适量" }],
      steps: [{ text: "加水煮熟。" }]
    }), "s-123");
    const recipe = result.candidates[0].recipe as Record<string, unknown>;
    expect(recipe.servings).toBeUndefined();
    expect(recipe).not.toHaveProperty("id");
    expect(recipe).not.toHaveProperty("sourceRef");
    expect(recipe).not.toHaveProperty("createdAt");
    expect(recipe).not.toHaveProperty("updatedAt");
    expect(result.candidates[0].evidence.every((entry) => entry.sourceIds.includes("s-123"))).toBe(true);
  });

  it("returns no fabricated recipe when readable body and structured data are empty", async () => {
    const requestPage = async () => ({
      status: 200,
      headers: { "content-type": "text/html" },
      body: "<html><head><title>今日菜谱</title></head><body><nav>登录</nav></body></html>"
    });
    const result = await extractWorkshopLink("https://recipes.example/empty", options(requestPage));
    expect(result.title).toBe("今日菜谱");
    expect(result.text).toBe("");
    expect(result.candidates).toBeUndefined();
  });

  it("uses Readability text as fallback and does not execute page scripts", async () => {
    const html = "<!doctype html><html><head><title>番茄炒蛋</title></head><body>"
      + "<nav>导航噪声</nav><article><h1>番茄炒蛋做法</h1>"
      + "<p>准备两个鸡蛋与两个番茄。</p><p>鸡蛋炒熟后盛出，番茄炒软再混合。</p>"
      + "<p>加入盐并翻炒均匀即可。</p></article>"
      + "<script>document.body.append('不应执行的脚本内容')</script></body></html>";
    const requestPage = async () => ({
      status: 200,
      headers: { "content-type": "text/html" },
      body: html
    });
    const result = await extractWorkshopLink("https://recipes.example/tomato-egg", options(requestPage));
    expect(result.text).toContain("准备两个鸡蛋");
    expect(result.text).not.toContain("导航噪声");
    expect(result.text).not.toContain("不应执行");
    expect(result.candidates).toBeUndefined();
  });
});
