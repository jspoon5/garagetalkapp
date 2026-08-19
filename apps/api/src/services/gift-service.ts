import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import {
  coinLedger,
  coinWallets,
  creatorEarnings,
  giftCatalog,
  liveGifts,
  liveSessions,
  users,
} from "@garagetalk/db";
import { COIN_PACKS, GIFT_PLATFORM_FEE_BPS, type CoinPackId } from "@garagetalk/shared";
import Stripe from "stripe";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { stripeFromEnv } from "./billing-service.js";

export const sendGiftInputSchema = z.object({
  giftSlug: z.string().min(1).max(80),
  idempotencyKey: z.string().min(8).max(120),
});

export const coinCheckoutSchema = z.object({
  packId: z.enum(["pack_100", "pack_500", "pack_1200", "pack_3000"]),
});

export type LiveGiftEvent = {
  type: "live_gift";
  sessionId: string;
  gift: { slug: string; name: string; animationKey: string; coinCost: number };
  sender: { id: string; username: string };
  liveGiftId: string;
};

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

  async createCoinCheckout(userId: string, packId: CoinPackId, successUrl: string, cancelUrl: string) {
    const pack = COIN_PACKS.find((p) => p.id === packId);
    if (!pack) return null;

    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;

    const stripe = stripeFromEnv();
    if (!stripe) {
      return {
        url: `${cancelUrl.replace(/\/$/, "")}/billing/coins/stub?pack=${packId}&user=${userId}`,
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
        packId,
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

    const creatorShareCents = Math.floor((gift.coinCost * (100 - GIFT_PLATFORM_FEE_BPS / 100)) / 10);
    const liveGiftId = uuidv7();
    const now = new Date();

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
        creatorShareCents,
        idempotencyKey: parsed.idempotencyKey,
      });

      const [lastEarning] = await tx
        .select()
        .from(creatorEarnings)
        .where(eq(creatorEarnings.userId, session.hostId))
        .orderBy(desc(creatorEarnings.createdAt))
        .limit(1);
      const balanceAfterCents = (lastEarning?.balanceAfterCents ?? 0) + creatorShareCents;
      await tx.insert(creatorEarnings).values({
        id: uuidv7(),
        userId: session.hostId,
        sourceType: "live_gift",
        sourceId: liveGiftId,
        grossCents: gift.coinCost,
        platformFeeCents: gift.coinCost - creatorShareCents,
        netCents: creatorShareCents,
        balanceAfterCents,
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
    const [last] = await this.db
      .select()
      .from(creatorEarnings)
      .where(eq(creatorEarnings.userId, userId))
      .orderBy(desc(creatorEarnings.createdAt))
      .limit(1);
    const recent = await this.db
      .select()
      .from(creatorEarnings)
      .where(eq(creatorEarnings.userId, userId))
      .orderBy(desc(creatorEarnings.createdAt))
      .limit(20);
    return {
      balanceCents: last?.balanceAfterCents ?? 0,
      entries: recent.map((row) => ({
        id: row.id,
        sourceType: row.sourceType,
        grossCents: row.grossCents,
        netCents: row.netCents,
        createdAt: row.createdAt.toISOString(),
      })),
    };
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
