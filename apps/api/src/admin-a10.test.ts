import { auditLogs, entitlements, reports, users } from "@garagetalk/db";
import { generateSecret, generateSync } from "otplib";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

function cookieFrom(response: {
  headers: Record<string, string | number | string[] | undefined>;
}): string {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

describe("A10 admin", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminCookie: string;
  let userCookie: string;
  let adminId: string;
  let targetId: string;
  let reportId: string;
  const adminTotpSecret = generateSecret();

  beforeAll(async () => {
    ctx = await createTestDb();
    app = await buildApp({
      db: ctx.db,
      trustedOrigins: ["http://localhost:5173"],
    });

    const admin = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "admin@example.com",
        username: "adminuser",
        password: "correct-horse-battery",
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    adminCookie = cookieFrom(admin);
    adminId = admin.json().user.id as string;
    await ctx.db
      .update(users)
      .set({ roles: ["user", "admin"], adminTotpSecret })
      .where(eq(users.id, adminId));

    const user = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "plain@example.com",
        username: "plainuser",
        password: "correct-horse-battery",
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    userCookie = cookieFrom(user);

    const target = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "target@example.com",
        username: "targetuser",
        password: "correct-horse-battery",
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    targetId = target.json().user.id as string;

    reportId = uuidv7();
    await ctx.db.insert(reports).values({
      id: reportId,
      reporterId: adminId,
      subjectType: "video",
      subjectId: uuidv7(),
      reason: "spam",
    });
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  it("rejects unauthenticated tier changes", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/admin/users/${targetId}/tier`,
      payload: { tier: "pro" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("blocks non-admins from every admin route", async () => {
    const routes = [
      { method: "GET", url: "/admin/me" },
      { method: "GET", url: "/admin/users" },
      { method: "GET", url: "/admin/dashboard" },
      { method: "PATCH", url: `/admin/users/${targetId}/tier`, payload: { tier: "pro" } },
      { method: "POST", url: `/admin/users/${targetId}/suspend`, payload: { suspended: true } },
      { method: "DELETE", url: `/admin/users/${targetId}` },
      { method: "GET", url: "/admin/moderation/reports" },
      {
        method: "POST",
        url: `/admin/moderation/reports/${reportId}`,
        payload: { action: "resolve" },
      },
      { method: "GET", url: "/admin/settings" },
      { method: "PUT", url: "/admin/settings/live.enabled", payload: { enabled: true } },
    ] as const;

    for (const route of routes) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: { cookie: userCookie, "x-admin-totp": generateSync({ secret: adminTotpSecret }) },
        payload: "payload" in route ? route.payload : undefined,
      });
      expect(response.statusCode, `${route.method} ${route.url}`).toBe(403);
    }
  });

  it("allows gated admin operations and writes one audit row per mutation", async () => {
    const listed = await app.inject({
      method: "GET",
      url: "/admin/users?query=target",
      headers: adminHeaders(),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().users).toHaveLength(1);

    const dashboard = await app.inject({
      method: "GET",
      url: "/admin/dashboard",
      headers: adminHeaders(),
    });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().stats.users).toBeGreaterThanOrEqual(3);
    expect(dashboard.json().stats.byTier).toBeDefined();

    const me = await app.inject({
      method: "GET",
      url: "/admin/me",
      headers: adminHeaders(),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().admin).toBe(true);

    const before = await ctx.db.select().from(auditLogs);
    const writes = [
      () => app.inject({
        method: "PATCH",
        url: `/admin/users/${targetId}/tier`,
        headers: adminHeaders(),
        payload: { tier: "pro", status: "active" },
      }),
      () => app.inject({
        method: "POST",
        url: `/admin/users/${targetId}/suspend`,
        headers: adminHeaders(),
        payload: { suspended: true },
      }),
      () => app.inject({
        method: "PUT",
        url: "/admin/settings/live.enabled",
        headers: adminHeaders(),
        payload: { enabled: true, meta: { source: "test" } },
      }),
      () => app.inject({
        method: "POST",
        url: `/admin/moderation/reports/${reportId}`,
        headers: adminHeaders(),
        payload: { action: "resolve", status: "resolved", notes: "handled" },
      }),
      () => app.inject({
        method: "DELETE",
        url: `/admin/users/${targetId}`,
        headers: adminHeaders(),
      }),
    ];

    for (const write of writes) {
      const response = await write();
      expect(response.statusCode).toBeLessThan(300);
    }

    const after = await ctx.db.select().from(auditLogs);
    expect(after).toHaveLength(before.length + writes.length);
    expect(after.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "admin.user.tier_override",
        "admin.user.suspend",
        "admin.site_setting.update.live.enabled",
        "admin.report.moderate",
        "admin.user.delete",
      ]),
    );
  });

  it("lets a first-party operator grant Pro with app session only", async () => {
    const previous = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "joe.operator@example.com";
    try {
      const registered = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "joe.operator@example.com",
          username: "joeoperator",
          password: "correct-horse-battery",
          birthYear: 1988,
          ageConfirmed: true,
        },
      });
      expect(registered.statusCode).toBe(200);
      expect(registered.json().user.isAdmin).toBe(true);
      const cookie = cookieFrom(registered);

      const listed = await app.inject({
        method: "GET",
        url: "/admin/users?query=plainuser",
        headers: { cookie },
      });
      expect(listed.statusCode).toBe(200);
      const row = listed.json().users[0] as { id: string; email: string; tier: string };
      expect(row.email).toBe("plain@example.com");

      const granted = await app.inject({
        method: "PATCH",
        url: `/admin/users/${row.id}/tier`,
        headers: { cookie },
        payload: { tier: "pro" },
      });
      expect(granted.statusCode).toBe(200);
      expect(granted.json().user.tier).toBe("pro");

      const [manual] = await ctx.db.select().from(entitlements).where(eq(entitlements.userId, row.id));
      expect(manual?.provider).toBe("manual");
      expect(manual?.tier).toBe("pro");
    } finally {
      if (previous === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = previous;
    }
  });

  function adminHeaders() {
    return {
      cookie: adminCookie,
      "x-admin-totp": generateSync({ secret: adminTotpSecret }),
    };
  }
});
