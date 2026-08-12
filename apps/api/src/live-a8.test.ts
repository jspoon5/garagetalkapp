import { MemoryEmailClient } from "@garagetalk/email";
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
      },
    });
    hostCookie = cookieFrom(host);

    const viewer = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "live-viewer@example.com",
        username: "liveviewer",
        password: "correct-horse-battery",
      },
    });
    viewerCookie = cookieFrom(viewer);
    viewerId = viewer.json().user.id as string;
  });

  afterAll(async () => {
    await app.close();
    await client.close();
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
    expect(created.json().rtmp.url).toBe("rtmp://rtmp.livekit.local/live");
    expect(created.json().rtmp.key).toMatch(/^gt_/);

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
    expect(rtmp.json().rtmp.key).toBe(created.json().rtmp.key);
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
  });
});
