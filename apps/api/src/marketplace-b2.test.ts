import { creatorLedgers, serviceRecords } from "@garagetalk/db";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

function cookieFrom(response: {
  headers: Record<string, string | number | string[] | undefined>;
}): string {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

describe("B2 marketplace", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sellerCookie: string;
  let buyerCookie: string;
  let sellerId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"] });
    const seller = await register("seller-b2@example.com", "sellerb2");
    const buyer = await register("buyer-b2@example.com", "buyerb2");
    sellerCookie = seller.cookie;
    buyerCookie = buyer.cookie;
    sellerId = seller.id;
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  it("handles listing CRUD, fitment facets, purchase, state changes, and refund math", async () => {
    const sellerVehicle = await vehicle(sellerCookie, "Honda", "Civic", 2018);
    const buyerVehicle = await vehicle(buyerCookie, "Honda", "Civic", 2018);
    expect(buyerVehicle).toBeTruthy();
    const serviceRecordId = uuidv7();
    await ctx.db.insert(serviceRecords).values({
      id: serviceRecordId,
      vehicleId: sellerVehicle,
      date: new Date("2025-01-02T00:00:00Z"),
      mileage: 42_000,
      kind: "brakes",
      title: "Front rotor replacement",
    });

    const listing = await app.inject({
      method: "POST",
      url: "/marketplace/listings",
      headers: { cookie: sellerCookie },
      payload: {
        kind: "part",
        title: "Civic brake kit",
        description: "Fresh pads and rotors",
        priceCents: 12_345,
        condition: "new",
        photos: ["https://cdn.garagetalk.test/kit.jpg"],
        fitment: { years: [2018], makes: ["Honda"], models: ["Civic"] },
        vehicleId: sellerVehicle,
        provenanceServiceRecordIds: [serviceRecordId],
      },
    });
    expect(listing.statusCode).toBe(201);
    const listingId = listing.json().listing.id as string;
    const provenance = listing.json().listing.provenance as { serviceRecords: Array<{ title: string }> };
    expect(provenance.serviceRecords[0]?.title).toBe("Front rotor replacement");

    const nonMatch = await app.inject({
      method: "POST",
      url: "/marketplace/listings",
      headers: { cookie: sellerCookie },
      payload: {
        kind: "tool",
        title: "Truck lift puck",
        priceCents: 2_500,
        condition: "used",
        fitment: { years: [2020], makes: ["Ford"], models: ["F-150"] },
      },
    });
    expect(nonMatch.statusCode).toBe(201);

    const update = await app.inject({
      method: "PATCH",
      url: `/marketplace/listings/${listingId}`,
      headers: { cookie: sellerCookie },
      payload: { condition: "new-open-box" },
    });
    expect(update.statusCode).toBe(200);

    const search = await app.inject({
      method: "GET",
      url: "/marketplace/listings?q=brake",
      headers: { cookie: buyerCookie },
    });
    expect(search.statusCode).toBe(200);
    const found = search.json().listings as Array<{ id: string; fitsYourVehicle: boolean; condition: string }>;
    expect(found.find((row) => row.id === listingId)?.fitsYourVehicle).toBe(true);
    expect(search.json().facets.kinds.part).toBe(1);

    const all = await app.inject({
      method: "GET",
      url: "/marketplace/listings",
      headers: { cookie: buyerCookie },
    });
    const allListings = all.json().listings as Array<{ id: string; fitsYourVehicle: boolean }>;
    expect(allListings.find((row) => row.id === nonMatch.json().listing.id)?.fitsYourVehicle).toBe(false);

    const purchase = await app.inject({
      method: "POST",
      url: `/marketplace/listings/${listingId}/purchase`,
      headers: { cookie: buyerCookie },
      payload: { shipping: { postalCode: "78701" } },
    });
    expect(purchase.statusCode).toBe(201);
    expect(purchase.json().feeCents).toBe(1_235);
    expect(purchase.json().sellerNetCents).toBe(11_110);
    expect(purchase.json().payment.destinationCharge).toBe(true);
    expect(purchase.json().order.state).toBe("paid");
    const orderId = purchase.json().order.id as string;

    for (const state of ["shipped", "delivered", "disputed"] as const) {
      const transition = await app.inject({
        method: "POST",
        url: `/marketplace/orders/${orderId}/state`,
        headers: { cookie: sellerCookie },
        payload: { state },
      });
      expect(transition.statusCode).toBe(200);
      expect(transition.json().order.state).toBe(state);
    }

    const refund = await app.inject({
      method: "POST",
      url: `/marketplace/orders/${orderId}/refund`,
      headers: { cookie: sellerCookie },
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().order.state).toBe("refunded");

    const ledger = await ctx.db.select().from(creatorLedgers).where(eq(creatorLedgers.userId, sellerId));
    expect(ledger.map((row) => row.amountCents).sort((a, b) => a - b)).toEqual([-11_110, 11_110]);

    const dashboard = await app.inject({
      method: "GET",
      url: "/marketplace/seller/dashboard",
      headers: { cookie: sellerCookie },
    });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().totals.feeCents).toBe(1_235);
  });

  async function register(email: string, username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, username, password: "correct-horse-battery" },
    });
    return { id: res.json().user.id as string, cookie: cookieFrom(res) };
  }

  async function vehicle(cookie: string, make: string, model: string, year: number) {
    const res = await app.inject({
      method: "POST",
      url: "/garage/vehicles",
      headers: { cookie },
      payload: { type: "car", fuelType: "gas", make, model, year, vin: `${make}${model}${year}` },
    });
    expect(res.statusCode).toBe(201);
    return res.json().vehicle.id as string;
  }
});
