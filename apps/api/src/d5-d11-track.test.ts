import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  avatarItems,
  avatarUnlocks,
  creatorLedgers,
  learningEvents,
  skillBadges,
  videos,
} from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { buildApp } from "./app.js";
import {
  BADGE_DISCLAIMER,
  chapterForSeek,
  transitionClassInteraction,
} from "./services/d7-d11-integrity-service.js";
import { createTestDb } from "./test/pglite.js";

function cookieFrom(response: { headers: Record<string, string | number | string[] | undefined> }) {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

describe("Track D5-D11 learning and integrity", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let creatorCookie: string;
  let studentCookie: string;
  let creatorId: string;
  let studentId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"] });
    const creator = await register("trackd-creator@example.com", "trackdcreator");
    const student = await register("trackd-student@example.com", "trackdstudent");
    creatorCookie = creator.cookie;
    studentCookie = student.cookie;
    creatorId = creator.id;
    studentId = student.id;
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  async function register(email: string, username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, username, password: "correct-horse-battery" },
    });
    return { id: res.json().user.id as string, cookie: cookieFrom(res) };
  }

  it("D5 gates paid course content and reconciles membership renewal into creator ledger", async () => {
    const school = await app.inject({
      method: "POST",
      url: "/schools",
      headers: { cookie: creatorCookie },
      payload: { slug: "track-d-school", membershipPriceCents: 1500 },
    });
    const schoolId = school.json().school.id as string;
    const course = await app.inject({
      method: "POST",
      url: `/schools/${schoolId}/courses`,
      headers: { cookie: creatorCookie },
      payload: { title: "Paid brakes class", priceCents: 2500 },
    });
    const courseId = course.json().course.id as string;

    const blocked = await app.inject({
      method: "GET",
      url: `/courses/${courseId}/access`,
      headers: { cookie: studentCookie },
    });
    expect(blocked.json()).toMatchObject({ allowed: false, reason: "payment_required" });

    await app.inject({ method: "POST", url: `/courses/${courseId}/purchase`, headers: { cookie: studentCookie } });
    const allowed = await app.inject({
      method: "GET",
      url: `/courses/${courseId}/access`,
      headers: { cookie: studentCookie },
    });
    expect(allowed.json()).toMatchObject({ allowed: true, reason: "paid" });

    const renewal = await app.inject({
      method: "POST",
      url: `/schools/${schoolId}/membership/renewal`,
      headers: { cookie: studentCookie },
    });
    expect(renewal.json().ledger).toMatchObject({ userId: creatorId, entryType: "membership", amountCents: 1500 });
  });

  it("D6 keeps watch-party clients within two seconds and streaks across timezone edges", async () => {
    const sync = await app.inject({
      method: "POST",
      url: "/watch-parties/sync-preview",
      payload: {
        hostPositionSeconds: 120,
        hostNowMs: 100_000,
        clientClockOffsetsMs: Array.from({ length: 10 }, (_, i) => 98_100 + i * 400),
      },
    });
    const positions = sync.json().positions as number[];
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(2);

    const crew = await app.inject({
      method: "POST",
      url: "/pit-crews",
      headers: { cookie: studentCookie },
      payload: { name: "Night learners" },
    });
    const crewId = crew.json().crew.id as string;
    await app.inject({
      method: "POST",
      url: `/pit-crews/${crewId}/streak`,
      headers: { cookie: studentCookie },
      payload: { at: "2026-03-08T07:30:00.000Z", timezone: "America/Los_Angeles" },
    });
    const next = await app.inject({
      method: "POST",
      url: `/pit-crews/${crewId}/streak`,
      headers: { cookie: studentCookie },
      payload: { at: "2026-03-09T06:30:00.000Z", timezone: "America/Los_Angeles" },
    });
    expect(next.json().member.dailyStreak).toBe(2);
  });

  it("D7 enforces class role permissions and seeks replay chapters", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/live/sessions",
      headers: { cookie: creatorCookie },
      payload: { roomName: "track-d-class", kind: "class" },
    });
    const sessionId = created.json().session.id as string;
    const studentPermission = await app.inject({
      method: "GET",
      url: `/live/classes/${sessionId}/permissions?action=screen_share`,
      headers: { cookie: studentCookie },
    });
    expect(studentPermission.json()).toMatchObject({ role: "student", allowed: false });
    const hostPermission = await app.inject({
      method: "GET",
      url: `/live/classes/${sessionId}/permissions?action=screen_share`,
      headers: { cookie: creatorCookie },
    });
    expect(hostPermission.json()).toMatchObject({ role: "instructor", allowed: true });
    expect(transitionClassInteraction("idle", "open")).toBe("open");
    expect(transitionClassInteraction("closed", "answer")).toBeNull();
    expect(chapterForSeek([{ title: "Intro", startsAt: 0 }, { title: "Demo", startsAt: 90 }], 120)?.title).toBe("Demo");
  });

  it("D8 grounds Foreman answers in approved corpus and escalates hazards", async () => {
    await app.inject({
      method: "POST",
      url: "/ai/foreman/corpus",
      headers: { cookie: creatorCookie },
      payload: { slug: "manual-brake-fluid", title: "Brake fluid", body: "Brake fluid absorbs moisture." },
    });
    const cited = await app.inject({ method: "POST", url: "/ai/foreman", payload: { message: "brake fluid moisture" } });
    expect(cited.json().citations).toContain("manual-brake-fluid");
    const out = await app.inject({ method: "POST", url: "/ai/foreman", payload: { message: "paintless dent secrets" } });
    expect(out.json()).toMatchObject({ outOfCorpus: true, offeredMode: "general" });
    const hazard = await app.inject({ method: "POST", url: "/ai/foreman", payload: { message: "bypass airbag" } });
    expect(hazard.json()).toMatchObject({ hazardEscalation: true, citations: [] });
  });

  it("D9 shares badges only with the educational achievement disclaimer", async () => {
    const [badge] = await ctx.db.insert(skillBadges).values({
      id: uuidv7(),
      userId: studentId,
      pathId: "0198a000-0000-7000-8000-000000000d32",
    }).returning();
    const shared = await app.inject({
      method: "POST",
      url: `/proof/badges/${badge!.id}/share`,
      payload: { slug: "student-brakes-badge" },
    });
    expect(shared.json().component.disclaimer).toBe(BADGE_DISCLAIMER);
    expect(shared.json().component.html).toContain(BADGE_DISCLAIMER);
  });

  it("D10 rejects payment-context avatar unlocks at the database", async () => {
    const [item] = await ctx.db.insert(avatarItems).values({
      id: uuidv7(),
      kind: "hat",
      name: "Torque Cap",
      unlockRule: "complete_path",
    }).returning();
    await expect(
      ctx.db.insert(learningEvents).values({
        id: uuidv7(),
        userId: studentId,
        sourceType: "stripe_payment",
        context: "payment",
      }),
    ).rejects.toThrow();
    await expect(
      ctx.db.insert(avatarUnlocks).values({
        id: uuidv7(),
        userId: studentId,
        itemId: item!.id,
        sourceEventType: "payment",
        sourceEventId: uuidv7(),
      }),
    ).rejects.toThrow();
  });

  it("D11 rejects scripted heartbeats and pays out valid qualified views only", async () => {
    const invalidVideoId = await seedVideo("Scripted view target");
    const validVideoId = await seedVideo("Valid view target");
    const scripted = await app.inject({
      method: "POST",
      url: "/earnings/heartbeats",
      headers: { cookie: studentCookie },
      payload: {
        mediaType: "video",
        mediaId: invalidVideoId,
        sessionId: "script-session",
        positionSeconds: 40,
        userAgent: "curl scripted bot",
      },
    });
    expect(scripted.json().view.valid).toBe(false);
    expect(scripted.json().view.invalidReason).toBe("bot_heuristic");

    for (const positionSeconds of [10, 20, 35]) {
      await app.inject({
        method: "POST",
        url: "/earnings/heartbeats",
        headers: { cookie: studentCookie },
        payload: { mediaType: "video", mediaId: validVideoId, sessionId: "valid-session", positionSeconds },
      });
    }
    const replayed = await app.inject({
      method: "POST",
      url: "/earnings/heartbeats",
      headers: { cookie: studentCookie },
      payload: { mediaType: "video", mediaId: validVideoId, sessionId: "valid-session", positionSeconds: 30 },
    });
    expect(replayed.json().view.invalidReason).toBe("replayed_or_scripted");

    const payout = await app.inject({
      method: "GET",
      url: "/earnings/payout-preview",
      headers: { cookie: creatorCookie },
    });
    expect(payout.json()).toMatchObject({ validViews: 0, payoutCents: 0 });
  });

  it("D11 property: creator ledger sum equals dashboard", async () => {
    let balance = 0;
    for (let i = 0; i < 20; i++) {
      const amount = i % 4 === 0 ? -75 : 200 + i;
      balance += amount;
      await ctx.db.insert(creatorLedgers).values({
        id: uuidv7(),
        userId: creatorId,
        entryType: "adjustment",
        amountCents: amount,
        grossAmountCents: amount,
        applicationFeeCents: 0,
        subjectType: "d11_property",
        subjectId: uuidv7(),
        balanceAfter: balance,
      });
    }
    const rows = await ctx.db.select().from(creatorLedgers).where(eq(creatorLedgers.userId, creatorId));
    const expected = rows.reduce((sum, row) => sum + row.amountCents, 0);
    const dashboard = await app.inject({
      method: "GET",
      url: "/earnings/dashboard-d11",
      headers: { cookie: creatorCookie },
    });
    expect(dashboard.json().dashboard.netCents).toBe(expected);
  });

  async function seedVideo(title: string) {
    const id = uuidv7();
    await ctx.db.insert(videos).values({
      id,
      ownerId: creatorId,
      title,
      category: "education",
      status: "ready",
    });
    return id;
  }
});
