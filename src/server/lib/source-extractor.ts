import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as http from "node:http";
import * as https from "node:https";

import { Readability } from "@mozilla/readability";
// @ts-expect-error 当前项目采用 jsdom 运行时，不额外引入只用于其声明的类型依赖。
import { JSDOM } from "jsdom";

import type {
  WorkshopAnalysisResult,
  WorkshopCandidate,
  WorkshopExtractOptions,
  WorkshopExtractResult,
  WorkshopRecipeInput,
  WorkshopResolvedAddress as Address,
  WorkshopPageResponse as PageResponse
} from "../../shared/types.js";
import { workshopAnalysisSchema, workshopRecipeSchema } from "./schema.js";
import { WorkshopError } from "./workshop-errors.js";

const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_PAGE_TEXT = 40_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

function fail(statusCode: number, code: string, message: string): never {
  throw new WorkshopError(statusCode, code, message);
}

function ipv4Number(address: string): bigint | null {
  if (isIP(address) !== 4) return null;
  const octets = address.split(".").map(Number);
  return octets.reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);
}

function inIpv4Range(address: string, network: string, prefix: number): boolean {
  const value = ipv4Number(address);
  const base = ipv4Number(network);
  if (value === null || base === null) return false;
  const shift = BigInt(32 - prefix);
  return (value >> shift) === (base >> shift);
}

function parseIpv6(address: string): bigint | null {
  if (isIP(address) !== 6 || address.includes("%")) return null;
  let value = address.toLowerCase();
  const dottedTail = value.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dottedTail) {
    const ipv4 = ipv4Number(dottedTail[1]);
    if (ipv4 === null) return null;
    const high = Number((ipv4 >> 16n) & 0xffffn).toString(16);
    const low = Number(ipv4 & 0xffffn).toString(16);
    value = value.slice(0, -dottedTail[1].length) + high + ":" + low;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half: string): number[] => {
    if (!half) return [];
    const groups = half.split(":");
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return [];
    return groups.map((group) => Number.parseInt(group, 16));
  };
  const left = parseHalf(halves[0]);
  const right = halves.length === 2 ? parseHalf(halves[1]) : [];
  if ((!halves[0] ? false : left.length === 0) || (halves.length === 2 && halves[1] && right.length === 0)) return null;
  let groups: number[];
  if (halves.length === 2) {
    const fill = 8 - left.length - right.length;
    if (fill < 1) return null;
    groups = [...left, ...new Array<number>(fill).fill(0), ...right];
  } else {
    groups = left;
    if (groups.length !== 8) return null;
  }
  if (groups.length !== 8) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt(group), 0n);
}

function inIpv6Range(address: bigint, network: string, prefix: number): boolean {
  const base = parseIpv6(network);
  if (base === null) return false;
  const shift = BigInt(128 - prefix);
  return (address >> shift) === (base >> shift);
}

/**
 * 只允许可公开路由的单播地址。保留与文档前缀均按不安全处理。
 */
export function isPublicWorkshopAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const blocked: [string, number][] = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.88.99.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4]
    ];
    return !blocked.some(([network, prefix]) => inIpv4Range(address, network, prefix));
  }

  if (family !== 6) return false;
  const parsed = parseIpv6(address);
  if (parsed === null) return false;

  // 只认 2000::/3 全局单播，同时拒绝回环、映射、ULA、链路本地和组播等形式。
  if (!inIpv6Range(parsed, "2000::", 3)) return false;
  const blocked: [string, number][] = [
    ["2001::", 23],       // IETF 协议分配与特殊用途
    ["2001:db8::", 32],   // 文档示例地址
    ["2002::", 16],       // 6to4 可隧道连接任意 IPv4 目标
    ["3fff::", 20],       // 文档示例地址
    ["5f00::", 16]        // 本地 SID 空间
  ];
  return !blocked.some(([network, prefix]) => inIpv6Range(parsed, network, prefix));
}

function stripTrailingSharePunctuation(value: string): string {
  let result = value;
  while (/[.,;!?，。；！？）》】\]}]$/.test(result)) result = result.slice(0, -1);
  while (result.endsWith(")") && (result.match(/\(/g)?.length ?? 0) < (result.match(/\)/g)?.length ?? 0)) {
    result = result.slice(0, -1);
  }
  return result;
}

function cleanUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return fail(400, "workshop_invalid_url", "请输入有效的公开网页链接");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return fail(400, "workshop_invalid_url", "只支持 http 或 https 网页链接");
  }
  if (url.username || url.password) {
    return fail(403, "workshop_unsafe_url", "链接不能包含登录凭据");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    return fail(403, "workshop_unsafe_url", "只允许标准网页端口");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) return fail(400, "workshop_invalid_url", "链接缺少主机名");
  if (isIP(hostname) && !isPublicWorkshopAddress(hostname)) {
    return fail(403, "workshop_unsafe_url", "链接指向本机、内网或保留地址");
  }
  url.hash = "";
  return url;
}

/** 从分享文案中取第一个 http(s) URL，并拒绝凭据、非标准端口与危险 IP 字面量。 */
export function normalizeWorkshopUrl(input: string): string {
  const match = input.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return fail(400, "workshop_invalid_url", "没有找到 http 或 https 网页链接");
  return cleanUrl(stripTrailingSharePunctuation(match[0])).href;
}

function abortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  return reason instanceof Error ? reason : new Error("请求已取消");
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      cleanup();
      reject(abortError(signal));
    };
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      }
    );
  });
}

async function resolveAddresses(hostname: string): Promise<Address[]> {
  const family = isIP(hostname);
  if (family) return [{ address: hostname, family }];
  return lookup(hostname, { all: true, verbatim: true });
}

/** Node HTTP transport；调用方必须先完成公网地址校验，测试用本机 server 验证其 lookup 行为。 */
export function requestOnePage(url: URL, address: Address, signal: AbortSignal): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const chunks: Buffer[] = [];
    let bytes = 0;
    // Node 22 运行时会把该 Socket 选项透传给 net.connect；当前 @types/node 的
    // http.RequestOptions 尚未声明此字段，因此在这里仅扩展运行时实际接收的选项。
    const requestOptions = {
      method: "GET",
      agent: false,
      family: address.family,
      autoSelectFamily: false,
      signal,
      headers: {
        accept: "text/html, text/markdown, text/plain, application/ld+json, application/json;q=0.9, */*;q=0.1",
        "accept-encoding": "identity",
        "user-agent": "CookbookWorkshop/1.0"
      },
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family)
    } as http.RequestOptions & { autoSelectFamily: boolean };
    const request = client.request(
      url,
      requestOptions,
      (response) => {
        const responseHeaders: Record<string, string> = {};
        for (const [name, value] of Object.entries(response.headers)) {
          if (typeof value === "string") responseHeaders[name.toLowerCase()] = value;
        }
        if ((responseHeaders["content-encoding"] ?? "identity").toLowerCase() !== "identity") {
          response.resume();
          reject(new WorkshopError(415, "workshop_encoding_unsupported", "网页使用了不支持的压缩格式"));
          return;
        }
        const announced = Number(responseHeaders["content-length"]);
        if (Number.isFinite(announced) && announced > MAX_PAGE_BYTES) {
          response.destroy();
          reject(new WorkshopError(413, "workshop_page_too_large", "网页超过 2 MiB 读取上限"));
          return;
        }
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.byteLength;
          if (bytes > MAX_PAGE_BYTES) {
            response.destroy();
            request.destroy();
            reject(new WorkshopError(413, "workshop_page_too_large", "网页超过 2 MiB 读取上限"));
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 502,
            headers: responseHeaders,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
        response.on("error", reject);
      }
    );
    request.on("error", reject);
    request.end();
  });
}

async function fetchPage(url: URL, options: WorkshopExtractOptions, signal: AbortSignal): Promise<PageResponse> {
  const resolve = options.resolveHost ?? resolveAddresses;
  const request = options.requestPage ?? requestOnePage;
  let current = url;

  for (let redirects = 0; ; redirects += 1) {
    let addresses: Address[];
    try {
      addresses = await withAbort(resolve(current.hostname.replace(/^\[|\]$/g, "")), signal);
    } catch (error) {
      if (error instanceof WorkshopError) throw error;
      if (signal.aborted) throw error;
      return fail(502, "workshop_dns_failed", "无法安全解析网页地址，请稍后重试");
    }
    if (!addresses.length || addresses.length > 64) {
      return fail(502, "workshop_dns_failed", "无法安全解析网页地址，请稍后重试");
    }
    if (addresses.some((item) => item.family !== isIP(item.address) || !isPublicWorkshopAddress(item.address))) {
      return fail(403, "workshop_unsafe_url", "链接解析到了本机、内网或保留地址");
    }
    let response: PageResponse;
    try {
      response = await withAbort(request(current, addresses[0], signal), signal);
    } catch (error) {
      if (error instanceof WorkshopError) throw error;
      if (signal.aborted) throw error;
      return fail(502, "workshop_fetch_failed", "读取网页失败，请补充文字或截图");
    }
    const location = response.headers.location ?? response.headers.Location;
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      if (redirects >= MAX_REDIRECTS) return fail(502, "workshop_too_many_redirects", "网页跳转次数超过 3 次");
      let next: URL;
      try {
        next = cleanUrl(new URL(location, current).href);
      } catch (error) {
        if (error instanceof WorkshopError) throw error;
        return fail(502, "workshop_redirect_invalid", "网页返回了无效跳转地址");
      }
      current = next;
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      const message = response.status === 401 || response.status === 403
        ? "网页拒绝公开读取，请补充文字或截图"
        : "读取网页失败，请补充文字或截图";
      return fail(422, "workshop_page_unavailable", message);
    }
    if (Buffer.byteLength(response.body, "utf8") > MAX_PAGE_BYTES) {
      return fail(413, "workshop_page_too_large", "网页超过 2 MiB 读取上限");
    }
    return { ...response, headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), value])), body: response.body };
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function textValue(value: unknown): string | undefined {
  const object = record(value);
  return stringValue(value) ?? (object ? stringValue(object.text) ?? stringValue(object.name) : undefined);
}

function isRecipeNode(object: Record<string, unknown>): boolean {
  const type = object["@type"] ?? object.type;
  const types = Array.isArray(type) ? type : [type];
  if (types.some((item) => typeof item === "string" && /(?:^|\/)Recipe$/i.test(item))) return true;
  return typeof object.name === "string"
    && (Array.isArray(object.ingredients) || Array.isArray(object.recipeIngredient))
    && (Array.isArray(object.steps) || Array.isArray(object.recipeInstructions));
}

function collectRecipeNodes(root: unknown): Record<string, unknown>[] {
  const recipes: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();
  const visited = new Set<object>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const object = record(value);
    if (!object || visited.has(object)) return;
    visited.add(object);
    if (isRecipeNode(object) && !seen.has(object)) {
      seen.add(object);
      recipes.push(object);
    }
    for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "hasPart", "subjectOf"]) {
      visit(object[key]);
    }
  };
  visit(root);
  return recipes;
}

function cleanPlainText(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function amountIngredient(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const input = value as Record<string, unknown>;
    const name = stringValue(input.name);
    if (!name) return null;
    const result: Record<string, unknown> = { name };
    for (const key of ["amount", "unit", "group", "note"] as const) {
      if (typeof input[key] === "number" || typeof input[key] === "string") result[key] = input[key];
    }
    return result;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim().replace(/^[-*•]\s*/, "");
  const quantity = text.match(/^([\d]+(?:[.,]\d+)?(?:\s*(?:\/|[-–~至])\s*[\d]+(?:[.,]\d+)?)?)\s*(kg|公斤|克|g|毫升|ml|升|l|个|颗|只|根|片|瓣|勺|茶匙|汤匙)?(?=\s|[\u3400-\u9fff]|$)\s*(.+)$/i);
  if (!quantity) return { name: cleanPlainText(text) };
  const result: Record<string, unknown> = { name: cleanPlainText(quantity[3]), amount: quantity[1] };
  if (quantity[2]) result.unit = quantity[2];
  return result;
}

function instructionSteps(value: unknown, inheritedTitle?: string): Record<string, unknown>[] {
  if (typeof value === "string") {
    const text = cleanPlainText(value);
    return text ? [{ text, ...(inheritedTitle ? { title: inheritedTitle } : {}) }] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => instructionSteps(item, inheritedTitle));
  const object = record(value);
  if (!object) return [];
  const type = object["@type"] ?? object.type;
  const types = Array.isArray(type) ? type : [type];
  const isSection = types.some((item) => typeof item === "string" && /HowToSection$/i.test(item));
  const isStep = types.some((item) => typeof item === "string" && /HowToStep$/i.test(item));
  const title = inheritedTitle ?? stringValue(object.name);
  if (isSection) {
    return instructionSteps(object.itemListElement ?? object.steps, title);
  }
  if (isStep) {
    const text = cleanPlainText(stringValue(object.text) ?? stringValue(object.description) ?? "");
    if (!text) return instructionSteps(object.itemListElement ?? object.steps, title);
    return [{ text, ...(title ? { title } : {}) }];
  }
  if (object.text !== undefined || object.name !== undefined) {
    const text = cleanPlainText(stringValue(object.text) ?? "");
    if (text) return [{ text, ...(title ? { title } : {}) }];
  }
  return instructionSteps(object.itemListElement ?? object.steps, title);
}

function durationMinutes(value: unknown): number | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  const match = text.match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!match || (!match[1] && !match[2] && !match[3])) return undefined;
  const minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0) + Number(match[3] ?? 0) / 60;
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : undefined;
}

function servingsValue(value: unknown): number | undefined {
  const candidate = Array.isArray(value) ? value.find((item) => typeof item === "string" || typeof item === "number") : value;
  if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) return candidate;
  if (typeof candidate !== "string") return undefined;
  const match = candidate.match(/^\s*(?:(?:serves?|makes?)\s*)?(\d+(?:\.\d+)?)\s*(?:servings?|people|人份|份)?\s*$/i);
  if (!match) return undefined;
  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? count : undefined;
}

function authorValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return authorValue(value[0]);
  if (typeof value === "string") return stringValue(value);
  const object = record(value);
  return object ? stringValue(object.name) : undefined;
}

function candidateFromRecipe(
  node: Record<string, unknown>,
  index: number,
  sourceId?: string
): WorkshopCandidate {
  const recipe: Record<string, unknown> = {};
  const name = stringValue(node.name) ?? stringValue(node.headline);
  if (name) recipe.name = name;
  const aliases = Array.isArray(node.aliases) ? node.aliases.filter((item): item is string => typeof item === "string" && !!item.trim()) : undefined;
  if (aliases?.length) recipe.aliases = aliases;
  const category = stringValue(node.category) ?? stringValue(node.recipeCategory);
  if (category) recipe.category = category;
  if (Array.isArray(node.tags)) recipe.tags = node.tags.filter((item): item is string => typeof item === "string");
  if (typeof node.summary === "string") recipe.summary = node.summary;
  if (typeof node.description === "string") recipe.summary = cleanPlainText(node.description);
  const difficulty = node.difficulty;
  if (difficulty === 1 || difficulty === 2 || difficulty === 3) recipe.difficulty = difficulty;
  const servings = node.servings !== undefined ? node.servings : node.recipeYield;
  const servingCount = servingsValue(servings);
  if (servingCount !== undefined) recipe.servings = servingCount;
  const prepMinutes = durationMinutes(node.prepMinutes ?? node.prepTime);
  if (prepMinutes !== undefined) recipe.prepMinutes = prepMinutes;
  const cookMinutes = durationMinutes(node.cookMinutes ?? node.cookTime);
  if (cookMinutes !== undefined) recipe.cookMinutes = cookMinutes;
  if (Array.isArray(node.equipment)) recipe.equipment = node.equipment.filter((item): item is string => typeof item === "string");

  const ingredients = node.ingredients ?? node.recipeIngredient;
  if (Array.isArray(ingredients)) {
    const items = ingredients.map(amountIngredient).filter((item): item is Record<string, unknown> => !!item);
    if (items.length) recipe.ingredients = items;
  }
  const steps = instructionSteps(node.steps ?? node.recipeInstructions);
  if (steps.length) recipe.steps = steps;
  const tips = Array.isArray(node.tips) ? node.tips.filter((item): item is string => typeof item === "string" && !!item.trim()) : undefined;
  if (tips?.length) recipe.tips = tips;
  if (typeof node.source === "string") recipe.source = node.source;

  const parsed = workshopRecipeSchema.safeParse(recipe);
  const safeRecipe = parsed.success ? parsed.data : {};
  const evidence: WorkshopCandidate["evidence"] = [];
  const addEvidence = (field: string): void => {
    evidence.push({ field, status: "source", sourceIds: sourceId ? [sourceId] : [] });
  };
  for (const key of Object.keys(safeRecipe)) addEvidence(key);
  return {
    key: "recipe-" + index,
    recipe: safeRecipe as WorkshopRecipeInput,
    evidence,
    unresolved: []
  };
}

function analysisFromNodes(nodes: Record<string, unknown>[], sourceId?: string): WorkshopAnalysisResult {
  const candidates = nodes.map((node, index) => candidateFromRecipe(node, index + 1, sourceId));
  if (!candidates.length) return { candidates: [], explanation: "" };
  const analysis = workshopAnalysisSchema.parse({ candidates, explanation: "" });
  if (JSON.stringify(analysis).length > MAX_PAGE_TEXT) {
    return fail(413, "workshop_text_too_large", "提取菜谱内容超过 4 万字，请缩短材料后重试");
  }
  return analysis;
}

/** 解析现有 Recipe JSON 或 Recipe JSON-LD；系统 ID、sourceRef 与时间戳会被剔除。 */
export function parseWorkshopRecipeJson(text: string, sourceId?: string): WorkshopAnalysisResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail(400, "workshop_json_invalid", "菜谱 JSON 格式无效");
  }
  const nodes = collectRecipeNodes(value);
  if (!nodes.length) return fail(400, "workshop_json_not_recipe", "JSON 中没有可识别的菜谱");
  const analysis = analysisFromNodes(nodes, sourceId);
  if (!analysis.candidates.length) return fail(400, "workshop_json_not_recipe", "JSON 中没有可识别的菜谱");
  return analysis;
}

function normalizeExtractedText(text: string): string {
  const normalized = text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length > MAX_PAGE_TEXT) {
    return fail(413, "workshop_text_too_large", "提取正文超过 4 万字，请缩短材料后重试");
  }
  return normalized;
}

function jsonLdFromDocument(document: Document): Record<string, unknown>[] {
  const recipes: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed: unknown = JSON.parse(script.textContent ?? "");
      for (const recipe of collectRecipeNodes(parsed)) {
        if (!seen.has(recipe)) {
          seen.add(recipe);
          recipes.push(recipe);
        }
      }
    } catch {
      // 一段损坏的结构化数据不能阻止其他脚本与正文提取。
    }
  }
  return recipes;
}

function metaContent(document: Document, selector: string): string | undefined {
  return stringValue(document.querySelector(selector)?.getAttribute("content"));
}

function htmlResult(url: URL, html: string): WorkshopExtractResult {
  const dom = new JSDOM(html, { url: url.href, contentType: "text/html" });
  try {
    const document = dom.window.document;
    const nodes = jsonLdFromDocument(document);
    const analysis = analysisFromNodes(nodes);
    const title = metaContent(document, 'meta[property="og:title"]')
      ?? stringValue(document.title)
      ?? analysis.candidates[0]?.recipe.name
      ?? "";
    const author = metaContent(document, 'meta[name="author"]')
      ?? metaContent(document, 'meta[property="article:author"]')
      ?? (nodes[0] ? authorValue(nodes[0].author) : undefined);
    let body = "";
    try {
      const articleDocument = document.cloneNode(true) as Document;
      articleDocument.querySelectorAll("nav, header, footer, aside, script, style, noscript, iframe, form, button, dialog")
        .forEach((element) => element.remove());
      const article = new Readability(articleDocument).parse();
      body = article?.textContent ?? "";
    } catch {
      body = "";
    }
    if (/^(?:登录|注册|sign in|log in|sign up|home)$/i.test(body.trim())) body = "";
    return {
      url: url.href,
      title: cleanPlainText(title),
      ...(author ? { author: cleanPlainText(author) } : {}),
      text: normalizeExtractedText(body),
      ...(analysis.candidates.length ? { candidates: analysis.candidates } : {})
    };
  } finally {
    dom.window.close();
  }
}

/** 有界读取公开网页；DNS 每跳全量校验并将连接绑定到通过校验的地址。 */
export async function extractWorkshopLink(
  input: string,
  options: WorkshopExtractOptions = {}
): Promise<WorkshopExtractResult> {
  const url = cleanUrl(normalizeWorkshopUrl(input));
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(new Error("deadline")), REQUEST_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;
  try {
    const response = await fetchPage(url, options, signal);
    const contentType = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (contentType === "application/json" || contentType === "application/ld+json" || /^[\s\ufeff]*[\[{]/.test(response.body)) {
      try {
        const analysis = parseWorkshopRecipeJson(response.body);
        return {
          url: url.href,
          title: analysis.candidates[0]?.recipe.name ?? "",
          text: "",
          candidates: analysis.candidates
        };
      } catch (error) {
        if (error instanceof WorkshopError && error.code === "workshop_json_not_recipe") {
          return { url: url.href, title: "", text: normalizeExtractedText(response.body) };
        }
        if (error instanceof WorkshopError && error.code === "workshop_json_invalid" && contentType !== "application/json" && contentType !== "application/ld+json") {
          // HTML and Markdown can begin with braces without being JSON.
        } else if (error instanceof WorkshopError && error.code === "workshop_json_invalid") {
          return fail(422, "workshop_page_unavailable", "网页 JSON 不是可识别的菜谱，请补充文字或截图");
        } else {
          throw error;
        }
      }
    }

    if (contentType === "text/html" || contentType === "application/xhtml+xml" || /\.html?(?:$|[?#])/i.test(url.pathname) || response.body.trimStart().startsWith("<")) {
      return htmlResult(url, response.body);
    }
    if (contentType === "text/markdown" || contentType === "text/x-markdown" || /\.md$/i.test(url.pathname) || contentType.startsWith("text/")) {
      return { url: url.href, title: "", text: normalizeExtractedText(response.body) };
    }
    if (!response.body.trim()) return { url: url.href, title: "", text: "" };
    return fail(415, "workshop_page_not_text", "网页没有可读取的文字正文，请补充文字或截图");
  } catch (error) {
    if (error instanceof WorkshopError) throw error;
    if (options.signal?.aborted) return fail(499, "workshop_extract_cancelled", "网页读取已取消");
    if (timeoutController.signal.aborted) return fail(504, "workshop_extract_timeout", "网页读取超过 15 秒，请补充文字或截图");
    return fail(502, "workshop_fetch_failed", "读取网页失败，请补充文字或截图");
  } finally {
    clearTimeout(timer);
  }
}
