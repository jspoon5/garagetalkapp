import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { creatorLedgers, subscriptions, tips, users, webhookEvents } from "@garagetalk/db";
import { SUBSCRIPTION_TIER_QUOTAS, type SubscriptionTier } from "@garagetalk/shared";
import Stripe from "stripe";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

export const tipInputSchema = z.object({
  toUserId: z.string().uuid(),
  amountCents: z.number().int().min(100).max(100_000),
  subjectType: z.string().min(1).max(80).nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
});

export const stripeEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({ object: z.record(z.unknown()) }),
});

const subscriptionObjectSchema = z.object({
  id: z.string().min(1),
  customer: z.union([z.string(), z.object({ id: z.string() })]),
  status: z.string().min(1),
  current_period_end: z.number().int().positive().optional(),
  items: z
    .object({
      data: z
        .array(
          z.object({
            price: z.object({ id: z.string().min(1).optional() }).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  metadata: z.record(z.string()).optional(),
});

const TIER_VALUES = ["amateur", "gearhead", "racing_pro", "pro"] as const;
const DEFAULT_WEBHOOK_SECRET = "whsec_test";
const DEFAULT_FEE_BPS = 1000;

function isTier(value: string | undefined): value is SubscriptionTier {
  return TIER_VALUES.some((tier) => tier === value);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function webhookSignature(rawBody: string, secret: string, timestamp: number): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function signStripeWebhookPayload(
  rawBody: string,
  secret = DEFAULT_WEBHOOK_SECRET,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  return `t=${timestamp},v1=${webhookSignature(rawBody, secret, timestamp)}`;
}

export function verifyStripeWebhookSignature(
  rawBody: string,
  header: string,
  secret = DEFAULT_WEBHOOK_SECRET,
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value ?? ""];
    }),
  );
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || !parts.v1) return false;
  const expected = webhookSignature(rawBody, secret, timestamp);
  return safeEqual(expected, parts.v1);
}

export class BillingService {
  constructor(private readonly db: Database) {}

  listTiers() {
    return SUBSCRIPTION_TIER_QUOTAS;
  }

  async createPortalUrl(userId: string, returnUrl: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey || !user.stripeCustomerId) {
      return {
        url: `${returnUrl.replace(/\/$/, "")}/billing/portal/stub?user=${userId}`,
        mode: "stub" as const,
      };
    }
    const stripe = new Stripe(secretKey);
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });
    return { url: session.url, mode: "stripe" as const };
  }

  async handleStripeWebhook(rawBody: string, signatureHeader: string) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? DEFAULT_WEBHOOK_SECRET;
    if (!verifyStripeWebhookSignature(rawBody, signatureHeader, secret)) {
      return { ok: false as const, error: "invalid_signature" as const };
    }
    const event = stripeEventSchema.parse(JSON.parse(rawBody) as unknown);
    const existing = await this.db
      .select()
      .from(webhookEvents)
      .where(and(eq(webhookEvents.source, "stripe"), eq(webhookEvents.eventId, event.id)))
      .limit(1);
    if (existing[0]) return { ok: true as const, duplicate: true };

    let reconciled = false;
    if (event.type.startsWith("customer.subscription.")) {
      reconciled = await this.reconcileSubscription(event.type, event.data.object);
    }

    await this.db.insert(webhookEvents).values({
      id: uuidv7(),
      source: "stripe",
      eventId: event.id,
      processedAt: new Date(),
      payload: event as Record<string, unknown>,
    });
    return { ok: true as const, duplicate: false, reconciled };
  }

  async createConnectOnboardingLink(userId: string, returnUrl: string) {
    return {
      url: `${returnUrl.replace(/\/$/, "")}/billing/connect/stub?user=${userId}`,
      mode: "stub" as const,
    };
  }

  async createTip(fromUserId: string, input: z.infer<typeof tipInputSchema>) {
    const parsed = tipInputSchema.parse(input);
    const feeCents = Math.floor((parsed.amountCents * DEFAULT_FEE_BPS + 5000) / 10_000);
    const netCents = parsed.amountCents - feeCents;
    const [lastLedger] = await this.db
      .select()
      .from(creatorLedgers)
      .where(eq(creatorLedgers.userId, parsed.toUserId))
      .orderBy(desc(creatorLedgers.createdAt))
      .limit(1);
    const balanceAfter = (lastLedger?.balanceAfter ?? 0) + netCents;
    const tipId = uuidv7();
    const paymentIntent = `pi_tip_${tipId.replace(/-/g, "").slice(0, 18)}`;

    const [tip] = await this.db
      .insert(tips)
      .values({
        id: tipId,
        fromUserId,
        toUserId: parsed.toUserId,
        subjectType: parsed.subjectType ?? null,
        subjectId: parsed.subjectId ?? null,
        amountCents: parsed.amountCents,
        applicationFeeCents: feeCents,
        stripePaymentIntent: paymentIntent,
      })
      .returning();

    const [ledger] = await this.db
      .insert(creatorLedgers)
      .values({
        id: uuidv7(),
        userId: parsed.toUserId,
        entryType: "tip",
        amountCents: netCents,
        grossAmountCents: parsed.amountCents,
        applicationFeeCents: feeCents,
        subjectType: "tip",
        subjectId: tipId,
        stripePaymentIntent: paymentIntent,
        balanceAfter,
      })
      .returning();

    return { tip: tip ?? null, ledger: ledger ?? null, feeCents, netCents };
  }

  private async reconcileSubscription(eventType: string, object: Record<string, unknown>) {
    const sub = subscriptionObjectSchema.parse(object);
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const tier = isTier(sub.metadata?.tier) ? sub.metadata.tier : "amateur";
    const status = eventType === "customer.subscription.deleted" ? "canceled" : mapStatus(sub.status);
    const currentPeriodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000)
      : null;
    const stripePriceId = sub.items?.data?.[0]?.price?.id ?? null;
    const user = await this.findSubscriptionUser(sub.metadata?.userId, customerId);
    if (!user) return false;

    const existing = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, sub.id))
      .limit(1);
    const values = {
      userId: user.id,
      tier,
      status,
      stripeSubscriptionId: sub.id,
      stripePriceId,
      currentPeriodEnd,
      updatedAt: new Date(),
    };
    if (existing[0]) {
      await this.db.update(subscriptions).set(values).where(eq(subscriptions.id, existing[0].id));
    } else {
      await this.db.insert(subscriptions).values({ id: uuidv7(), ...values });
    }

    await this.db
      .update(users)
      .set({
        tier: status === "canceled" ? "amateur" : tier,
        tierStatus: status,
        stripeCustomerId: customerId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    return true;
  }

  private async findSubscriptionUser(userId: string | undefined, customerId: string) {
    if (userId) {
      const [byId] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (byId) return byId;
    }
    const [byCustomer] = await this.db
      .select()
      .from(users)
      .where(eq(users.stripeCustomerId, customerId))
      .limit(1);
    return byCustomer ?? null;
  }
}

function mapStatus(status: string): "active" | "canceled" | "past_due" | "trialing" {
  if (status === "trialing") return "trialing";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  if (status === "canceled") return "canceled";
  return "active";
}
