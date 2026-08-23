import { MemoryEmailClient } from "@garagetalk/email";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

function cookieFrom(response: { headers: Record<string, string | number | string[] | undefined> }) {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

describe("B5 booking", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let email: MemoryEmailClient;
  let ownerCookie: string;
  let buyerCookie: string;
  let secondBuyerCookie: string;
  let shopId: string;
  let serviceId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    email = new MemoryEmailClient();
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"], emailClient: email });
    ownerCookie = (await register("booking-owner@example.com", "bookingowner")).cookie;
    buyerCookie = (await register("booking-buyer@example.com", "bookingbuyer")).cookie;
    secondBuyerCookie = (await register("booking-buyer2@example.com", "bookingbuyer2")).cookie;
    shopId = await createShop();
    serviceId = await createService();
    for (let weekday = 0; weekday < 7; weekday++) {
      await app.inject({
        method: "POST",
        url: `/shops/${shopId}/availability/rules`,
        headers: { cookie: ownerCookie },
        payload: { weekday, openTime: "00:00", closeTime: "23:59" },
      });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  it("prevents concurrent double booking with the unique shop slot", async () => {
    const payload = { shopId, serviceId, scheduledAt: "2030-01-07T15:00:00.000Z" };
    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: "/shops/bookings", headers: { cookie: buyerCookie }, payload }),
      app.inject({ method: "POST", url: "/shops/bookings", headers: { cookie: secondBuyerCookie }, payload }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
  });

  it("confirms with ICS emails and sends 24h/2h reminders under fake timers", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-12T10:00:00Z"));
    const requested = await app.inject({
      method: "POST",
      url: "/shops/bookings",
      headers: { cookie: buyerCookie },
      payload: { shopId, serviceId, scheduledAt: "2026-08-13T10:00:00.000Z" },
    });
    expect(requested.statusCode).toBe(201);
    const bookingId = requested.json().booking.id as string;

    const confirmed = await app.inject({
      method: "POST",
      url: `/shops/bookings/${bookingId}/confirm`,
      headers: { cookie: ownerCookie },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(email.sent.at(-1)?.attachments?.[0]?.filename).toBe("booking.ics");
    expect(email.sent.at(-1)?.attachments?.[0]?.content).toContain("BEGIN:VCALENDAR");

    vi.setSystemTime(new Date("2026-08-12T10:01:00Z"));
    const dayReminder = await app.inject({
      method: "POST",
      url: "/shops/bookings/reminders/run",
      headers: { cookie: ownerCookie },
    });
    expect(dayReminder.json().sent).toBe(1);
    expect(email.sent.at(-1)?.subject).toContain("24 hour");

    vi.setSystemTime(new Date("2026-08-13T08:30:00Z"));
    const twoHourReminder = await app.inject({
      method: "POST",
      url: "/shops/bookings/reminders/run",
      headers: { cookie: ownerCookie },
    });
    expect(twoHourReminder.json().sent).toBe(1);
    expect(email.sent.at(-1)?.subject).toContain("2 hour");

    const cancelled = await app.inject({
      method: "POST",
      url: `/shops/bookings/${bookingId}/cancel`,
      headers: { cookie: buyerCookie },
    });
    expect(cancelled.json().booking.status).toBe("cancelled");
  });

  it("supports no-show transitions by the shop owner", async () => {
    const requested = await app.inject({
      method: "POST",
      url: "/shops/bookings",
      headers: { cookie: buyerCookie },
      payload: { shopId, serviceId, scheduledAt: "2030-01-14T15:00:00.000Z" },
    });
    const noShow = await app.inject({
      method: "POST",
      url: `/shops/bookings/${requested.json().booking.id}/no-show`,
      headers: { cookie: ownerCookie },
    });
    expect(noShow.statusCode).toBe(200);
    expect(noShow.json().booking.status).toBe("no_show");
  });

  async function register(emailAddress: string, username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: emailAddress, username, password: "correct-horse-battery", birthYear: 1995, ageConfirmed: true },
    });
    return { cookie: cookieFrom(res) };
  }

  async function createShop() {
    const res = await app.inject({
      method: "POST",
      url: "/shops",
      headers: { cookie: ownerCookie },
      payload: { name: "Booking Shop", slug: "booking-shop" },
    });
    return res.json().shop.id as string;
  }

  async function createService() {
    const res = await app.inject({
      method: "POST",
      url: `/shops/${shopId}/services`,
      headers: { cookie: ownerCookie },
      payload: { name: "Alignment", durationMin: 60, priceBandLowCents: 10_000 },
    });
    return res.json().service.id as string;
  }
});
