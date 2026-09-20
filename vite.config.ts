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
    proxy: {
      "/api": `http://127.0.0.1:${DEV_SERVER_PORT}`,
      "/images": `http://127.0.0.1:${DEV_SERVER_PORT}`
    }
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
});
