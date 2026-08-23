import { creatorLedgers, subscriptions, users, webhookEvents } from "@garagetalk/db";
import { eq } from "drizzle-orm";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { buildApp } from "./app.js";
import { signStripeWebhookPayload } from "./services/billing-service.js";
import { createTestDb } from "./test/pglite.js";

function cookieFrom(response: {
  headers: Record<string, string | number | string[] | undefined>;
}): string {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

function subscriptionEvent(input: {
  id: string;
  type: string;
  userId: string;
  tier: string;
  status: string;
  periodEnd: number;
}) {
  return {
    id: input.id,
    type: input.type,
    data: {
      object: {
        id: "sub_a9_test",
        customer: "cus_a9_test",
        status: input.status,
        current_period_end: input.periodEnd,
        items: { data: [{ price: { id: `price_${input.tier}` } }] },
        metadata: { userId: input.userId, tier: input.tier },
      },
    },
  };
}

describe("A9 billing and tips", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let payerCookie: string;
  let payerId: string;
  let creatorId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    app = await buildApp({
      db: ctx.db,
      trustedOrigins: ["http://localhost:5173"],
    });

    const payer = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "payer@example.com",
        username: "payeruser",
        password: "correct-horse-battery",
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    payerCookie = cookieFrom(payer);
    payerId = payer.json().user.id as string;

    const creator = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "creator@example.com",
        username: "creatoruser",
        password: "correct-horse-battery",
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    creatorId = creator.json().user.id as string;
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  it("returns tier quotas and stubs the customer portal without a Stripe key", async () => {
    const tiers = await app.inject({ method: "GET", url: "/billing/tiers" });
    expect(tiers.statusCode).toBe(200);
    expect(tiers.json().tiers.racing_pro.liveSessions).toBe(10);

    const portal = await app.inject({
      method: "GET",
      url: "/billing/portal",
      headers: { cookie: payerCookie },
    });
    expect(portal.statusCode).toBe(200);
    expect(portal.json().portal.mode).toBe("stub");
    expect(portal.json().portal.url).toContain("/billing/portal/stub");

    const checkout = await app.inject({
      method: "POST",
      url: "/billing/checkout",
      headers: { cookie: payerCookie },
      payload: { tier: "gearhead" },
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().checkout.mode).toBe("stub");
    expect(checkout.json().checkout.url).toContain("tier=gearhead");
  });

  it("reconciles renewal, downgrade, cancel, and ignores duplicate webhook events", async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    const first = await postStripeEvent(
      subscriptionEvent({
        id: "evt_sub_active",
        type: "customer.subscription.created",
        userId: payerId,
        tier: "racing_pro",
        status: "active",
        periodEnd,
      }),
    );
    expect(first.statusCode).toBe(200);
    expect(first.json().reconciled).toBe(true);

    const duplicate = await postStripeEvent(
      subscriptionEvent({
        id: "evt_sub_active",
        type: "customer.subscription.created",
        userId: payerId,
        tier: "racing_pro",
        status: "active",
        periodEnd,
      }),
    );
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().duplicate).toBe(true);

    const downgradeEnd = periodEnd + 30 * 24 * 3600;
    await postStripeEvent(
      subscriptionEvent({
        id: "evt_sub_downgrade",
        type: "customer.subscription.updated",
        userId: payerId,
        tier: "gearhead",
        status: "active",
        periodEnd: downgradeEnd,
      }),
    );

    await postStripeEvent(
      subscriptionEvent({
        id: "evt_sub_cancel",
        type: "customer.subscription.deleted",
        userId: payerId,
        tier: "gearhead",
        status: "canceled",
        periodEnd: downgradeEnd,
      }),
    );

    const [user] = await ctx.db.select().from(users).where(eq(users.id, payerId));
    expect(user?.tier).toBe("amateur");
    expect(user?.tierStatus).toBe("canceled");

    const subRows = await ctx.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, "sub_a9_test"));
    expect(subRows).toHaveLength(1);
    expect(subRows[0]?.currentPeriodEnd?.getTime()).toBe(downgradeEnd * 1000);

    const eventRows = await ctx.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.eventId, "evt_sub_active"));
    expect(eventRows).toHaveLength(1);
  });

  it("creates Connect-style tips with exact application fee ledger math", async () => {
    const onboarding = await app.inject({
      method: "POST",
      url: "/billing/connect/onboarding",
      headers: { cookie: payerCookie },
    });
    expect(onboarding.statusCode).toBe(200);
    expect(onboarding.json().onboarding.mode).toBe("stub");

    const tip = await app.inject({
      method: "POST",
      url: "/billing/tips",
      headers: { cookie: payerCookie },
      payload: { toUserId: creatorId, amountCents: 1234 },
    });
    expect(tip.statusCode).toBe(201);
    expect(tip.json().feeCents).toBe(123);
    expect(tip.json().netCents).toBe(1111);

    const ledgers = await ctx.db
      .select()
      .from(creatorLedgers)
      .where(eq(creatorLedgers.userId, creatorId));
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]?.grossAmountCents).toBe(1234);
    expect(ledgers[0]?.applicationFeeCents).toBe(123);
    expect(ledgers[0]?.amountCents).toBe(1111);
    expect(ledgers[0]?.balanceAfter).toBe(1111);
  });

  async function postStripeEvent(event: ReturnType<typeof subscriptionEvent>) {
    const rawBody = JSON.stringify(event);
    return app.inject({
      method: "POST",
      url: "/billing/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signStripeWebhookPayload(rawBody),
      },
      payload: rawBody,
    });
  }
});
