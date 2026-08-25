import { eq } from "drizzle-orm";
import { MemoryEmailClient } from "@garagetalk/email";
import { subscriptions, users } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { buildApp } from "./app.js";
import { verifyMockLiveKitToken } from "./services/live-service.js";
import { createTestDb } from "./test/pglite.js";
function cookieFrom(response: {
  headers: Record<string, string | number | string[] | undefined>;
}): string {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

describe("A8 live sessions", () => {
  let client: Awaited<ReturnType<typeof createTestDb>>["client"];
  let app: Awaited<ReturnType<typeof buildApp>>;
  let hostCookie: string;
  let hostId: string;
  let viewerCookie: string;
  let viewerId: string;
  const emailClient = new MemoryEmailClient();

  beforeAll(async () => {
    const ctx = await createTestDb();
    client = ctx.client;
    app = await buildApp({
      db: ctx.db,
      trustedOrigins: ["http://localhost:5173"],
      emailClient,
    });

    const host = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "live-host@example.com",
        username: "livehost",
        password: "correct-horse-battery",
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    hostCookie = cookieFrom(host);
    hostId = host.json().user.id as string;

    await ctx.db
      .update(users)
      .set({ tier: "gearhead", tierStatus: "active" })
      .where(eq(users.id, hostId));
    await ctx.db.insert(subscriptions).values({
      id: uuidv7(),
      userId: hostId,
      tier: "gearhead",
      status: "active",
      stripeSubscriptionId: "sub_live_host",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const viewer = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "live-viewer@example.com",
        username: "liveviewer",
        password: "correct-horse-battery",
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    viewerCookie = cookieFrom(viewer);
    viewerId = viewer.json().user.id as string;
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it("blocks amateur tier from creating live sessions", async () => {
    const blocked = await app.inject({
      method: "POST",
      url: "/live/sessions",
      headers: { cookie: viewerCookie },
      payload: { roomName: "amateur-blocked-room" },
    });
    expect(blocked.statusCode).toBe(402);
    expect(blocked.json().error).toBe("upgrade_required");
  });

  it("creates scheduled sessions, sends reminders, and enforces token roles", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/live/sessions",
      headers: { cookie: hostCookie },
      payload: {
        roomName: "a8-live-room",
        title: "A8 Live",
        scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    expect(created.statusCode).toBe(201);
    expect(emailClient.sent).toHaveLength(1);
    const sessionId = created.json().session.id as string;
    // Mock livekit.local ingest is intentionally disabled (null) until LIVEKIT_RTMP_URL is real.
    expect(created.json().rtmp.url).toBeNull();
    expect(created.json().rtmp.key).toBeNull();

    const blocked = await app.inject({
      method: "POST",
      url: `/live/sessions/${sessionId}/token`,
      headers: { cookie: viewerCookie },
      payload: { role: "host" },
    });
    expect(blocked.statusCode).toBe(403);

    const viewerToken = await app.inject({
      method: "POST",
      url: `/live/sessions/${sessionId}/token`,
      headers: { cookie: viewerCookie },
      payload: {},
    });
    expect(viewerToken.statusCode).toBe(200);
    expect(viewerToken.json().role).toBe("viewer");
    expect(verifyMockLiveKitToken(viewerToken.json().token as string)).toBe(true);

    const guestWatch = await app.inject({
      method: "POST",
      url: `/live/sessions/${sessionId}/viewer-token`,
      payload: { clientId: "guestclient01" },
    });
    expect(guestWatch.statusCode).toBe(200);
    expect(guestWatch.json().role).toBe("viewer");
    expect(verifyMockLiveKitToken(guestWatch.json().token as string)).toBe(true);

    const assigned = await app.inject({
      method: "POST",
      url: `/live/sessions/${sessionId}/roles`,
      headers: { cookie: hostCookie },
      payload: { userId: viewerId, role: "mod" },
    });
    expect(assigned.statusCode).toBe(200);

    const modToken = await app.inject({
      method: "POST",
      url: `/live/sessions/${sessionId}/token`,
      headers: { cookie: viewerCookie },
      payload: { role: "mod" },
    });
    expect(modToken.statusCode).toBe(200);
    expect(modToken.json().role).toBe("mod");

    const rtmp = await app.inject({
      method: "GET",
      url: `/live/sessions/${sessionId}/rtmp`,
      headers: { cookie: viewerCookie },
    });
    expect(rtmp.statusCode).toBe(200);
    expect(rtmp.json().rtmp.url).toBeNull();
  });

  it("moves recordings through egress, R2 upload, and replay states", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/live/sessions",
      headers: { cookie: hostCookie },
      payload: { roomName: "a8-recording-room" },
    });
    const sessionId = created.json().session.id as string;

    const start = await app.inject({
      method: "POST",
      url: `/live/sessions/${sessionId}/recording/start`,
      headers: { cookie: hostCookie },
      payload: { assetId: "egress_fixture_1" },
    });
    expect(start.statusCode).toBe(200);
    expect(start.json().session.recordingState).toBe("recording");

    const uploading = await app.inject({
      method: "POST",
      url: `/live/sessions/${sessionId}/recording/egress-complete`,
      headers: { cookie: hostCookie },
      payload: { assetId: "r2_fixture_1" },
    });
    expect(uploading.statusCode).toBe(200);
    expect(uploading.json().session.recordingState).toBe("uploading");

    const ready = await app.inject({
      method: "POST",
      url: `/live/sessions/${sessionId}/recording/upload-complete`,
      headers: { cookie: hostCookie },
      payload: { replayUrl: "https://stream.garagetalk.local/replays/r2_fixture_1" },
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().session.recordingState).toBe("ready");
    expect(ready.json().session.recordingReplayUrl).toContain("/replays/");

    const invalid = await app.inject({
      method: "POST",
      url: `/live/sessions/${sessionId}/recording/start`,
      headers: { cookie: hostCookie },
      payload: {},
    });
    expect(invalid.statusCode).toBe(409);

    const liked = await app.inject({
      method: "POST",
      url: `/live/sessions/${sessionId}/like`,
      headers: { cookie: viewerCookie },
    });
    expect(liked.statusCode).toBe(200);
    expect(liked.json().liked).toBe(true);
    const detail = await app.inject({
      method: "GET",
      url: `/live/sessions/${sessionId}`,
      headers: { cookie: viewerCookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().session.likedByMe).toBe(true);
    expect(detail.json().session.rtmpStreamKey).toBeNull();
  });
});
