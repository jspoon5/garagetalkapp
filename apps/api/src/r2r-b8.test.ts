import { users } from "@garagetalk/db";
import { eq } from "drizzle-orm";
import { generateSecret, generateSync } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

function cookieFrom(response: { headers: Record<string, string | number | string[] | undefined> }) {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

describe("B8 R2R hub", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminCookie: string;
  let adminSecret: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"] });
    const admin = await register("r2r-admin@example.com", "r2radmin");
    adminCookie = admin.cookie;
    adminSecret = generateSecret();
    await ctx.db
      .update(users)
      .set({ roles: ["user", "admin"], adminTotpSecret: adminSecret })
      .where(eq(users.id, admin.id));
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  it("supports article CRUD, search, and corpus loading by slug", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/admin/r2r/articles",
      headers: adminHeaders(),
      payload: {
        slug: "trail-brake-basics",
        title: "Trail Brake Basics",
        category: "driving",
        summary: "How to trail brake safely",
        bodyMd: "Trail braking requires smooth release and plenty of runoff.",
        tags: ["braking", "track"],
        published: false,
      },
    });
    expect(created.statusCode).toBe(201);

    const hiddenSearch = await app.inject({ method: "GET", url: "/r2r/articles?q=trail" });
    expect(hiddenSearch.json().articles).toHaveLength(0);

    const published = await app.inject({
      method: "PATCH",
      url: "/admin/r2r/articles/trail-brake-basics",
      headers: adminHeaders(),
      payload: { published: true },
    });
    expect(published.statusCode).toBe(200);

    const search = await app.inject({ method: "GET", url: "/r2r/articles?q=runoff&category=driving" });
    expect(search.statusCode).toBe(200);
    expect(search.json().articles[0].slug).toBe("trail-brake-basics");

    const corpus = await app.inject({ method: "GET", url: "/r2r/corpus/trail-brake-basics" });
    expect(corpus.statusCode).toBe(200);
    expect(corpus.json().corpus.bodyMd).toContain("smooth release");

    const deleted = await app.inject({
      method: "DELETE",
      url: "/admin/r2r/articles/trail-brake-basics",
      headers: adminHeaders(),
    });
    expect(deleted.statusCode).toBe(200);

    const missing = await app.inject({ method: "GET", url: "/r2r/corpus/trail-brake-basics" });
    expect(missing.statusCode).toBe(404);
  });

  async function register(email: string, username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, username, password: "correct-horse-battery" },
    });
    return { id: res.json().user.id as string, cookie: cookieFrom(res) };
  }

  function adminHeaders() {
    return { cookie: adminCookie, "x-admin-totp": generateSync({ secret: adminSecret }) };
  }
});
