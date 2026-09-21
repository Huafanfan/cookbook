import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 后端开发端口（与 src/server/lib/config.ts 的默认值一致）；
// 如需改端口，同时改这里和 COOKBOOK_PORT。
const DEV_SERVER_PORT = 3000;

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    /**
     * 端口**不许漂**：Vite 默认在 5173 被占时会自动改用 5174，而浏览器里
     * "我的厨具 / 字号 / 常亮"这些设置是**按网址隔离**的 —— 端口一变，看起来就像"设置丢了"。
     * 所以宁可启动失败并把原因打出来（Port 5173 is already in use）。
     */
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${DEV_SERVER_PORT}`,
      "/images": `http://127.0.0.1:${DEV_SERVER_PORT}`
    }
  },
  test: {
    // 纯逻辑测试跑 node；组件测试在文件顶部用 `// @vitest-environment jsdom` 单独切换
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"]
  }
});
