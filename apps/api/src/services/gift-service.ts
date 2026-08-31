import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import {
  coinLedger,
  coinWallets,
  creatorEarnings,
  giftCatalog,
  liveGifts,
  liveSessions,
  revenueShareRules,
  users,
} from "@garagetalk/db";
import {
  COIN_PACKS,
  EARNINGS_HOLD_DAYS,
  REVENUE_SHARE_BPS,
  TIP_SIDE_FEE_BPS,
  resolveCoinPack,
  type CoinPackId,
  type SubscriptionTier,
} from "@garagetalk/shared";
import Stripe from "stripe";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { stripeFromEnv } from "./billing-service.js";

const COIN_PACK_IDS = [
  "pack_99",
  "pack_499",
  "pack_999",
  "pack_1999",
  "pack_4999",
  "pack_9999",
  "pack_100",
  "pack_500",
  "pack_1200",
  "pack_3000",
] as const;

export const sendGiftInputSchema = z.object({
  giftSlug: z.string().min(1).max(80),
  idempotencyKey: z.string().min(8).max(120),
});

export const coinCheckoutSchema = z.object({
  packId: z.enum(COIN_PACK_IDS),
});

export type LiveGiftEvent = {
  type: "live_gift";
  sessionId: string;
  gift: { slug: string; name: string; animationKey: string; coinCost: number };
  sender: { id: string; username: string };
  liveGiftId: string;
};

/**
 * SCT gift share math (integer cents + basis points).
 * 1 coin = $0.01 face value → grossCents = coinCost.
 * Tip-side fee is taken first; creator share applies to the remainder.
 */
export function computeGiftShare(input: {
  coinCost: number;
  tipSideFeeBps?: number;
  shareBps: number;
}): {
  grossCents: number;
  tipSideFeeCents: number;
  eligibleCents: number;
  creatorShareCents: number;
  platformFeeCents: number;
} {
  const tipSideFeeBps = input.tipSideFeeBps ?? TIP_SIDE_FEE_BPS;
  const grossCents = input.coinCost;
  const tipSideFeeCents = Math.floor((grossCents * tipSideFeeBps) / 10_000);
  const eligibleCents = grossCents - tipSideFeeCents;
  const creatorShareCents = Math.floor((eligibleCents * input.shareBps) / 10_000);
  const platformFeeCents = eligibleCents - creatorShareCents + tipSideFeeCents;
  return { grossCents, tipSideFeeCents, eligibleCents, creatorShareCents, platformFeeCents };
}

export class GiftService {
  constructor(private readonly db: Database) {}

  async listCatalog() {
    const rows = await this.db
      .select()
      .from(giftCatalog)
      .where(eq(giftCatalog.active, "true"))
      .orderBy(giftCatalog.sortOrder);
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      coinCost: row.coinCost,
      animationKey: row.animationKey,
    }));
  }

  async getWallet(userId: string) {
    const wallet = await this.ensureWallet(userId);
    return { balanceCoins: wallet.balanceCoins, packs: COIN_PACKS };
  }

  async createCoinCheckout(userId: string, packId: CoinPackId | string, successUrl: string, cancelUrl: string) {
    const pack = resolveCoinPack(packId);
    if (!pack) return null;

    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;

    const stripe = stripeFromEnv();
    if (!stripe) {
      return {
        url: `${cancelUrl.replace(/\/$/, "")}/billing/coins/stub?pack=${pack.id}&user=${userId}`,
        sessionId: `cs_coin_stub_${userId.slice(0, 8)}`,
        mode: "stub" as const,
        coins: pack.coins,
      };
    }

    const session = await stripe.checkout.sessions.create({
      customer: user.stripeCustomerId ?? undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email,
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pack.priceCents,
            product_data: {
              name: `Garage Talk ${pack.label}`,
              description: `${pack.coins} virtual coins for live gifts`,
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        type: "coin_pack",
        userId,
        packId: pack.id,
        coins: String(pack.coins),
      },
    } as Stripe.Checkout.SessionCreateParams);

    return { url: session.url, sessionId: session.id, mode: "stripe" as const, coins: pack.coins };
  }

  async creditCoinsFromCheckout(metadata: Record<string, string>, paymentIntent?: string) {
    const userId = metadata.userId;
    const coins = Number(metadata.coins);
    const packId = metadata.packId;
    if (!userId || !Number.isFinite(coins) || coins <= 0) return false;
    const idempotencyKey = paymentIntent ?? `coin_pack_${packId}_${userId}_${coins}`;
    return this.creditCoins(userId, coins, "coin_purchase", idempotencyKey, paymentIntent ?? null);
  }

  async sendGift(
    senderId: string,
    sessionId: string,
    input: z.infer<typeof sendGiftInputSchema>,
  ): Promise<{ event: LiveGiftEvent } | { error: string }> {
    const parsed = sendGiftInputSchema.parse(input);
    const [session] = await this.db.select().from(liveSessions).where(eq(liveSessions.id, sessionId)).limit(1);
    if (!session || session.endedAt) return { error: "session_not_found" };
    if (session.hostId === senderId) return { error: "self_gifting_not_allowed" };

    const [gift] = await this.db
      .select()
      .from(giftCatalog)
      .where(and(eq(giftCatalog.slug, parsed.giftSlug), eq(giftCatalog.active, "true")))
      .limit(1);
    if (!gift) return { error: "gift_not_found" };

    const existing = await this.db
      .select({ id: liveGifts.id })
      .from(liveGifts)
      .where(eq(liveGifts.idempotencyKey, parsed.idempotencyKey))
      .limit(1);
    if (existing[0]) {
      const [sender] = await this.db.select().from(users).where(eq(users.id, senderId)).limit(1);
      return {
        event: {
          type: "live_gift",
          sessionId,
          gift: { slug: gift.slug, name: gift.name, animationKey: gift.animationKey, coinCost: gift.coinCost },
          sender: { id: senderId, username: sender?.username ?? "guest" },
          liveGiftId: existing[0].id,
        },
      };
    }

    const wallet = await this.ensureWallet(senderId);
    if (wallet.balanceCoins < gift.coinCost) return { error: "insufficient_coins" };

    const [creator] = await this.db.select().from(users).where(eq(users.id, session.hostId)).limit(1);
    const creatorTier = (creator?.tier ?? "amateur") as SubscriptionTier;
    const shareBps = await this.resolveShareBps(creatorTier);
    const share = computeGiftShare({
      coinCost: gift.coinCost,
      tipSideFeeBps: TIP_SIDE_FEE_BPS,
      shareBps,
    });

    const liveGiftId = uuidv7();
    const now = new Date();
    const availableAt = new Date(now.getTime() + EARNINGS_HOLD_DAYS * 24 * 60 * 60 * 1000);

    await this.db.transaction(async (tx) => {
      const newBalance = wallet.balanceCoins - gift.coinCost;
      await tx
        .update(coinWallets)
        .set({ balanceCoins: newBalance, updatedAt: now })
        .where(eq(coinWallets.id, wallet.id));
      await tx.insert(coinLedger).values({
        id: uuidv7(),
        userId: senderId,
        deltaCoins: -gift.coinCost,
        balanceAfter: newBalance,
        entryType: "gift_send",
        referenceType: "live_gift",
        referenceId: liveGiftId,
        idempotencyKey: parsed.idempotencyKey,
      });
      await tx.insert(liveGifts).values({
        id: liveGiftId,
        sessionId,
        senderId,
        creatorId: session.hostId,
        giftId: gift.id,
        coinCost: gift.coinCost,
        creatorShareCents: share.creatorShareCents,
        idempotencyKey: parsed.idempotencyKey,
      });

      const [lastEarning] = await tx
        .select()
        .from(creatorEarnings)
        .where(eq(creatorEarnings.userId, session.hostId))
        .orderBy(desc(creatorEarnings.createdAt))
        .limit(1);
      const balanceAfterCents = (lastEarning?.balanceAfterCents ?? 0) + share.creatorShareCents;
      await tx.insert(creatorEarnings).values({
        id: uuidv7(),
        userId: session.hostId,
        sourceType: "live_gift",
        sourceId: liveGiftId,
        grossCents: share.grossCents,
        platformFeeCents: share.platformFeeCents,
        netCents: share.creatorShareCents,
        balanceAfterCents,
        status: "PENDING",
        creatorTierAtTx: creatorTier,
        shareBps,
        availableAt,
        tipSideFeeCents: share.tipSideFeeCents,
      });
    });

    const [sender] = await this.db.select().from(users).where(eq(users.id, senderId)).limit(1);
    return {
      event: {
        type: "live_gift",
        sessionId,
        gift: { slug: gift.slug, name: gift.name, animationKey: gift.animationKey, coinCost: gift.coinCost },
        sender: { id: senderId, username: sender?.username ?? "guest" },
        liveGiftId,
      },
    };
  }

  async getCreatorEarnings(userId: string) {
    const recent = await this.db
      .select()
      .from(creatorEarnings)
      .where(eq(creatorEarnings.userId, userId))
      .orderBy(desc(creatorEarnings.createdAt))
      .limit(20);

    const totals = await this.db
      .select({
        status: creatorEarnings.status,
        total: sql<number>`coalesce(sum(${creatorEarnings.netCents}), 0)`.mapWith(Number),
      })
      .from(creatorEarnings)
      .where(eq(creatorEarnings.userId, userId))
      .groupBy(creatorEarnings.status);

    const byStatus = Object.fromEntries(totals.map((row) => [row.status, row.total])) as Record<
      string,
      number
    >;

    return {
      balanceCents: byStatus.AVAILABLE ?? 0,
      pendingCents: byStatus.PENDING ?? 0,
      paidCents: byStatus.PAID ?? 0,
      entries: recent.map((row) => ({
        id: row.id,
        sourceType: row.sourceType,
        grossCents: row.grossCents,
        netCents: row.netCents,
        tipSideFeeCents: row.tipSideFeeCents,
        status: row.status,
        creatorTierAtTx: row.creatorTierAtTx,
        shareBps: row.shareBps,
        availableAt: row.availableAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  private async resolveShareBps(tier: SubscriptionTier): Promise<number> {
    const now = new Date();
    const [rule] = await this.db
      .select()
      .from(revenueShareRules)
      .where(
        and(
          eq(revenueShareRules.tier, tier),
          eq(revenueShareRules.revenueType, "live_gift"),
          lte(revenueShareRules.effectiveFrom, now),
          or(isNull(revenueShareRules.effectiveUntil), sql`${revenueShareRules.effectiveUntil} > ${now}`),
        ),
      )
      .orderBy(desc(revenueShareRules.effectiveFrom))
      .limit(1);

    if (rule) return rule.shareBps;
    return REVENUE_SHARE_BPS[tier] ?? REVENUE_SHARE_BPS.amateur;
  }

  private async ensureWallet(userId: string) {
    const [existing] = await this.db.select().from(coinWallets).where(eq(coinWallets.userId, userId)).limit(1);
    if (existing) return existing;
    const [created] = await this.db
      .insert(coinWallets)
      .values({ id: uuidv7(), userId, balanceCoins: 0 })
      .returning();
    return created!;
  }

  private async creditCoins(
    userId: string,
    coins: number,
    entryType: string,
    idempotencyKey: string,
    paymentIntent: string | null,
  ) {
    const dup = await this.db
      .select({ id: coinLedger.id })
      .from(coinLedger)
      .where(eq(coinLedger.idempotencyKey, idempotencyKey))
      .limit(1);
    if (dup[0]) return true;

    const wallet = await this.ensureWallet(userId);
    const newBalance = wallet.balanceCoins + coins;
    await this.db
      .update(coinWallets)
      .set({ balanceCoins: newBalance, updatedAt: new Date() })
      .where(eq(coinWallets.id, wallet.id));
    await this.db.insert(coinLedger).values({
      id: uuidv7(),
      userId,
      deltaCoins: coins,
      balanceAfter: newBalance,
      entryType,
      referenceType: "coin_pack",
      idempotencyKey,
      stripePaymentIntent: paymentIntent,
    });
    return true;
  }
}

// Re-export for settle helpers that iterate earnings by available_at
export { asc };
