import { startServer } from "./index.js";

startServer().catch((error: unknown) => {
  console.error("cookbook 启动失败：", error);
  process.exit(1);
});
