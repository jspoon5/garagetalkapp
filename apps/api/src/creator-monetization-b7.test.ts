import { creatorLedgers } from "@garagetalk/db";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

function cookieFrom(response: { headers: Record<string, string | number | string[] | undefined> }) {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

describe("B7 creator monetization", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let creatorCookie: string;
  let supporterCookie: string;
  let creatorId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"] });
    const creator = await register("creator-b7@example.com", "creatorb7");
    const supporter = await register("supporter-b7@example.com", "supporterb7");
    creatorCookie = creator.cookie;
    supporterCookie = supporter.cookie;
    creatorId = creator.id;
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  it("creates tips for content and live subjects and grants supporter badges", async () => {
    for (const subjectType of ["content", "live"] as const) {
      const tip = await app.inject({
        method: "POST",
        url: "/creator/tips",
        headers: { cookie: supporterCookie },
        payload: { toUserId: creatorId, amountCents: 2_500, subjectType, subjectId: uuidv7() },
      });
      expect(tip.statusCode).toBe(201);
      expect(tip.json().ledger.entryType).toBe("tip");
      expect(tip.json().badge.creatorUserId).toBe(creatorId);
    }

    const badges = await app.inject({ method: "GET", url: `/creator/${creatorId}/supporter-badges` });
    expect(badges.json().badges[0].totalCents).toBe(5_000);
    expect(badges.json().badges[0].level).toBe("supporter");
  });

  it("property: dashboard totals equal append-only creator ledger sums", async () => {
    const entryTypes = ["tip", "membership", "course_sale", "view_payout", "adjustment"] as const;
    let balance = 0;
    for (let i = 0; i < 30; i++) {
      const amount = (i % 7 === 0 ? -1 : 1) * (137 + i * 53);
      balance += amount;
      await ctx.db.insert(creatorLedgers).values({
        id: uuidv7(),
        userId: creatorId,
        entryType: entryTypes[i % entryTypes.length]!,
        amountCents: amount,
        grossAmountCents: amount > 0 ? amount + 10 : amount,
        applicationFeeCents: amount > 0 ? 10 : 0,
        subjectType: "property_seed",
        subjectId: uuidv7(),
        balanceAfter: balance,
      });
    }

    const rows = await ctx.db.select().from(creatorLedgers).where(eq(creatorLedgers.userId, creatorId));
    const expected = rows.reduce(
      (sum, row) => ({
        netCents: sum.netCents + row.amountCents,
        grossCents: sum.grossCents + (row.grossAmountCents ?? row.amountCents),
        feeCents: sum.feeCents + row.applicationFeeCents,
      }),
      { netCents: 0, grossCents: 0, feeCents: 0 },
    );

    const dashboard = await app.inject({
      method: "GET",
      url: "/creator/earnings",
      headers: { cookie: creatorCookie },
    });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().dashboard.netCents).toBe(expected.netCents);
    expect(dashboard.json().dashboard.grossCents).toBe(expected.grossCents);
    expect(dashboard.json().dashboard.feeCents).toBe(expected.feeCents);
  });

  async function register(email: string, username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, username, password: "correct-horse-battery" },
    });
    return { id: res.json().user.id as string, cookie: cookieFrom(res) };
  }
});
