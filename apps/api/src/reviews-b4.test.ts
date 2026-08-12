import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

function cookieFrom(response: { headers: Record<string, string | number | string[] | undefined> }) {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

describe("B4 reviews", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerCookie: string;
  let buyerCookie: string;
  let secondBuyerCookie: string;
  let shopId: string;
  let serviceId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"] });
    ownerCookie = (await register("reviews-owner@example.com", "reviewsowner")).cookie;
    buyerCookie = (await register("reviews-buyer@example.com", "reviewsbuyer")).cookie;
    secondBuyerCookie = (await register("reviews-buyer2@example.com", "reviewsbuyer2")).cookie;
    shopId = await createShop(ownerCookie, "review-shop");
    serviceId = await createService(ownerCookie, shopId);
    const weekday = new Date("2030-01-07T15:00:00Z").getUTCDay();
    await app.inject({
      method: "POST",
      url: `/shops/${shopId}/availability/rules`,
      headers: { cookie: ownerCookie },
      payload: { weekday, openTime: "09:00", closeTime: "18:00" },
    });
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  it("requires completed transactions and recomputes aggregates", async () => {
    const firstBooking = await requestBooking(buyerCookie, "2030-01-07T15:00:00.000Z");
    const rejected = await app.inject({
      method: "POST",
      url: "/shops/reviews",
      headers: { cookie: buyerCookie },
      payload: { transactionType: "booking", transactionId: firstBooking, rating: 5 },
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error).toBe("verified_transaction_required");

    await transition(firstBooking, "confirm");
    await transition(firstBooking, "complete");
    const review = await app.inject({
      method: "POST",
      url: "/shops/reviews",
      headers: { cookie: buyerCookie },
      payload: { transactionType: "booking", transactionId: firstBooking, rating: 5, body: "Great" },
    });
    expect(review.statusCode).toBe(201);
    const reviewId = review.json().review.id as string;

    const secondBooking = await requestBooking(secondBuyerCookie, "2030-01-07T16:00:00.000Z");
    await transition(secondBooking, "confirm");
    await transition(secondBooking, "complete");
    await app.inject({
      method: "POST",
      url: "/shops/reviews",
      headers: { cookie: secondBuyerCookie },
      payload: { transactionType: "booking", transactionId: secondBooking, rating: 3 },
    });

    const aggregate = await app.inject({
      method: "POST",
      url: `/shops/${shopId}/reviews/recompute`,
      headers: { cookie: ownerCookie },
    });
    expect(aggregate.statusCode).toBe(200);
    expect(aggregate.json().shop.reviewCount).toBe(2);
    expect(aggregate.json().shop.averageRating).toBe(4);

    const response = await app.inject({
      method: "POST",
      url: `/shops/reviews/${reviewId}/owner-response`,
      headers: { cookie: ownerCookie },
      payload: { body: "Thanks for trusting us." },
    });
    expect(response.json().review.ownerResponse).toContain("Thanks");

    const report = await app.inject({
      method: "POST",
      url: `/shops/reviews/${reviewId}/report`,
      headers: { cookie: secondBuyerCookie },
      payload: { reason: "suspect" },
    });
    expect(report.json().review.reportStatus).toBe("reported");

    const appeal = await app.inject({
      method: "POST",
      url: `/shops/reviews/${reviewId}/appeal`,
      headers: { cookie: ownerCookie },
    });
    expect(appeal.json().review.appealStatus).toBe("appealed");
  });

  async function register(email: string, username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, username, password: "correct-horse-battery" },
    });
    return { cookie: cookieFrom(res) };
  }

  async function createShop(cookie: string, slug: string) {
    const res = await app.inject({
      method: "POST",
      url: "/shops",
      headers: { cookie },
      payload: { name: slug, slug },
    });
    return res.json().shop.id as string;
  }

  async function createService(cookie: string, id: string) {
    const res = await app.inject({
      method: "POST",
      url: `/shops/${id}/services`,
      headers: { cookie },
      payload: { name: "Oil change", durationMin: 60 },
    });
    return res.json().service.id as string;
  }

  async function requestBooking(cookie: string, scheduledAt: string) {
    const res = await app.inject({
      method: "POST",
      url: "/shops/bookings",
      headers: { cookie },
      payload: { shopId, serviceId, scheduledAt },
    });
    expect(res.statusCode).toBe(201);
    return res.json().booking.id as string;
  }

  async function transition(bookingId: string, action: "confirm" | "complete") {
    const res = await app.inject({
      method: "POST",
      url: `/shops/bookings/${bookingId}/${action}`,
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(200);
  }
});
