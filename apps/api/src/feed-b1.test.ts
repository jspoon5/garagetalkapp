import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

const execFileAsync = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

function cookieFrom(response: {
  headers: Record<string, string | number | string[] | undefined>;
}): string {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

function isRgNoMatch(error: unknown): error is { code: number } {
  return typeof error === "object" && error !== null && "code" in error && error.code === 1;
}

describe("B1 feed", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let aliceCookie: string;
  let bobCookie: string;
  let bobId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"] });
    const alice = await register("alice-feed@example.com", "alicefeed");
    const bob = await register("bob-feed@example.com", "bobfeed");
    aliceCookie = alice.cookie;
    bobCookie = bob.cookie;
    bobId = bob.id;
    await register("cora-feed@example.com", "corafeed");
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  it("has no seeded demo content files", async () => {
    const bannedGlobs = ["*sample" + "-data*", "*demo" + "-posts*", "*fixture" + "-demo" + "-posts*"];
    try {
      const result = await execFileAsync(
        "rg",
        ["--files", ...bannedGlobs.flatMap((glob) => ["-g", glob])],
        { cwd: workspaceRoot },
      );
      expect(result.stdout.trim()).toBe("");
    } catch (error) {
      if (!isRgNoMatch(error)) throw error;
      expect(error.code).toBe(1);
    }
  });

  it("creates vehicle-tagged media posts and blends followed plus discovery chronologically", async () => {
    const vehicle = await app.inject({
      method: "POST",
      url: "/garage/vehicles",
      headers: { cookie: bobCookie },
      payload: { type: "car", fuelType: "gas", make: "Honda", model: "Civic", year: 2018 },
    });
    const vehicleId = vehicle.json().vehicle.id as string;

    const followedPost = await app.inject({
      method: "POST",
      url: "/feed/posts",
      headers: { cookie: bobCookie },
      payload: {
        body: "Track brake upgrade",
        mediaType: "photo",
        media: ["https://cdn.garagetalk.test/brakes.jpg"],
        vehicleId,
      },
    });
    expect(followedPost.statusCode).toBe(201);
    const postId = followedPost.json().post.id as string;

    const follow = await app.inject({
      method: "POST",
      url: `/feed/follows/${bobId}`,
      headers: { cookie: aliceCookie },
    });
    expect(follow.statusCode).toBe(201);

    const discovery = await app.inject({
      method: "POST",
      url: "/feed/posts",
      headers: { cookie: aliceCookie },
      payload: { body: "Garage tour video", mediaType: "video", media: ["https://cdn.garagetalk.test/tour.mp4"] },
    });
    expect(discovery.statusCode).toBe(201);

    const reaction = await app.inject({
      method: "POST",
      url: `/feed/posts/${postId}/reactions`,
      headers: { cookie: aliceCookie },
      payload: { kind: "helpful" },
    });
    expect(reaction.statusCode).toBe(201);

    const comment = await app.inject({
      method: "POST",
      url: `/feed/posts/${postId}/comments`,
      headers: { cookie: aliceCookie },
      payload: { body: "Which pads did you use?" },
    });
    expect(comment.statusCode).toBe(201);

    const share = await app.inject({
      method: "POST",
      url: `/feed/posts/${postId}/share`,
      headers: { cookie: aliceCookie },
      payload: { body: "Sharing this brake setup" },
    });
    expect(share.statusCode).toBe(201);
    expect(share.json().post.sharedPostId).toBe(postId);

    const report = await app.inject({
      method: "POST",
      url: `/feed/posts/${postId}/reports`,
      headers: { cookie: aliceCookie },
      payload: { reason: "Needs moderator review" },
    });
    expect(report.statusCode).toBe(201);

    const feed = await app.inject({ method: "GET", url: "/feed", headers: { cookie: aliceCookie } });
    expect(feed.statusCode).toBe(200);
    const posts = feed.json().posts as Array<{ id: string; source: string; mediaType: string; vehicleId: string | null }>;
    expect(posts.some((post) => post.id === postId && post.source === "followed")).toBe(true);
    expect(posts.some((post) => post.source === "discovery")).toBe(true);
    expect(posts.find((post) => post.id === postId)?.vehicleId).toBe(vehicleId);

    const comments = await app.inject({
      method: "GET",
      url: `/feed/posts/${postId}/comments`,
    });
    expect(comments.statusCode).toBe(200);
    expect(comments.json().comments[0].body).toBe("Which pads did you use?");

    const like = await app.inject({
      method: "POST",
      url: `/feed/posts/${postId}/reactions`,
      headers: { cookie: aliceCookie },
      payload: { kind: "like" },
    });
    expect(like.statusCode).toBe(201);
    expect(like.json().reaction.liked).toBe(true);
    const feedLiked = await app.inject({ method: "GET", url: "/feed", headers: { cookie: aliceCookie } });
    expect(feedLiked.json().posts.find((post: { id: string }) => post.id === postId).likedByMe).toBe(true);
  });

  async function register(email: string, username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, username, password: "correct-horse-battery", birthYear: 1995, ageConfirmed: true },
    });
    return { id: res.json().user.id as string, cookie: cookieFrom(res) };
  }
});
