import { eq } from "drizzle-orm";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { subscriptions, users } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { EntitlementService } from "./services/entitlement-service.js";
import { createTestDb } from "./test/pglite.js";

describe("EntitlementService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let service: EntitlementService;
  let userId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    service = new EntitlementService(ctx.db);
    userId = uuidv7();
    await ctx.db.insert(users).values({
      id: userId,
      email: "entitlement@example.com",
      username: "entitlementuser",
      passwordHash: "hash",
      tier: "gearhead",
      tierStatus: "active",
    });
  });

  afterAll(async () => {
    await ctx.client.close();
  });

  it("downgrades to amateur when paid tier lacks an active subscription row", async () => {
    const result = await service.resolveForUser(userId);
    expect(result?.effectiveTier).toBe("amateur");
    expect(result?.plan.monthlyQuestions).toBe(10);
  });

  it("uses subscription tier when stripe row is active", async () => {
    await ctx.db.insert(subscriptions).values({
      id: uuidv7(),
      userId,
      tier: "racing_pro",
      status: "active",
      stripeSubscriptionId: "sub_entitlement_test",
      currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const result = await service.resolveForUser(userId);
    expect(result?.effectiveTier).toBe("racing_pro");
    expect(result?.plan.monthlyQuestions).toBe(400);
  });

  it("downgrades when subscription period has ended", async () => {
    await ctx.db
      .update(subscriptions)
      .set({ currentPeriodEnd: new Date(Date.now() - 60_000) })
      .where(eq(subscriptions.stripeSubscriptionId, "sub_entitlement_test"));

    const result = await service.resolveForUser(userId);
    expect(result?.effectiveTier).toBe("amateur");
  });
});
