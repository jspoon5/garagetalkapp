import { serviceRecords, shops } from "@garagetalk/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { DiagnosticProvider } from "./services/c1-c6-diagnostics.js";
import { verifyAttestation } from "./services/attestation.js";
import { createTestDb } from "./test/pglite.js";

function cookieFrom(response: { headers: Record<string, string | number | string[] | undefined> }) {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

const provider: DiagnosticProvider = {
  async run() {
    return {
      provider: "mocked-provider",
      costCents: 25,
      output: {
        hypotheses: [
          {
            fault: "ignition misfire",
            confidence: 0.6,
            reasoning: "Mock baseline before outcome library rerank.",
            urgency: "medium",
            diy_feasibility: "moderate",
            est_cost_band: "$100-$250",
          },
          {
            fault: "vacuum leak",
            confidence: 0.4,
            reasoning: "Mock secondary candidate.",
            urgency: "medium",
            diy_feasibility: "advanced",
            est_cost_band: "$150-$500",
          },
        ],
        follow_up_questions: ["Any hissing near the intake?"],
        safety_flags: [],
      },
    };
  },
};

describe("C4-C6 repair brief, outcomes, and attested records", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let driverCookie: string;
  let shopOneCookie: string;
  let shopTwoCookie: string;
  let vehicleId: string;
  let shopOneId: string;
  let shopTwoId: string;
  let serviceOneId: string;
  let serviceTwoId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    app = await buildApp({
      db: ctx.db,
      trustedOrigins: ["http://localhost:5173"],
      diagnosticsProvider: provider,
    });
    driverCookie = (await register("driver-c4@example.com", "driverc4")).cookie;
    shopOneCookie = (await register("shop1-c4@example.com", "shop1c4")).cookie;
    shopTwoCookie = (await register("shop2-c4@example.com", "shop2c4")).cookie;
    vehicleId = await createVehicle();
    shopOneId = await createVerifiedShop(shopOneCookie, "track-c-shop-one");
    shopTwoId = await createVerifiedShop(shopTwoCookie, "track-c-shop-two");
    serviceOneId = await createService(shopOneCookie, shopOneId, "Diagnosis");
    serviceTwoId = await createService(shopTwoCookie, shopTwoId, "Inspection");
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  it("exports briefs, compares quotes, books valid quotes, and rejects expired ones", async () => {
    const sessionId = await createDiagnostic();
    const brief = await app.inject({
      method: "POST",
      url: `/diagnostics/sessions/${sessionId}/brief`,
      headers: { cookie: driverCookie },
    });
    expect(brief.statusCode).toBe(201);
    expect(brief.json().brief.pdfMedia).toContain("stub://");

    const publicBrief = await app.inject({
      method: "GET",
      url: `/repair-briefs/share/${brief.json().brief.shareToken}`,
    });
    expect(publicBrief.statusCode).toBe(200);
    expect(publicBrief.json().brief.id).toBe(brief.json().brief.id);

    const request = await app.inject({
      method: "POST",
      url: `/repair-briefs/${brief.json().brief.id}/quote-requests`,
      headers: { cookie: driverCookie },
      payload: { cityArea: "Austin", radiusMiles: 25 },
    });
    expect(request.statusCode).toBe(201);
    expect(request.json().notified).toBe(2);

    const validQuote = await submitQuote(shopOneCookie, shopOneId, request.json().request.id, 20_000, 40_000);
    const expiredQuote = await submitQuote(shopTwoCookie, shopTwoId, request.json().request.id, 15_000, 30_000, "2020-01-01T00:00:00.000Z");
    const expiredBook = await bookQuote(expiredQuote.json().quote.id, serviceTwoId);
    expect(expiredBook.statusCode).toBe(400);

    const booked = await bookQuote(validQuote.json().quote.id, serviceOneId);
    expect(booked.statusCode).toBe(201);
    expect(booked.json().payment.applicationFeeCents).toBe(4_000);
    expect(booked.json().booking.applicationFeeCents).toBe(4_000);

    const completed = await app.inject({
      method: "POST",
      url: `/shops/bookings/${booked.json().booking.id}/complete`,
      headers: { cookie: shopOneCookie },
    });
    expect(completed.statusCode).toBe(200);

    const outcome = await app.inject({
      method: "POST",
      url: `/shops/bookings/${booked.json().booking.id}/outcome`,
      headers: { cookie: shopOneCookie },
      payload: { verifiedFix: "vacuum leak", parts: [] },
    });
    expect(outcome.statusCode).toBe(201);
    expect(outcome.json().outcome.attestation.payloadHash).toBeTruthy();
    expect(
      verifyAttestation(
        {
          bookingId: booked.json().booking.id,
          sessionId,
          shopId: shopOneId,
          verifiedFix: "vacuum leak",
          parts: [],
        },
        shopOneId,
        outcome.json().outcome.attestation,
      ),
    ).toBe(true);

    const reranked = await app.inject({
      method: "POST",
      url: "/diagnostics/sessions",
      headers: { cookie: driverCookie },
      payload: { vehicleId, symptomText: "Lean idle with hissing near intake.", dtcCodes: ["P0171"] },
    });
    expect(reranked.json().modelOutput.hypotheses[0].fault).toBe("vacuum leak");
  });

  it("attests service records, projects listing history, and fails visibly after tampering", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/garage/vehicles/${vehicleId}/service-records`,
      headers: { cookie: driverCookie },
      payload: {
        date: "2026-03-01T00:00:00.000Z",
        kind: "repair",
        title: "Intake smoke test",
        work: "Replaced cracked vacuum hose",
        costCents: 22_000,
        sharedFields: ["date", "work"],
      },
    });
    const recordId = created.json().record.id as string;

    const attested = await app.inject({
      method: "POST",
      url: `/shops/${shopOneId}/service-records/${recordId}/attest`,
      headers: { cookie: shopOneCookie },
      payload: { note: "" },
    });
    expect(attested.statusCode).toBe(200);

    const valid = await app.inject({ method: "GET", url: `/verify/service-records/${recordId}` });
    expect(valid.json().valid).toBe(true);

    const listing = await app.inject({
      method: "POST",
      url: "/marketplace/listings",
      headers: { cookie: driverCookie },
      payload: {
        kind: "vehicle",
        title: "Civic with verified repair",
        priceCents: 500_000,
        condition: "used",
        fitment: { years: [2006], makes: ["Honda"], models: ["Civic"] },
        vehicleId,
      },
    });
    const history = await app.inject({
      method: "GET",
      url: `/marketplace/listings/${listing.json().listing.id}/verified-history`,
    });
    expect(history.json().timeline[0].work).toContain("vacuum hose");
    expect(history.json().timeline[0].costCents).toBeUndefined();
    expect(history.json().timeline[0].verification.valid).toBe(true);

    await ctx.db.update(serviceRecords).set({ work: "Tampered payload" }).where(eq(serviceRecords.id, recordId));
    const tampered = await app.inject({ method: "GET", url: `/verify/service-records/${recordId}` });
    expect(tampered.json().valid).toBe(false);
  });

  async function register(email: string, username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, username, password: "correct-horse-battery", birthYear: 1995, ageConfirmed: true },
    });
    return { cookie: cookieFrom(res) };
  }

  async function createVehicle() {
    const res = await app.inject({
      method: "POST",
      url: "/garage/vehicles",
      headers: { cookie: driverCookie },
      payload: { type: "car", fuelType: "gas", make: "Honda", model: "Civic", year: 2006 },
    });
    return res.json().vehicle.id as string;
  }

  async function createVerifiedShop(cookie: string, slug: string) {
    const res = await app.inject({
      method: "POST",
      url: "/shops",
      headers: { cookie },
      payload: { name: slug, slug },
    });
    const shopId = res.json().shop.id as string;
    await ctx.db.update(shops).set({ verificationStatus: "verified" }).where(eq(shops.id, shopId));
    return shopId;
  }

  async function createService(cookie: string, shopId: string, name: string) {
    const res = await app.inject({
      method: "POST",
      url: `/shops/${shopId}/services`,
      headers: { cookie },
      payload: { name, durationMin: 60, priceBandLowCents: 10_000 },
    });
    return res.json().service.id as string;
  }

  async function createDiagnostic() {
    const res = await app.inject({
      method: "POST",
      url: "/diagnostics/sessions",
      headers: { cookie: driverCookie },
      payload: { vehicleId, symptomText: "Lean idle with hissing near intake.", dtcCodes: ["P0171"] },
    });
    return res.json().session.id as string;
  }

  async function submitQuote(cookie: string, shopId: string, requestId: string, lowCents: number, highCents: number, expiresAt = "2035-01-01T00:00:00.000Z") {
    return app.inject({
      method: "POST",
      url: `/shops/${shopId}/quotes`,
      headers: { cookie },
      payload: { requestId, lowCents, highCents, notes: "Can inspect this week", expiresAt },
    });
  }

  async function bookQuote(quoteId: string, serviceId: string) {
    return app.inject({
      method: "POST",
      url: `/quotes/${quoteId}/book`,
      headers: { cookie: driverCookie },
      payload: { serviceId, scheduledAt: "2031-01-07T15:00:00.000Z" },
    });
  }
});
