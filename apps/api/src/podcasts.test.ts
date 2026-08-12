import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

describe("podcasts A4", () => {
  let client: Awaited<ReturnType<typeof createTestDb>>["client"];
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie: string;

  beforeAll(async () => {
    const ctx = await createTestDb();
    client = ctx.client;
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"] });

    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "podcaster@example.com",
        username: "podcaster",
        password: "correct-horse-battery",
      },
    });
    const setCookie = reg.headers["set-cookie"];
    cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it("marks an episode ready and returns Media Session API fields", async () => {
    const showRes = await app.inject({
      method: "POST",
      url: "/podcasts/shows",
      headers: { cookie },
      payload: {
        title: "Garage Talk Radio",
        description: "Wrench stories",
        coverUrl: "https://cdn.example.com/show.jpg",
      },
    });
    expect(showRes.statusCode).toBe(201);
    const showId = showRes.json().show.id as string;

    const uploadRes = await app.inject({
      method: "POST",
      url: "/podcasts/episodes/upload-session",
      headers: { cookie },
      payload: {
        showId,
        title: "Brake fluid myths",
        mimeType: "audio/mpeg",
        sizeBytes: 1024,
        durationSeconds: 1800,
      },
    });
    expect(uploadRes.statusCode).toBe(201);
    const episodeId = uploadRes.json().episode.id as string;

    const readyRes = await app.inject({
      method: "POST",
      url: `/podcasts/episodes/${episodeId}/ready`,
      headers: { cookie },
      payload: {
        audioUrl: "https://cdn.example.com/episode.mp3",
        artworkUrl: "https://cdn.example.com/episode.jpg",
      },
    });
    expect(readyRes.statusCode).toBe(200);
    expect(readyRes.json().episode.status).toBe("ready");

    const episodeRes = await app.inject({ method: "GET", url: `/podcasts/episodes/${episodeId}` });
    expect(episodeRes.statusCode).toBe(200);
    expect(episodeRes.json().mediaSession).toMatchObject({
      title: "Brake fluid myths",
      artist: "Garage Talk Radio",
      duration: 1800,
    });
    expect(episodeRes.json().mediaSession.artwork[0].src).toBe("https://cdn.example.com/episode.jpg");
  });
});
