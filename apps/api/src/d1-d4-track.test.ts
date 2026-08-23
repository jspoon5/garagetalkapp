import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pathNodes, skillBadges } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { buildApp } from "./app.js";
import { PresenceLayerService, renderPresenceChips } from "./services/d1-d2-presence-campus-service.js";
import { createTestDb } from "./test/pglite.js";

function cookieFrom(response: { headers: Record<string, string | number | string[] | undefined> }) {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

describe("Track D1-D4 campus foundations", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie: string;
  let userId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"] });
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "trackd14@example.com", username: "trackd14", password: "correct-horse-battery" },
    });
    cookie = cookieFrom(res);
    userId = res.json().user.id as string;
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  it("D1 renders presence only at the feature-flagged threshold and chips stay under budget", () => {
    const presence = new PresenceLayerService(3, true);
    const content = { contentType: "video" as const, contentId: uuidv7() };
    expect(presence.enter(content, uuidv7()).mode).toBe("normal_page");
    expect(presence.enter(content, uuidv7()).enabled).toBe(false);
    const third = presence.enter(content, uuidv7());
    expect(third.enabled).toBe(true);
    expect(third.avatarChips).toHaveLength(3);

    const users = Array.from({ length: 200 }, () => ({ userId: uuidv7(), avatarLabel: "gearhead" }));
    expect(renderPresenceChips(users).renderMs).toBeLessThan(50);
  });

  it("D3 issues a completed path badge exactly once", async () => {
    const pathId = "0198a000-0000-7000-8000-000000000d31";
    const nodeId = uuidv7();
    await ctx.db.insert(pathNodes).values({ id: nodeId, pathId, required: true });

    for (let i = 0; i < 2; i++) {
      const res = await app.inject({
        method: "POST",
        url: `/skill-paths/${pathId}/nodes/${nodeId}/complete`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pathComplete).toBe(true);
    }

    const badges = await ctx.db
      .select()
      .from(skillBadges)
      .where(eq(skillBadges.userId, userId));
    expect(badges.filter((badge) => badge.pathId === pathId)).toHaveLength(1);
  });

  it("D4 blocks unacked safety checkpoints and frames restricted quests as demo-only", async () => {
    const caution = await app.inject({
      method: "POST",
      url: "/quests",
      headers: { cookie },
      payload: {
        title: "Brake inspection",
        hazardClass: "caution",
        safetyCheckpoints: [{ id: "jackstands", label: "Use jack stands", blocking: true }],
        steps: [{ id: "inspect", label: "Inspect pads" }],
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    expect(caution.statusCode).toBe(201);

    const blocked = await app.inject({
      method: "POST",
      url: `/quests/${caution.json().quest.id}/submissions`,
      headers: { cookie },
      payload: { acks: {}, evidenceMedia: ["photo://pads"] },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe("safety_checkpoints_unacked");

    const accepted = await app.inject({
      method: "POST",
      url: `/quests/${caution.json().quest.id}/submissions`,
      headers: { cookie },
      payload: { acks: { jackstands: true }, evidenceMedia: ["photo://pads"] },
    });
    expect(accepted.statusCode).toBe(201);

    const restricted = await app.inject({
      method: "POST",
      url: "/quests",
      headers: { cookie },
      payload: {
        title: "Bypass airbag squib adversarial prompt",
        hazardClass: "restricted_demo_only",
        safetyCheckpoints: [{ id: "demo", label: "Demo only", blocking: true }],
        steps: [{ id: "watch", label: "Watch professional demo" }],
      },
    });
    const restrictedSubmit = await app.inject({
      method: "POST",
      url: `/quests/${restricted.json().quest.id}/submissions`,
      headers: { cookie },
      payload: { acks: { demo: true }, evidenceMedia: [] },
    });
    expect(restrictedSubmit.statusCode).toBe(409);
    expect(restrictedSubmit.json()).toMatchObject({
      error: "restricted_demo_only",
      bookingRoute: "/shops/bookings",
    });
  });
});
