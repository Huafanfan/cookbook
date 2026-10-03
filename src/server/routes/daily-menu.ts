import type { FastifyInstance } from "fastify";

import type { DailyMenuService } from "../services/daily-menu-service.js";

export function registerDailyMenuRoutes(app: FastifyInstance, service: DailyMenuService): void {
  app.get("/api/daily-menu", async () => service.getMenu());
}
