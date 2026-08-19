import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import {
  creatorLedgers,
  listings,
  orders,
  reactions,
  serviceRecords,
  vehicles,
  type Database,
} from "@garagetalk/db";
import Stripe from "stripe";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { stripeFromEnv } from "./billing-service.js";
import { reactionIdsForUser, toggleReaction } from "./reaction-store.js";

const listingKindSchema = z.enum(["part", "vehicle", "tool", "accessory", "service"]);
const orderStateSchema = z.enum(["pending", "paid", "shipped", "delivered", "disputed", "refunded"]);
const emptyFitment = { years: [], makes: [], models: [], vinPatterns: [] };

export const fitmentSchema = z
  .object({
    years: z.array(z.number().int().min(1900).max(2100)).default([]),
    makes: z.array(z.string().min(1).max(64)).default([]),
    models: z.array(z.string().min(1).max(64)).default([]),
    vinPatterns: z.array(z.string().min(1).max(32)).default([]),
  })
  .default(emptyFitment);

export const listingInputSchema = z.object({
  kind: listingKindSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(2_000).nullable().optional(),
  priceCents: z.number().int().min(100).max(10_000_000),
  condition: z.string().min(1).max(80),
  photos: z.array(z.string().url()).max(12).default([]),
  fitment: fitmentSchema,
  vehicleId: z.string().uuid().nullable().optional(),
  provenanceServiceRecordIds: z.array(z.string().uuid()).max(8).default([]),
});

export const listingUpdateSchema = listingInputSchema.partial();
export const marketplaceSearchSchema = z.object({
  q: z.string().max(120).optional(),
  kind: listingKindSchema.optional(),
  condition: z.string().max(80).optional(),
});
export const purchaseInputSchema = z.object({
  shipping: z.record(z.unknown()).default({}),
});
export const orderTransitionInputSchema = z.object({ state: orderStateSchema });

type Fitment = z.infer<typeof fitmentSchema>;
type Listing = typeof listings.$inferSelect;
type Vehicle = typeof vehicles.$inferSelect;
type OrderState = z.infer<typeof orderStateSchema>;

const nextStates: Record<OrderState, OrderState[]> = {
  pending: ["paid"],
  paid: ["shipped", "disputed", "refunded"],
  shipped: ["delivered", "disputed", "refunded"],
  delivered: ["disputed"],
  disputed: ["refunded"],
  refunded: [],
};

export class MarketplaceService {
  constructor(private readonly db: Database) {}

  async createListing(sellerId: string, input: z.infer<typeof listingInputSchema>) {
    const parsed = listingInputSchema.parse(input);
    await this.assertVehicleOwner(sellerId, parsed.vehicleId ?? null);
    const provenance = await this.provenanceFor(sellerId, parsed.provenanceServiceRecordIds);
    const [listing] = await this.db
      .insert(listings)
      .values({
        id: uuidv7(),
        sellerId,
        kind: parsed.kind,
        title: parsed.title,
        description: parsed.description ?? null,
        priceCents: parsed.priceCents,
        condition: parsed.condition,
        photos: parsed.photos,
        fitment: parsed.fitment,
        provenance,
        vehicleId: parsed.vehicleId ?? null,
      })
      .returning();
    return listing!;
  }

  async updateListing(sellerId: string, listingId: string, input: z.infer<typeof listingUpdateSchema>) {
    const parsed = listingUpdateSchema.parse(input);
    if (parsed.vehicleId !== undefined) await this.assertVehicleOwner(sellerId, parsed.vehicleId);
    const provenanceIds = parsed.provenanceServiceRecordIds ?? [];
    const provenance = provenanceIds.length > 0 ? await this.provenanceFor(sellerId, provenanceIds) : undefined;
    const [listing] = await this.db
      .update(listings)
      .set({
        kind: parsed.kind,
        title: parsed.title,
        description: parsed.description,
        priceCents: parsed.priceCents,
        condition: parsed.condition,
        photos: parsed.photos,
        fitment: parsed.fitment,
        provenance,
        vehicleId: parsed.vehicleId,
        updatedAt: new Date(),
      })
      .where(and(eq(listings.id, listingId), eq(listings.sellerId, sellerId), isNull(listings.deletedAt)))
      .returning();
    return listing ?? null;
  }

  async deleteListing(sellerId: string, listingId: string) {
    const [listing] = await this.db
      .update(listings)
      .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(listings.id, listingId), eq(listings.sellerId, sellerId), isNull(listings.deletedAt)))
      .returning();
    return listing ?? null;
  }

  async searchListings(buyerId: string | null, query: z.infer<typeof marketplaceSearchSchema>) {
    const parsed = marketplaceSearchSchema.parse(query);
    const base = and(eq(listings.status, "active"), isNull(listings.deletedAt));
    const textFilter = parsed.q
      ? or(ilike(listings.title, `%${parsed.q}%`), ilike(listings.description, `%${parsed.q}%`))
      : undefined;
    const rows = await this.db
      .select()
      .from(listings)
      .where(textFilter ? and(base, textFilter) : base)
      .orderBy(desc(listings.createdAt))
      .limit(100);
    const filtered = rows.filter(
      (row) =>
        (!parsed.kind || row.kind === parsed.kind) &&
        (!parsed.condition || row.condition === parsed.condition),
    );
    const garage = buyerId
      ? await this.db
          .select()
          .from(vehicles)
          .where(and(eq(vehicles.userId, buyerId), isNull(vehicles.deletedAt)))
      : [];
    const savedIds = buyerId
      ? await reactionIdsForUser(
          this.db,
          buyerId,
          "listing",
          filtered.map((row) => row.id),
        )
      : new Set<string>();
    return {
      listings: filtered.map((row) => ({ ...badge(row, garage), saved: savedIds.has(row.id) })),
      facets: facets(filtered),
    };
  }

  async toggleFavorite(userId: string, listingId: string) {
    const [listing] = await this.db
      .select({ id: listings.id })
      .from(listings)
      .where(and(eq(listings.id, listingId), eq(listings.status, "active"), isNull(listings.deletedAt)))
      .limit(1);
    if (!listing) return null;
    return toggleReaction(this.db, userId, "listing", listingId, "save");
  }

  async listSaved(userId: string) {
    const saved = await this.db
      .select({ subjectId: reactions.subjectId })
      .from(reactions)
      .where(and(eq(reactions.userId, userId), eq(reactions.subjectType, "listing")));
    const ids = saved.map((row) => row.subjectId);
    if (ids.length === 0) return { listings: [] as Array<ReturnType<typeof badge> & { saved: boolean }> };
    const rows = await this.db
      .select()
      .from(listings)
      .where(and(inArray(listings.id, ids), isNull(listings.deletedAt)));
    return { listings: rows.map((row) => ({ ...badge(row, []), saved: true })) };
  }

  async sellerDashboard(sellerId: string) {
    const sellerListings = await this.db
      .select()
      .from(listings)
      .where(and(eq(listings.sellerId, sellerId), isNull(listings.deletedAt)));
    const sellerOrders = await this.db
      .select()
      .from(orders)
      .where(eq(orders.sellerId, sellerId))
      .orderBy(desc(orders.createdAt));
    const totals = sellerOrders.reduce(
      (sum, order) => ({
        grossCents: sum.grossCents + order.amountCents,
        feeCents: sum.feeCents + order.feeCents,
        netCents: sum.netCents + order.sellerNetCents,
      }),
      { grossCents: 0, feeCents: 0, netCents: 0 },
    );
    return { listings: sellerListings, orders: sellerOrders, totals };
  }

  async purchase(buyerId: string, listingId: string, input: z.infer<typeof purchaseInputSchema>) {
    const parsed = purchaseInputSchema.parse(input);
    const [listing] = await this.db
      .select()
      .from(listings)
      .where(and(eq(listings.id, listingId), eq(listings.status, "active"), isNull(listings.deletedAt)))
      .limit(1);
    if (!listing || listing.sellerId === buyerId) return null;
    const feeCents = platformFee(listing.priceCents);
    const sellerNetCents = listing.priceCents - feeCents;
    const orderId = uuidv7();
    const stripe = stripeFromEnv();
    const paymentIntent = stripe ? `pi_pending_${orderId.replace(/-/g, "").slice(0, 12)}` : `pi_market_${orderId.replace(/-/g, "").slice(0, 18)}`;
    const markPaid = !stripe;

    await this.db.transaction(async (tx) => {
      await tx.insert(orders).values({
        id: orderId,
        listingId,
        buyerId,
        sellerId: listing.sellerId,
        amountCents: listing.priceCents,
        feeCents,
        sellerNetCents,
        stripePaymentIntent: paymentIntent,
        state: markPaid ? "paid" : "pending",
        shipping: parsed.shipping,
      });
      if (markPaid) {
        const balanceAfter = (await this.lastBalance(listing.sellerId)) + sellerNetCents;
        await tx.insert(creatorLedgers).values({
          id: uuidv7(),
          userId: listing.sellerId,
          entryType: "course_sale",
          amountCents: sellerNetCents,
          grossAmountCents: listing.priceCents,
          applicationFeeCents: feeCents,
          subjectType: "marketplace_order",
          subjectId: orderId,
          stripePaymentIntent: paymentIntent,
          balanceAfter,
        });
      }
    });
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (stripe) {
      const base = process.env.APP_BASE_URL ?? "http://localhost:5173";
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: listing.priceCents,
              product_data: { name: listing.title, description: listing.description ?? "Garage Talk marketplace" },
            },
          },
        ],
        success_url: `${base}/?market=success`,
        cancel_url: `${base}/?market=cancel`,
        metadata: { type: "marketplace", orderId, listingId, buyerId },
        integration_identifier: `gt_mkt_${orderId.replace(/-/g, "").slice(0, 8)}`,
      } as Stripe.Checkout.SessionCreateParams);
      return {
        order: order!,
        feeCents,
        sellerNetCents,
        payment: {
          mode: "stripe" as const,
          destinationCharge: true,
          paymentIntent,
          applicationFeeCents: feeCents,
          url: session.url,
        },
        checkout: { url: session.url, mode: "stripe" as const },
      };
    }
    return {
      order: order!,
      feeCents,
      sellerNetCents,
      payment: { mode: "stub" as const, destinationCharge: true, paymentIntent, applicationFeeCents: feeCents },
      checkout: null,
    };
  }

  async transitionOrder(actorId: string, orderId: string, next: OrderState) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || (order.buyerId !== actorId && order.sellerId !== actorId)) return null;
    if (!nextStates[order.state].includes(next)) return null;
    const [updated] = await this.db
      .update(orders)
      .set({ state: next, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    return updated ?? null;
  }

  async refund(actorId: string, orderId: string) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || (order.buyerId !== actorId && order.sellerId !== actorId)) return null;
    if (!["paid", "shipped", "delivered", "disputed"].includes(order.state)) return null;
    const balanceAfter = (await this.lastBalance(order.sellerId)) - order.sellerNetCents;
    const [updated] = await this.db
      .update(orders)
      .set({ state: "refunded", updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    await this.db.insert(creatorLedgers).values({
      id: uuidv7(),
      userId: order.sellerId,
      entryType: "adjustment",
      amountCents: -order.sellerNetCents,
      grossAmountCents: -order.amountCents,
      applicationFeeCents: -order.feeCents,
      subjectType: "marketplace_refund",
      subjectId: orderId,
      stripePaymentIntent: order.stripePaymentIntent,
      balanceAfter,
    });
    return updated ?? null;
  }

  private async provenanceFor(sellerId: string, ids: string[]) {
    if (ids.length === 0) return { serviceRecords: [] };
    const garage = await this.db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.userId, sellerId), isNull(vehicles.deletedAt)));
    const vehicleIds = garage.map((vehicle) => vehicle.id);
    if (vehicleIds.length === 0) return { serviceRecords: [] };
    const rows = await this.db
      .select()
      .from(serviceRecords)
      .where(and(inArray(serviceRecords.id, ids), inArray(serviceRecords.vehicleId, vehicleIds)));
    return {
      serviceRecords: rows.map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        date: row.date.toISOString(),
        mileage: row.mileage,
      })),
    };
  }

  private async assertVehicleOwner(userId: string, vehicleId: string | null | undefined) {
    if (!vehicleId) return;
    const rows = await this.db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.userId, userId), eq(vehicles.id, vehicleId), isNull(vehicles.deletedAt)))
      .limit(1);
    if (!rows[0]) throw new Error("vehicle_not_found");
  }

  private async lastBalance(userId: string) {
    const [last] = await this.db
      .select({ balanceAfter: creatorLedgers.balanceAfter })
      .from(creatorLedgers)
      .where(eq(creatorLedgers.userId, userId))
      .orderBy(desc(creatorLedgers.createdAt))
      .limit(1);
    return last?.balanceAfter ?? 0;
  }
}

function facets(rows: Listing[]) {
  return rows.reduce(
    (acc, row) => {
      acc.kinds[row.kind] = (acc.kinds[row.kind] ?? 0) + 1;
      if (row.condition) acc.conditions[row.condition] = (acc.conditions[row.condition] ?? 0) + 1;
      return acc;
    },
    { kinds: {} as Record<string, number>, conditions: {} as Record<string, number> },
  );
}

function badge(listing: Listing, garage: Vehicle[]) {
  const fitment = fitmentSchema.catch(emptyFitment).parse(listing.fitment ?? {});
  return { ...listing, fitsYourVehicle: garage.some((vehicle) => matchesFitment(vehicle, fitment)) };
}

function matchesFitment(vehicle: Vehicle, fitment: Fitment) {
  const make = vehicle.make.toLowerCase();
  const model = vehicle.model.toLowerCase();
  const vin = (vehicle.vin ?? "").toLowerCase();
  return (
    (fitment.years.length === 0 || fitment.years.includes(vehicle.year)) &&
    (fitment.makes.length === 0 || fitment.makes.map((item) => item.toLowerCase()).includes(make)) &&
    (fitment.models.length === 0 || fitment.models.map((item) => item.toLowerCase()).includes(model)) &&
    (fitment.vinPatterns.length === 0 ||
      fitment.vinPatterns.some((pattern) => vinMatches(vin, pattern.toLowerCase())))
  );
}

function vinMatches(vin: string, pattern: string) {
  if (!vin) return false;
  if (!pattern.includes("*")) return vin === pattern;
  const [start, end] = pattern.split("*");
  return vin.startsWith(start ?? "") && vin.endsWith(end ?? "");
}

function platformFee(amountCents: number) {
  return Math.floor((amountCents * 1_000 + 5_000) / 10_000);
}
