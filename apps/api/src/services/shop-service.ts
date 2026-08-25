import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import {
  bookings,
  listings,
  orders,
  shopReviews,
  shops,
  shopVerificationRequests,
} from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

const shopAddressSchema = z.object({
  city: z.string().min(1).max(120).optional(),
  state: z.string().max(80).optional(),
  line1: z.string().max(200).optional(),
});

export const shopInputSchema = z.object({
  name: z.string().min(1).max(160),
  slug: z.string().min(3).max(120).regex(/^[a-z0-9-]+$/),
  about: z.string().max(4000).nullable().optional(),
  address: shopAddressSchema.optional(),
  serviceArea: z.string().max(500).nullable().optional(),
  specialties: z.array(z.string().min(1).max(80)).max(30).optional(),
  photos: z.array(z.string().url()).max(30).optional(),
  credentialsMedia: z.array(z.string().url()).max(20).optional(),
});

export const verificationInputSchema = z.object({
  kind: z.enum(["shop", "veteran_owned", "disabled_owned"]),
  documentMedia: z.array(z.string().url()).min(1).max(20),
});

export const verificationDecisionSchema = z.object({
  status: z.enum(["verified", "rejected"]),
  notes: z.string().max(1000).nullable().optional(),
});

export const reviewInputSchema = z.object({
  transactionType: z.enum(["booking", "order"]),
  transactionId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(4000).nullable().optional(),
});

export const ownerResponseSchema = z.object({
  body: z.string().min(1).max(2000),
});

export const reportReviewSchema = z.object({
  reason: z.string().min(1).max(500),
});

type VerificationKind = z.infer<typeof verificationInputSchema>["kind"];

function statusColumn(kind: VerificationKind) {
  if (kind === "veteran_owned") return "veteranOwnedStatus" as const;
  if (kind === "disabled_owned") return "disabledOwnedStatus" as const;
  return "verificationStatus" as const;
}

function decorateShop(row: typeof shops.$inferSelect) {
  const averageRating = row.reviewCount === 0 ? 0 : row.ratingSum / row.reviewCount;
  return {
    ...row,
    averageRating,
    badges: {
      verified: row.verificationStatus === "verified",
      veteranOwned: row.veteranOwnedStatus === "verified",
      disabledOwned: row.disabledOwnedStatus === "verified",
    },
    unverified: row.verificationStatus !== "verified",
  };
}

export class ShopService {
  constructor(private readonly db: Database) {}

  async createShop(ownerUserId: string, input: z.infer<typeof shopInputSchema>) {
    const body = shopInputSchema.parse(input);
    const [shop] = await this.db
      .insert(shops)
      .values({
        id: uuidv7(),
        ownerUserId,
        name: body.name,
        slug: body.slug,
        about: body.about ?? null,
        address: body.address ?? {},
        serviceArea: body.serviceArea ?? null,
        specialties: body.specialties ?? [],
        photos: body.photos ?? [],
        credentialsMedia: body.credentialsMedia ?? [],
      })
      .returning();
    return shop ? decorateShop(shop) : null;
  }

  async listShops() {
    const rows = await this.db
      .select()
      .from(shops)
      .where(isNull(shops.deletedAt))
      .orderBy(desc(shops.createdAt))
      .limit(50);
    return rows.map(decorateShop);
  }

  async getShopBySlug(slug: string) {
    const [shop] = await this.db.select().from(shops).where(eq(shops.slug, slug)).limit(1);
    return shop ? decorateShop(shop) : null;
  }

  async updateShop(ownerUserId: string, shopId: string, input: Partial<z.infer<typeof shopInputSchema>>) {
    const body = shopInputSchema.partial().parse(input);
    const [shop] = await this.db
      .update(shops)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(shops.id, shopId), eq(shops.ownerUserId, ownerUserId)))
      .returning();
    return shop ? decorateShop(shop) : null;
  }

  async submitVerification(shopId: string, userId: string, input: z.infer<typeof verificationInputSchema>) {
    const body = verificationInputSchema.parse(input);
    const shop = await this.requireOwnedShop(shopId, userId);
    if (!shop) return null;
    const [request] = await this.db
      .insert(shopVerificationRequests)
      .values({
        id: uuidv7(),
        shopId,
        requestedById: userId,
        kind: body.kind,
        documentMedia: body.documentMedia,
      })
      .returning();
    await this.db
      .update(shops)
      .set({ [statusColumn(body.kind)]: "pending", updatedAt: new Date() })
      .where(eq(shops.id, shopId));
    return request ?? null;
  }

  async listVerificationQueue() {
    return this.db
      .select()
      .from(shopVerificationRequests)
      .where(eq(shopVerificationRequests.status, "pending"))
      .orderBy(desc(shopVerificationRequests.createdAt));
  }

  async reviewVerification(adminId: string, requestId: string, input: z.infer<typeof verificationDecisionSchema>) {
    const body = verificationDecisionSchema.parse(input);
    const [request] = await this.db
      .select()
      .from(shopVerificationRequests)
      .where(eq(shopVerificationRequests.id, requestId))
      .limit(1);
    if (!request) return null;
    const [updated] = await this.db
      .update(shopVerificationRequests)
      .set({
        status: body.status,
        reviewerId: adminId,
        decisionNotes: body.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(shopVerificationRequests.id, requestId))
      .returning();
    await this.db
      .update(shops)
      .set({ [statusColumn(request.kind as VerificationKind)]: body.status, updatedAt: new Date() })
      .where(eq(shops.id, request.shopId));
    return updated ?? null;
  }

  async appealVerification(userId: string, requestId: string, input: z.infer<typeof verificationInputSchema>) {
    const body = verificationInputSchema.parse(input);
    const [request] = await this.db
      .select()
      .from(shopVerificationRequests)
      .where(eq(shopVerificationRequests.id, requestId))
      .limit(1);
    if (!request || request.requestedById !== userId || request.status !== "rejected") return null;
    const [appeal] = await this.db
      .insert(shopVerificationRequests)
      .values({
        id: uuidv7(),
        shopId: request.shopId,
        requestedById: userId,
        kind: body.kind,
        documentMedia: body.documentMedia,
        appealOfId: request.id,
      })
      .returning();
    await this.db
      .update(shops)
      .set({ [statusColumn(body.kind)]: "pending", updatedAt: new Date() })
      .where(eq(shops.id, request.shopId));
    return appeal ?? null;
  }

  async createReview(userId: string, input: z.infer<typeof reviewInputSchema>) {
    const body = reviewInputSchema.parse(input);
    const verified = await this.resolveCompletedTransaction(userId, body);
    if (!verified) return { error: "verified_transaction_required" as const };
    const [review] = await this.db
      .insert(shopReviews)
      .values({
        id: uuidv7(),
        bookingId: body.transactionType === "booking" ? body.transactionId : null,
        orderId: body.transactionType === "order" ? body.transactionId : null,
        shopId: verified.shopId,
        userId,
        rating: body.rating,
        body: body.body ?? null,
      })
      .returning();
    await this.recomputeReviewAggregates(verified.shopId);
    return { review: review ?? null };
  }

  async ownerRespond(ownerUserId: string, reviewId: string, body: string) {
    const review = await this.getOwnedReview(ownerUserId, reviewId);
    if (!review) return null;
    const [updated] = await this.db
      .update(shopReviews)
      .set({ ownerResponse: body, updatedAt: new Date() })
      .where(eq(shopReviews.id, reviewId))
      .returning();
    return updated ?? null;
  }

  async reportReview(reviewId: string) {
    const [review] = await this.db
      .update(shopReviews)
      .set({ reportStatus: "reported", updatedAt: new Date() })
      .where(eq(shopReviews.id, reviewId))
      .returning();
    return review ?? null;
  }

  async appealReview(ownerUserId: string, reviewId: string) {
    const review = await this.getOwnedReview(ownerUserId, reviewId);
    if (!review) return null;
    const [updated] = await this.db
      .update(shopReviews)
      .set({ appealStatus: "appealed", updatedAt: new Date() })
      .where(eq(shopReviews.id, reviewId))
      .returning();
    return updated ?? null;
  }

  async recomputeReviewAggregates(shopId: string) {
    const rows = await this.db.select().from(shopReviews).where(eq(shopReviews.shopId, shopId));
    const ratingSum = rows.reduce((sum, row) => sum + row.rating, 0);
    const [shop] = await this.db
      .update(shops)
      .set({ reviewCount: rows.length, ratingSum, updatedAt: new Date() })
      .where(eq(shops.id, shopId))
      .returning();
    return shop ? decorateShop(shop) : null;
  }

  private async requireOwnedShop(shopId: string, userId: string) {
    const [shop] = await this.db
      .select()
      .from(shops)
      .where(and(eq(shops.id, shopId), eq(shops.ownerUserId, userId)))
      .limit(1);
    return shop ?? null;
  }

  private async getOwnedReview(ownerUserId: string, reviewId: string) {
    const [row] = await this.db
      .select({ review: shopReviews })
      .from(shopReviews)
      .innerJoin(shops, eq(shopReviews.shopId, shops.id))
      .where(and(eq(shopReviews.id, reviewId), eq(shops.ownerUserId, ownerUserId)))
      .limit(1);
    return row?.review ?? null;
  }

  private async resolveCompletedTransaction(
    userId: string,
    body: z.infer<typeof reviewInputSchema>,
  ): Promise<{ shopId: string } | null> {
    if (body.transactionType === "booking") {
      const [booking] = await this.db
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, body.transactionId), eq(bookings.userId, userId)))
        .limit(1);
      return booking?.status === "completed" ? { shopId: booking.shopId } : null;
    }
    const [order] = await this.db
      .select({ order: orders, listing: listings })
      .from(orders)
      .innerJoin(listings, eq(orders.listingId, listings.id))
      .where(and(eq(orders.id, body.transactionId), eq(orders.buyerId, userId)))
      .limit(1);
    if (order?.order.state !== "delivered" || !order.listing.shopId) return null;
    return { shopId: order.listing.shopId };
  }
}
