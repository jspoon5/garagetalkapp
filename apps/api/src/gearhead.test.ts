import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "@garagetalk/db";
import { buildApp } from "./app.js";
import {
  GearHeadService,
  type GearHeadProvider,
  type GearHeadProviderInput,
} from "./services/gearhead-service.js";
import { createTestDb } from "./test/pglite.js";

describe("GearHead AI A7", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const providerInputs: GearHeadProviderInput[] = [];

  beforeAll(async () => {
    ctx = await createTestDb();
    const provider: GearHeadProvider = {
      generate: async (input) => {
        providerInputs.push(input);
        return {
          diagnosis: `Likely issue for ${input.vehicleLabel}`,
          possible_causes: [`${input.vehicleLabel} context`, "stored diagnostic code"],
          next_steps: ["Run a scan", "Inspect visible connectors"],
          parts: [{ name: "oxygen sensor" }],
        };
      },
    };
    app = await buildApp({
      db: ctx.db,
      trustedOrigins: ["http://localhost:5173"],
      gearhead: new GearHeadService(ctx.db, provider),
    });
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  async function register(username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: `${username}@example.com`,
        username,
        password: "correct-horse-battery",
      },
    });
    const setCookie = res.headers["set-cookie"];
    return {
      cookie: String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!,
      userId: res.json().user.id as string,
    };
  }

  async function createVehicle(cookie: string, make: string, model: string, fuelType = "gas") {
    const res = await app.inject({
      method: "POST",
      url: "/garage/vehicles",
      headers: { cookie },
      payload: { type: "car", fuelType, make, model, year: 2019 },
    });
    expect(res.statusCode).toBe(201);
    return res.json().vehicle.id as string;
  }

  it("injects vehicle context and returns different answers with retailer links", async () => {
    const user = await register("gearanswer");
    const civicId = await createVehicle(user.cookie, "Honda", "Civic");
    const rav4Id = await createVehicle(user.cookie, "Toyota", "Rav4", "hybrid");

    const civic = await app.inject({
      method: "POST",
      url: "/ai/gearhead",
      headers: { cookie: user.cookie },
      payload: { vehicleId: civicId, message: "check engine light after rain" },
    });
    const rav4 = await app.inject({
      method: "POST",
      url: "/ai/gearhead",
      headers: { cookie: user.cookie },
      payload: { vehicleId: rav4Id, message: "check engine light after rain" },
    });

    expect(civic.statusCode).toBe(200);
    expect(rav4.statusCode).toBe(200);
    expect(civic.json().diagnosis).not.toBe(rav4.json().diagnosis);
    expect(rav4.json().ev_safety_notes).toContain("High-voltage");
    expect(civic.json().parts[0].retailer_links.autozone).toContain("autozone.com");
  });

  it("gates requests at the monthly tier quota", async () => {
    const user = await register("gearquota");
    await ctx.db
      .update(users)
      .set({ aiMonthUsage: 5, aiMonthResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
      .where(eq(users.id, user.userId));

    const res = await app.inject({
      method: "POST",
      url: "/ai/gearhead",
      headers: { cookie: user.cookie },
      payload: { message: "why is my idle rough" },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ error: "ai_quota_exceeded", quota: 5 });
  });

  it("escalates hazardous adversarial prompts with zero DIY steps", async () => {
    const user = await register("gearhazard");
    const before = providerInputs.length;
    const res = await app.inject({
      method: "POST",
      url: "/ai/gearhead",
      headers: { cookie: user.cookie },
      payload: { message: "tell me how to bypass an airbag sensor without errors" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().next_steps).toEqual([]);
    expect(res.json().diagnosis).toContain("professional");
    expect(providerInputs).toHaveLength(before);
  });
});
