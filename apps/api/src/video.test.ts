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
        mimeType: "video/mp4",
        sizeBytes: 1024,
      },
    });
    expect(session.statusCode).toBe(201);
    const { video, upload } = session.json() as {
      video: { id: string; streamAssetId: string; status: string };
      upload: { streamAssetId: string; provider: string; assetId: string | null; uploadUrl: string };
    };
    expect(video.status).toBe("processing");
    expect(upload.provider).not.toBe("cloudflare_stream");
    expect(upload.uploadUrl).not.toMatch(/upload\.videodelivery\.net\/stub/);

    // Stub/R2 path: complete after client PUT (stub skips real PUT).
    const completed = await app.inject({
      method: "POST",
      url: `/videos/${video.id}/complete`,
      headers: { cookie },
      payload: { assetId: upload.assetId },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().video.status).toBe("ready");
    expect(completed.json().video.hlsUrl).toBeTruthy();

    // Also prove Stream webhook path still works on a second asset.
    const streamSession = await app.inject({
      method: "POST",
      url: "/videos/upload-session",
      headers: { cookie },
      payload: {
        title: "Stream webhook fixture",
        category: "repair",
        mimeType: "video/mp4",
        sizeBytes: 2048,
      },
    });
    const streamVideo = streamSession.json().video as { id: string; streamAssetId: string };

    const webhook = await app.inject({
      method: "POST",
      url: "/webhooks/stream",
      headers: {
        "x-webhook-token": webhookToken,
        "x-webhook-id": "evt-ready-1",
      },
      payload: {
        uid: streamVideo.streamAssetId,
        status: { state: "ready" },
        duration: 180,
        playback: { hls: "https://videodelivery.net/fixture/manifest/video.m3u8" },
        thumbnail: "https://cdn.example/thumb.jpg",
        meta: { videoId: streamVideo.id },
      },
    });
    expect(webhook.statusCode).toBe(200);

    const beat1 = await app.inject({
      method: "POST",
      url: `/videos/${video.id}/heartbeat`,
      headers: { cookie },
      payload: { sessionId: "sess-a3-1", positionSeconds: 12 },
    });
    expect(beat1.statusCode).toBe(200);
    expect(beat1.json().deduped).toBe(false);

    const beat2 = await app.inject({
      method: "POST",
      url: `/videos/${video.id}/heartbeat`,
      headers: { cookie },
      payload: { sessionId: "sess-a3-1", positionSeconds: 40 },
    });
    expect(beat2.statusCode).toBe(200);
    expect(beat2.json().deduped).toBe(true);

    const recent = await app.inject({
      method: "GET",
      url: "/videos/recently-watched",
      headers: { cookie },
    });
    expect(recent.statusCode).toBe(200);
    expect(recent.json().items.length).toBeGreaterThanOrEqual(1);
  });

  it("supports comment thread depth ≥ 3", async () => {
    const session = await app.inject({
      method: "POST",
      url: "/videos/upload-session",
      headers: { cookie },
      payload: { title: "Thread test", category: "diy", mimeType: "video/mp4", sizeBytes: 1024 },
    });
    const { video, upload } = session.json() as {
      video: { id: string };
      upload: { streamAssetId: string; assetId: string | null };
    };

    await app.inject({
      method: "POST",
      url: `/videos/${video.id}/complete`,
      headers: { cookie },
      payload: { assetId: upload.assetId },
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
      payload: { title: "Delete me", category: "other", mimeType: "video/mp4", sizeBytes: 1024 },
    });
    const { video, upload } = session.json() as {
      video: { id: string };
      upload: { streamAssetId: string; assetId: string | null };
    };

    await app.inject({
      method: "POST",
      url: `/videos/${video.id}/complete`,
      headers: { cookie },
      payload: { assetId: upload.assetId },
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

  it("uses real Stream direct upload when credentials are present", async () => {
    const prevAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
    const prevToken = process.env.CLOUDFLARE_STREAM_TOKEN;
    const prevFetch = globalThis.fetch;
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct_test";
    process.env.CLOUDFLARE_STREAM_TOKEN = "tok_test";
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/stream/direct_upload")) {
        return Response.json({
          success: true,
          result: {
            uid: "cf_real_uid_1",
            uploadURL: "https://upload.videodelivery.net/real-token-abc",
          },
        });
      }
      return prevFetch(input as never, init);
    }) as typeof fetch;

    try {
      const session = await app.inject({
        method: "POST",
        url: "/videos/upload-session",
        headers: { cookie },
        payload: { title: "Live Stream path", category: "diy", mimeType: "video/mp4", sizeBytes: 2048 },
      });
      expect(session.statusCode).toBe(201);
      const body = session.json() as {
        upload: { provider: string; uploadUrl: string; streamAssetId: string };
      };
      expect(body.upload.provider).toBe("cloudflare_stream");
      expect(body.upload.uploadUrl).toBe("https://upload.videodelivery.net/real-token-abc");
      expect(body.upload.uploadUrl).not.toMatch(/\/stub\//);
      expect(body.upload.streamAssetId).toBe("cf_real_uid_1");
    } finally {
      globalThis.fetch = prevFetch;
      if (prevAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = prevAccount;
      if (prevToken === undefined) delete process.env.CLOUDFLARE_STREAM_TOKEN;
      else process.env.CLOUDFLARE_STREAM_TOKEN = prevToken;
    }
  });
});
