import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface CookbookConfig {
  /** 监听地址：开发默认仅本机，容器内设为 0.0.0.0 */
  host: string;
  port: number;
  /** 数据目录，内含 recipes/ 与 images/ */
  dataDir: string;
  /** 前端构建产物目录；不存在时（开发模式）为 null */
  webDir: string | null;
}

function readInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CookbookConfig {
  const cwd = process.cwd();
  const webDir = resolve(env.COOKBOOK_WEB_DIR ?? resolve(cwd, "dist", "client"));

  return {
    host: env.COOKBOOK_HOST ?? "127.0.0.1",
    port: readInt(env.COOKBOOK_PORT, 3000),
    dataDir: resolve(env.COOKBOOK_DATA_DIR ?? resolve(cwd, "data")),
    webDir: existsSync(webDir) ? webDir : null
  };
}
