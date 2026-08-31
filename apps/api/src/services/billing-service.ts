import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import {
  creatorEarnings,
  creatorLedgers,
  creatorPayoutAccounts,
  creatorPayouts,
  orders,
  subscriptions,
  tips,
  users,
  webhookEvents,
} from "@garagetalk/db";
import { SUBSCRIPTION_TIER_QUOTAS, TIER_PRICES, type PaidTier, type SubscriptionTier } from "@garagetalk/shared";
import Stripe from "stripe";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { EntitlementService } from "./entitlement-service.js";
import type { GiftService } from "./gift-service.js";


export const withdrawEarningsSchema = z.object({
  amountCents: z.number().int().positive().max(10_000_000),
});

export const settleEarningsSchema = z.object({
  userId: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

export const tipInputSchema = z.object({
  toUserId: z.string().uuid(),
  amountCents: z.number().int().min(100).max(100_000),
  subjectType: z.string().min(1).max(80).nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
});

export const checkoutTierSchema = z.object({
  tier: z.enum(["gearhead", "racing_pro", "pro"]),
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

function integrationIdentifier(prefix: string): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  return `${prefix}_${suffix}`;
}

export function stripeFromEnv(): Stripe | null {
  if (process.env.NODE_ENV === "test") return null;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  return secretKey ? new Stripe(secretKey) : null;
}

function envPriceId(tier: PaidTier): string | undefined {
  const key = `STRIPE_PRICE_${tier.toUpperCase()}`;
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
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

/** Real Stripe webhook secrets are `whsec_...` and must use constructEvent (not raw HMAC). */
export function shouldUseStripeConstructEvent(secret: string): boolean {
  const stripe = stripeFromEnv();
  if (!stripe) return false;
  return secret.startsWith("whsec_") || Boolean(process.env.STRIPE_SECRET_KEY);
}

export class BillingService {
  private readonly entitlements: EntitlementService;

  constructor(
    private readonly db: Database,
    private readonly gifts?: GiftService,
  ) {
    this.entitlements = new EntitlementService(db);
  }

  async getEntitlement(userId: string) {
    const resolved = await this.entitlements.resolveForUser(userId);
    if (!resolved) return null;
    return this.entitlements.toPublic(resolved);
  }

  listTiers() {
    return SUBSCRIPTION_TIER_QUOTAS;
  }

  async createSubscriptionCheckout(
    userId: string,
    tier: PaidTier,
    successUrl: string,
    cancelUrl: string,
  ) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;
    const stripe = stripeFromEnv();
    const tierInfo = TIER_PRICES[tier];
    if (!stripe) {
      return {
        url: `${cancelUrl.replace(/\/$/, "")}/billing/checkout/stub?tier=${tier}&user=${userId}`,
        sessionId: `cs_stub_${userId.slice(0, 8)}`,
        mode: "stub" as const,
      };
    }
    const customerId = await this.ensureCustomer(stripe, user);
    const priceId = envPriceId(tier);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: priceId
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: tierInfo.amountCents,
                recurring: { interval: "month" },
                product_data: {
                  name: tierInfo.name,
                  description: `Monthly Garage Talk ${tierInfo.name}`,
                },
              },
            },
          ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: { userId, tier, type: "subscription" },
      subscription_data: { metadata: { userId, tier } },
      integration_identifier: integrationIdentifier("gt_sub"),
    } as Stripe.Checkout.SessionCreateParams);
    return { url: session.url, sessionId: session.id, mode: "stripe" as const };
  }

  async createPortalUrl(userId: string, returnUrl: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;
    const stripe = stripeFromEnv();
    if (!stripe || !user.stripeCustomerId) {
      return {
        url: `${returnUrl.replace(/\/$/, "")}/billing/portal/stub?user=${userId}`,
        mode: "stub" as const,
      };
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });
    return { url: session.url, mode: "stripe" as const };
  }

  async handleStripeWebhook(rawBody: string, signatureHeader: string) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? DEFAULT_WEBHOOK_SECRET;
    let event: z.infer<typeof stripeEventSchema>;

    if (shouldUseStripeConstructEvent(secret)) {
      const stripe = stripeFromEnv();
      if (!stripe) {
        return { ok: false as const, error: "invalid_signature" as const };
      }
      try {
        const constructed = stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
        event = stripeEventSchema.parse({
          id: constructed.id,
          type: constructed.type,
          data: { object: constructed.data.object as unknown as Record<string, unknown> },
        });
      } catch {
        return { ok: false as const, error: "invalid_signature" as const };
      }
    } else {
      // Stub/test secrets: custom HMAC (signing with the secret string as-is).
      if (!verifyStripeWebhookSignature(rawBody, signatureHeader, secret)) {
        return { ok: false as const, error: "invalid_signature" as const };
      }
      event = stripeEventSchema.parse(JSON.parse(rawBody) as unknown);
    }

    const existing = await this.db
      .select()
      .from(webhookEvents)
      .where(and(eq(webhookEvents.source, "stripe"), eq(webhookEvents.eventId, event.id)))
      .limit(1);
    if (existing[0]) return { ok: true as const, duplicate: true };

    let reconciled = false;
    if (event.type.startsWith("customer.subscription.")) {
      reconciled = await this.reconcileSubscription(event.type, event.data.object);
    } else if (event.type === "checkout.session.completed") {
      reconciled = await this.fulfillCheckout(event.data.object);
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


  /**
   * Move PENDING earnings to AVAILABLE once available_at has passed.
   * Internal ledger is source of truth; Connect transfer happens only from AVAILABLE.
   */
  async settlePendingEarnings(userId?: string) {
    const now = new Date();
    const conditions = [
      eq(creatorEarnings.status, "PENDING"),
      lte(creatorEarnings.availableAt, now),
    ];
    if (userId) conditions.push(eq(creatorEarnings.userId, userId));

    const updated = await this.db
      .update(creatorEarnings)
      .set({ status: "AVAILABLE", updatedAt: now })
      .where(and(...conditions))
      .returning({ id: creatorEarnings.id, userId: creatorEarnings.userId, netCents: creatorEarnings.netCents });

    return { settledCount: updated.length, settledCents: updated.reduce((sum, row) => sum + row.netCents, 0) };
  }

  /**
   * Withdraw AVAILABLE earnings via Stripe Connect transfer (SCT).
   * Marks consumed earnings PAID and writes creator_payouts.
   */
  async withdrawAvailableEarnings(userId: string, amountCents: number) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return { error: "invalid_amount" as const };
    }

    const [account] = await this.db
      .select()
      .from(creatorPayoutAccounts)
      .where(eq(creatorPayoutAccounts.userId, userId))
      .limit(1);
    if (!account?.stripeConnectAccountId) {
      return { error: "connect_account_required" as const };
    }

    const availableRows = await this.db
      .select()
      .from(creatorEarnings)
      .where(and(eq(creatorEarnings.userId, userId), eq(creatorEarnings.status, "AVAILABLE")))
      .orderBy(asc(creatorEarnings.availableAt), asc(creatorEarnings.createdAt));

    const availableCents = availableRows.reduce((sum, row) => sum + row.netCents, 0);
    if (amountCents > availableCents) {
      return { error: "insufficient_available" as const, availableCents };
    }

    const stripe = stripeFromEnv();
    let transferId: string;
    if (stripe) {
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: "usd",
        destination: account.stripeConnectAccountId,
        metadata: { userId, type: "creator_earnings_withdraw" },
      });
      transferId = transfer.id;
    } else {
      transferId = `tr_stub_${uuidv7().replace(/-/g, "").slice(0, 20)}`;
    }

    const now = new Date();
    const payoutId = uuidv7();
    let remaining = amountCents;
    const consumedIds: string[] = [];
    let split: { row: (typeof availableRows)[number]; paidCents: number; leftoverCents: number } | null =
      null;

    for (const row of availableRows) {
      if (remaining <= 0) break;
      if (row.netCents <= remaining) {
        consumedIds.push(row.id);
        remaining -= row.netCents;
      } else {
        split = { row, paidCents: remaining, leftoverCents: row.netCents - remaining };
        remaining = 0;
        break;
      }
    }

    await this.db.transaction(async (tx) => {
      for (const id of consumedIds) {
        await tx
          .update(creatorEarnings)
          .set({ status: "PAID", stripeTransferId: transferId, updatedAt: now })
          .where(eq(creatorEarnings.id, id));
      }

      if (split) {
        await tx
          .update(creatorEarnings)
          .set({ netCents: split.leftoverCents, updatedAt: now })
          .where(eq(creatorEarnings.id, split.row.id));
        await tx.insert(creatorEarnings).values({
          id: uuidv7(),
          userId,
          sourceType: split.row.sourceType,
          sourceId: split.row.sourceId,
          grossCents: split.paidCents,
          platformFeeCents: 0,
          netCents: split.paidCents,
          balanceAfterCents: split.row.balanceAfterCents,
          status: "PAID",
          creatorTierAtTx: split.row.creatorTierAtTx,
          shareBps: split.row.shareBps,
          availableAt: split.row.availableAt,
          stripeTransferId: transferId,
          tipSideFeeCents: 0,
        });
      }

      await tx.insert(creatorPayouts).values({
        id: payoutId,
        userId,
        amountCents,
        stripeTransferId: transferId,
        status: "paid",
      });
    });

    return {
      payoutId,
      amountCents,
      stripeTransferId: transferId,
      mode: stripe ? ("stripe" as const) : ("stub" as const),
    };
  }

  async createConnectOnboardingLink(userId: string, returnUrl: string) {
    const stripe = stripeFromEnv();
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;

    if (stripe) {
      const [accountRow] = await this.db
        .select()
        .from(creatorPayoutAccounts)
        .where(eq(creatorPayoutAccounts.userId, userId))
        .limit(1);
      let accountId = accountRow?.stripeConnectAccountId ?? null;
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: "express",
          email: user.email,
          metadata: { userId },
        });
        accountId = account.id;
        if (accountRow) {
          await this.db
            .update(creatorPayoutAccounts)
            .set({ stripeConnectAccountId: accountId, updatedAt: new Date() })
            .where(eq(creatorPayoutAccounts.id, accountRow.id));
        } else {
          await this.db.insert(creatorPayoutAccounts).values({
            id: uuidv7(),
            userId,
            stripeConnectAccountId: accountId,
          });
        }
      }
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: returnUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });
      return { url: link.url, mode: "stripe" as const };
    }

    return {
      url: `${returnUrl.replace(/\/$/, "")}/billing/connect/stub?user=${userId}`,
      mode: "stub" as const,
    };
  }

  async createTip(fromUserId: string, input: z.infer<typeof tipInputSchema>, urls?: { successUrl: string; cancelUrl: string }) {
    const parsed = tipInputSchema.parse(input);
    const feeCents = Math.floor((parsed.amountCents * DEFAULT_FEE_BPS + 5000) / 10_000);
    const netCents = parsed.amountCents - feeCents;
    const stripe = stripeFromEnv();
    if (stripe && urls) {
      const [fromUser] = await this.db.select().from(users).where(eq(users.id, fromUserId)).limit(1);
      const [toUser] = await this.db.select().from(users).where(eq(users.id, parsed.toUserId)).limit(1);
      if (!fromUser || !toUser || fromUserId === parsed.toUserId) {
        return { tip: null, ledger: null, feeCents, netCents, checkout: null as { url: string; mode: "stripe" } | null };
      }
      const customerId = await this.ensureCustomer(stripe, fromUser);
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: parsed.amountCents,
              product_data: {
                name: `Tip for ${toUser.username}`,
                description: `Garage Talk tip from ${fromUser.username}`,
              },
            },
          },
        ],
        success_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
        metadata: {
          type: "tip",
          fromUserId,
          toUserId: parsed.toUserId,
          amountCents: String(parsed.amountCents),
          subjectType: parsed.subjectType ?? "",
          subjectId: parsed.subjectId ?? "",
        },
        integration_identifier: integrationIdentifier("gt_tip"),
      } as Stripe.Checkout.SessionCreateParams);
      return {
        tip: null,
        ledger: null,
        feeCents,
        netCents,
        checkout: { url: session.url, mode: "stripe" as const },
      };
    }
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

    return { tip: tip ?? null, ledger: ledger ?? null, feeCents, netCents, checkout: null };
  }

  private async ensureCustomer(
    stripe: Stripe,
    user: typeof users.$inferSelect,
  ): Promise<string> {
    if (user.stripeCustomerId) {
      try {
        await stripe.customers.retrieve(user.stripeCustomerId);
        return user.stripeCustomerId;
      } catch {
        // Customer missing in this Stripe environment — create a new one.
      }
    }
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id, username: user.username },
    });
    await this.db
      .update(users)
      .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return customer.id;
  }

  private async fulfillCheckout(object: Record<string, unknown>) {
    const metadata = (object.metadata ?? {}) as Record<string, string>;
    const type = metadata.type;
    if (type === "coin_pack" && this.gifts) {
      const paymentIntent =
        typeof object.payment_intent === "string" ? object.payment_intent : undefined;
      return this.gifts.creditCoinsFromCheckout(metadata, paymentIntent);
    }
    if (type === "tip") {
      return this.recordTipFromCheckout(object, metadata);
    }
    if (type === "marketplace" && metadata.orderId) {
      return this.fulfillMarketplaceOrder(metadata.orderId, object);
    }
    const customerId = typeof object.customer === "string" ? object.customer : null;
    const userId = metadata.userId;
    if (userId && customerId) {
      await this.db
        .update(users)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(users.id, userId));
      return true;
    }
    return false;
  }

  private async recordTipFromCheckout(object: Record<string, unknown>, metadata: Record<string, string>) {
    const fromUserId = metadata.fromUserId;
    const toUserId = metadata.toUserId;
    const amountCents = Number(metadata.amountCents);
    if (!fromUserId || !toUserId || !Number.isFinite(amountCents)) return false;
    const paymentIntent =
      typeof object.payment_intent === "string" ? object.payment_intent : `pi_tip_${uuidv7().slice(0, 18)}`;
    const existing = await this.db
      .select({ id: tips.id })
      .from(tips)
      .where(eq(tips.stripePaymentIntent, paymentIntent))
      .limit(1);
    if (existing[0]) return true;
    await this.createTip(fromUserId, {
      toUserId,
      amountCents,
      subjectType: metadata.subjectType || null,
      subjectId: metadata.subjectId || null,
    });
    const [tip] = await this.db.select().from(tips).where(eq(tips.fromUserId, fromUserId)).orderBy(desc(tips.createdAt)).limit(1);
    if (tip) {
      await this.db.update(tips).set({ stripePaymentIntent: paymentIntent }).where(eq(tips.id, tip.id));
    }
    return true;
  }

  private async fulfillMarketplaceOrder(orderId: string, object: Record<string, unknown>) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.state !== "pending") return Boolean(order);
    const paymentIntent =
      typeof object.payment_intent === "string" ? object.payment_intent : order.stripePaymentIntent;
    const [lastLedger] = await this.db
      .select()
      .from(creatorLedgers)
      .where(eq(creatorLedgers.userId, order.sellerId))
      .orderBy(desc(creatorLedgers.createdAt))
      .limit(1);
    const balanceAfter = (lastLedger?.balanceAfter ?? 0) + order.sellerNetCents;
    await this.db.update(orders).set({ state: "paid", stripePaymentIntent: paymentIntent, updatedAt: new Date() }).where(eq(orders.id, orderId));
    await this.db.insert(creatorLedgers).values({
      id: uuidv7(),
      userId: order.sellerId,
      entryType: "course_sale",
      amountCents: order.sellerNetCents,
      grossAmountCents: order.amountCents,
      applicationFeeCents: order.feeCents,
      subjectType: "marketplace_order",
      subjectId: orderId,
      stripePaymentIntent: paymentIntent,
      balanceAfter,
    });
    return true;
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

    await this.entitlements.syncFromStripeSubscription({
      userId: user.id,
      tier,
      status,
      providerSubscriptionId: sub.id,
      currentPeriodEnd,
    });
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
