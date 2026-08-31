import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "@garagetalk/db";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

function cookieFrom(response: {
  headers: Record<string, string | number | string[] | undefined>;
}): string {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

describe("shares + gearhead threads", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie: string;
  let userId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    app = await buildApp({
      db: ctx.db,
      trustedOrigins: ["http://localhost:5173"],
    });
    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "shareuser@example.com",
        username: "shareuser",
        password: "correct-horse-battery",
        birthYear: 1995,
        ageConfirmed: true,
      },
    });
    cookie = cookieFrom(reg);
    userId = reg.json().user.id as string;
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  it("creates a share and returns suggestions", async () => {
    const share = await app.inject({
      method: "POST",
      url: "/shares",
      headers: { cookie },
      payload: {
        objectType: "profile",
        objectId: userId,
        shareType: "copy_link",
      },
    });
    expect(share.statusCode).toBe(200);
    expect(share.json().publicPath).toContain("/s/profile/");

    const suggestions = await app.inject({
      method: "GET",
      url: "/shares/suggestions",
      headers: { cookie },
    });
    expect(suggestions.statusCode).toBe(200);
    expect(Array.isArray(suggestions.json().suggestions)).toBe(true);
  });

  it("serves OG HTML for public share links", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/s/profile/${userId}`,
      headers: { accept: "text/html" },
    });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers["content-type"])).toContain("text/html");
    expect(res.body).toContain("og:title");
    expect(res.body).toContain("shareuser");
  });

  it("persists gearhead thread history and lists threads", async () => {
    const ask = await app.inject({
      method: "POST",
      url: "/ai/gearhead",
      headers: { cookie },
      payload: { message: "why is my oil light flashing" },
    });
    expect(ask.statusCode).toBe(200);
    expect(ask.json().threadId).toBeTruthy();
    const threadId = ask.json().threadId as string;

    const ask2 = await app.inject({
      method: "POST",
      url: "/ai/gearhead",
      headers: { cookie },
      payload: { message: "could it be the sensor", threadId },
    });
    expect(ask2.statusCode).toBe(200);
    expect(ask2.json().threadId).toBe(threadId);

    const threads = await app.inject({
      method: "GET",
      url: "/ai/gearhead/threads",
      headers: { cookie },
    });
    expect(threads.statusCode).toBe(200);
    expect(threads.json().threads.some((t: { id: string }) => t.id === threadId)).toBe(true);

    const detail = await app.inject({
      method: "GET",
      url: `/ai/gearhead/threads/${threadId}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().messages.length).toBeGreaterThanOrEqual(4);
  });

  it("exposes roles on /auth/me for admin gating", async () => {
    await ctx.db.update(users).set({ roles: ["user", "admin"] }).where(eq(users.id, userId));
    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.roles).toContain("admin");
  });
});
