import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { DailyMenuResponse } from "../src/shared/types.js";
import { registerDailyMenuRoutes } from "../src/server/routes/daily-menu.js";
import type { DailyMenuService } from "../src/server/services/daily-menu-service.js";

describe("daily menu route", () => {
  it("serves the cached read-only response without starting generation", async () => {
    const menu: DailyMenuResponse = {
      date: "2026-10-03",
      people: 2,
      source: "fallback",
      status: "fallback",
      items: [],
      reason: "当前没有完整的三道菜组合。"
    };
    const service = { getMenu: vi.fn(async () => menu) } as unknown as DailyMenuService;
    const app = Fastify({ logger: false });
    registerDailyMenuRoutes(app, service);

    try {
      const response = await app.inject({ method: "GET", url: "/api/daily-menu" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(menu);
      expect(service.getMenu).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
