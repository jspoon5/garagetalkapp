import { auditLogs, reports, users } from "@garagetalk/db";
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

  it("blocks non-admins from every admin route", async () => {
    const routes = [
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

  function adminHeaders() {
    return {
      cookie: adminCookie,
      "x-admin-totp": generateSync({ secret: adminTotpSecret }),
    };
  }
});
