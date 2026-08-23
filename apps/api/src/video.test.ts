import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";
import { VideoService } from "./services/video-service.js";

describe("video platform A3", () => {
  let client: Awaited<ReturnType<typeof createTestDb>>["client"];
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie: string;
  let userId: string;
  let webhookToken: string;
  let videoService: VideoService;

  beforeAll(async () => {
    const ctx = await createTestDb();
    client = ctx.client;
    videoService = new VideoService(ctx.db);
    app = await buildApp({
      db: ctx.db,
      trustedOrigins: ["http://localhost:5173"],
      video: videoService,
    });

    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "video@example.com",
        username: "videouser",
        password: "correct-horse-battery",
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    const setCookie = reg.headers["set-cookie"];
    cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
    userId = reg.json().user.id as string;

    webhookToken = "test-webhook-token-a3";
    await videoService.registerStreamWebhookToken(userId, webhookToken, new Date(Date.now() + 3600_000));
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it("upload → webhook ready → heartbeat dedupe", async () => {
    const session = await app.inject({
      method: "POST",
      url: "/videos/upload-session",
      headers: { cookie },
      payload: {
        title: "Brake job walkthrough",
        category: "repair",
        tags: ["brakes", "diy"],
      },
    });
    expect(session.statusCode).toBe(201);
    const { video, upload } = session.json() as {
      video: { id: string; streamAssetId: string; status: string };
      upload: { streamAssetId: string };
    };
    expect(video.status).toBe("processing");

    const webhook = await app.inject({
      method: "POST",
      url: "/webhooks/stream",
      headers: {
        "x-webhook-token": webhookToken,
        "x-webhook-id": "evt-ready-1",
      },
      payload: {
        uid: upload.streamAssetId,
        status: { state: "ready" },
        duration: 180,
        playback: { hls: "https://videodelivery.net/stub/manifest/video.m3u8" },
        thumbnail: "https://cdn.example/thumb.jpg",
        meta: { videoId: video.id },
      },
    });
    expect(webhook.statusCode).toBe(200);
    expect(webhook.json().processed).toBe(true);

    const published = await app.inject({
      method: "GET",
      url: `/videos/${video.id}`,
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().video.status).toBe("ready");
    expect(published.json().video.hlsUrl).toContain(".m3u8");

    const hb1 = await app.inject({
      method: "POST",
      url: `/videos/${video.id}/heartbeat`,
      headers: { cookie },
      payload: { sessionId: "sess-abc-12345", positionSeconds: 30 },
    });
    expect(hb1.statusCode).toBe(200);
    expect(hb1.json().deduped).toBe(false);
    expect(hb1.json().viewCount).toBe(1);

    const hb2 = await app.inject({
      method: "POST",
      url: `/videos/${video.id}/heartbeat`,
      headers: { cookie },
      payload: { sessionId: "sess-abc-12345", positionSeconds: 45 },
    });
    expect(hb2.statusCode).toBe(200);
    expect(hb2.json().deduped).toBe(true);
    expect(hb2.json().viewCount).toBe(1);

    const recent = await app.inject({
      method: "GET",
      url: "/videos/recently-watched",
      headers: { cookie },
    });
    expect(recent.statusCode).toBe(200);
    expect(recent.json().items).toHaveLength(1);
    expect(recent.json().items[0].entry.positionSeconds).toBe(45);
  });

  it("supports comment thread depth ≥ 3", async () => {
    const session = await app.inject({
      method: "POST",
      url: "/videos/upload-session",
      headers: { cookie },
      payload: { title: "Thread test", category: "diy" },
    });
    const { video, upload } = session.json() as {
      video: { id: string };
      upload: { streamAssetId: string };
    };

    await app.inject({
      method: "POST",
      url: "/webhooks/stream",
      headers: { "x-webhook-token": webhookToken, "x-webhook-id": "evt-thread-1" },
      payload: {
        uid: upload.streamAssetId,
        status: { state: "ready" },
        meta: { videoId: video.id },
      },
    });

    const root = await app.inject({
      method: "POST",
      url: `/videos/${video.id}/comments`,
      headers: { cookie },
      payload: { body: "Root comment" },
    });
    expect(root.statusCode).toBe(201);
    const rootId = root.json().comment.id as string;

    const reply1 = await app.inject({
      method: "POST",
      url: `/videos/${video.id}/comments`,
      headers: { cookie },
      payload: { body: "Level 2", parentId: rootId },
    });
    expect(reply1.statusCode).toBe(201);
    const reply1Id = reply1.json().comment.id as string;

    const reply2 = await app.inject({
      method: "POST",
      url: `/videos/${video.id}/comments`,
      headers: { cookie },
      payload: { body: "Level 3", parentId: reply1Id },
    });
    expect(reply2.statusCode).toBe(201);

    const listed = await app.inject({
      method: "GET",
      url: `/videos/${video.id}/comments`,
    });
    expect(listed.statusCode).toBe(200);
    const comments = listed.json().comments as Array<{ parentId: string | null; body: string }>;
    expect(comments).toHaveLength(3);
    const depth3 = comments.find((c) => c.body === "Level 3");
    expect(depth3?.parentId).toBe(reply1Id);
  });

  it("soft deletes video for owner", async () => {
    const session = await app.inject({
      method: "POST",
      url: "/videos/upload-session",
      headers: { cookie },
      payload: { title: "Delete me", category: "other" },
    });
    const { video, upload } = session.json() as {
      video: { id: string };
      upload: { streamAssetId: string };
    };

    await app.inject({
      method: "POST",
      url: "/webhooks/stream",
      headers: { "x-webhook-token": webhookToken, "x-webhook-id": "evt-delete-1" },
      payload: {
        uid: upload.streamAssetId,
        status: { state: "ready" },
        meta: { videoId: video.id },
      },
    });

    const del = await app.inject({
      method: "DELETE",
      url: `/videos/${video.id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(200);

    const gone = await app.inject({
      method: "GET",
      url: `/videos/${video.id}`,
    });
    expect(gone.statusCode).toBe(404);
  });
});
