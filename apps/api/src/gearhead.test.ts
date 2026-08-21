import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subscriptions, users } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { buildApp } from "./app.js";
import {
  createDefaultGearHeadProvider,
  GearHeadService,
  OpenAiCompatibleGearHeadProvider,
  type GearHeadProvider,
  type GearHeadProviderInput,
} from "./services/gearhead-service.js";
import { createTestDb } from "./test/pglite.js";

describe("GearHead OpenAI-compatible provider", () => {
  it("uses stub when AI_API_KEY is missing", async () => {
    const provider = createDefaultGearHeadProvider({});
    const out = await provider.generate({
      systemPrompt: "sys",
      prompt: "prompt",
      vehicleLabel: "2015 Honda Civic (gas)",
      message: "what oil",
      model: "gpt-4o-mini",
      maxOutputTokens: 500,
      memoryLevel: "short",
    });
    expect(out.diagnosis).toContain("Initial diagnostic direction");
  });

  it("calls chat completions when AI_API_KEY is set", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: unknown }>;
        response_format?: { type: string };
      };
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.messages[0]?.role).toBe("system");
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  diagnosis: "Use 0W-20 synthetic oil meeting Honda specs.",
                  possible_causes: ["routine maintenance interval"],
                  next_steps: ["Confirm engine code on oil cap", "Use API SN/SP oil"],
                  parts: [{ name: "0W-20 motor oil" }],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const provider = new OpenAiCompatibleGearHeadProvider({
      apiKey: "test-key",
      baseUrl: "https://api.openai.com/v1",
      fetchImpl,
    });
    const out = await provider.generate({
      systemPrompt: "sys",
      prompt: "what oil for a 2015 civic",
      vehicleLabel: "2015 Honda Civic (gas)",
      message: "what oil for a 2015 civic",
      model: "gpt-4o-mini",
      maxOutputTokens: 500,
      memoryLevel: "short",
    });
    expect(out.diagnosis).toContain("0W-20");
    expect(out.parts[0]?.name).toContain("oil");
  });
});

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
    expect(providerInputs.at(-2)?.model).toBeTruthy();
  });

  it("gates requests at the monthly tier quota with upgrade hints", async () => {
    const user = await register("gearquota");
    await ctx.db
      .update(users)
      .set({ aiMonthUsage: 10, aiMonthResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
      .where(eq(users.id, user.userId));

    const res = await app.inject({
      method: "POST",
      url: "/ai/gearhead",
      headers: { cookie: user.cookie },
      payload: { message: "why is my idle rough" },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({
      error: "limit_reached",
      quota: 10,
      usage: 10,
      effectiveTier: "amateur",
      upgradeTier: "gearhead",
    });
    expect(res.json().message).toContain("Upgrade");
  });

  it("downgrades stored paid tier when subscription is inactive", async () => {
    const user = await register("geardowngrade");
    await ctx.db
      .update(users)
      .set({
        tier: "gearhead",
        tierStatus: "canceled",
        aiMonthUsage: 10,
        aiMonthResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .where(eq(users.id, user.userId));

    const res = await app.inject({
      method: "POST",
      url: "/ai/gearhead",
      headers: { cookie: user.cookie },
      payload: { message: "rough idle" },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ quota: 10, effectiveTier: "amateur" });
  });

  it("honors active subscription records for paid allowance", async () => {
    const user = await register("gearactive");
    await ctx.db
      .update(users)
      .set({ tier: "gearhead", tierStatus: "active" })
      .where(eq(users.id, user.userId));
    await ctx.db.insert(subscriptions).values({
      id: uuidv7(),
      userId: user.userId,
      tier: "gearhead",
      status: "active",
      stripeSubscriptionId: "sub_gear_test",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const res = await app.inject({
      method: "POST",
      url: "/ai/gearhead",
      headers: { cookie: user.cookie },
      payload: { message: "battery drain overnight" },
    });
    expect(res.statusCode).toBe(200);
    expect(providerInputs.at(-1)?.maxOutputTokens).toBe(800);
  });

  it("rejects photo diagnostics on the free tier", async () => {
    const user = await register("gearphoto");
    const res = await app.inject({
      method: "POST",
      url: "/ai/gearhead",
      headers: { cookie: user.cookie },
      payload: { message: "what is this leak", photoUrl: "https://example.com/leak.jpg" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: "photos_not_allowed", upgradeTier: "gearhead" });
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
