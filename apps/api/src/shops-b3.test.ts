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

describe("B3 shops verification", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerCookie: string;
  let adminCookie: string;
  let adminSecret: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"] });
    const owner = await register("shop-owner@example.com", "shopowner");
    const admin = await register("shop-admin@example.com", "shopadmin");
    ownerCookie = owner.cookie;
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

  it("marks unverified shops, hides badges until approval, and supports appeals", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/shops",
      headers: { cookie: ownerCookie },
      payload: {
        name: "Veteran Wrench",
        slug: "veteran-wrench",
        about: "Diesel and EV repair",
        serviceArea: "Austin metro",
        specialties: ["diesel", "ev"],
        photos: ["https://cdn.test/shop.jpg"],
        credentialsMedia: ["https://cdn.test/ase.pdf"],
      },
    });
    expect(created.statusCode).toBe(201);
    const shopId = created.json().shop.id as string;

    const listed = await app.inject({ method: "GET", url: "/shops" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().shops.some((row: { slug: string }) => row.slug === "veteran-wrench")).toBe(true);

    const publicBefore = await app.inject({ method: "GET", url: "/shops/veteran-wrench" });
    expect(publicBefore.json().shop.unverified).toBe(true);
    expect(publicBefore.json().shop.badges.veteranOwned).toBe(false);

    const veteranRequest = await app.inject({
      method: "POST",
      url: `/shops/${shopId}/verification`,
      headers: { cookie: ownerCookie },
      payload: { kind: "veteran_owned", documentMedia: ["https://cdn.test/dd214.pdf"] },
    });
    expect(veteranRequest.statusCode).toBe(201);

    const publicPending = await app.inject({ method: "GET", url: "/shops/veteran-wrench" });
    expect(publicPending.json().shop.veteranOwnedStatus).toBe("pending");
    expect(publicPending.json().shop.badges.veteranOwned).toBe(false);

    const approved = await app.inject({
      method: "POST",
      url: `/admin/shops/verification/${veteranRequest.json().request.id}`,
      headers: adminHeaders(),
      payload: { status: "verified", notes: "document matched" },
    });
    expect(approved.statusCode).toBe(200);

    const publicApproved = await app.inject({ method: "GET", url: "/shops/veteran-wrench" });
    expect(publicApproved.json().shop.badges.veteranOwned).toBe(true);

    const disabledRequest = await app.inject({
      method: "POST",
      url: `/shops/${shopId}/verification`,
      headers: { cookie: ownerCookie },
      payload: { kind: "disabled_owned", documentMedia: ["https://cdn.test/doc.pdf"] },
    });
    await app.inject({
      method: "POST",
      url: `/admin/shops/verification/${disabledRequest.json().request.id}`,
      headers: adminHeaders(),
      payload: { status: "rejected", notes: "name mismatch" },
    });

    const appeal = await app.inject({
      method: "POST",
      url: `/shops/verification/${disabledRequest.json().request.id}/appeal`,
      headers: { cookie: ownerCookie },
      payload: { kind: "disabled_owned", documentMedia: ["https://cdn.test/appeal.pdf"] },
    });
    expect(appeal.statusCode).toBe(201);
    expect(appeal.json().appeal.appealOfId).toBe(disabledRequest.json().request.id);

    const queue = await app.inject({
      method: "GET",
      url: "/admin/shops/verification",
      headers: adminHeaders(),
    });
    expect(queue.json().requests.map((row: { id: string }) => row.id)).toContain(appeal.json().appeal.id);
  });

  async function register(email: string, username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, username, password: "correct-horse-battery", birthYear: 1995, ageConfirmed: true },
    });
    return { id: res.json().user.id as string, cookie: cookieFrom(res) };
  }

  function adminHeaders() {
    return { cookie: adminCookie, "x-admin-totp": generateSync({ secret: adminSecret }) };
  }
});
