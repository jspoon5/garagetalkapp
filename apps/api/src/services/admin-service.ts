import { desc, eq } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { auditLogs, featureFlags, liveSessions, moderationActions, reports, subscriptions, users } from "@garagetalk/db";
import { isFirstPartyAdminEmail } from "@garagetalk/shared";
import { verifySync } from "otplib";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import type { EntitlementService } from "./entitlement-service.js";

export const tierOverrideSchema = z.object({
  tier: z.enum(["amateur", "gearhead", "racing_pro", "pro"]),
  status: z.enum(["active", "canceled", "past_due", "trialing"]).optional(),
});

export const suspendUserSchema = z.object({
  suspended: z.boolean(),
});

export const moderationActionSchema = z.object({
  action: z.string().min(1).max(80),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(["open", "reviewing", "resolved", "dismissed"]).optional(),
});

export const siteSettingSchema = z.object({
  enabled: z.boolean(),
  meta: z.record(z.unknown()).optional(),
});

function asRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>;
}

function redactUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    roles: row.roles,
    tier: row.tier,
    tierStatus: row.tierStatus,
    suspendedAt: row.suspendedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
  };
}

export class AdminService {
  constructor(
    private readonly db: Database,
    private readonly entitlements?: EntitlementService,
  ) {}

  async verifyAdmin(userId: string, token: string | undefined): Promise<boolean> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.suspendedAt || user.deletedAt) return false;
    const firstParty = isFirstPartyAdminEmail(user.email);
    if (!user.roles.includes("admin") && !firstParty) return false;
    if (!user.adminTotpSecret) return true;
    if (!token) return false;
    return verifySync({ token, secret: user.adminTotpSecret }).valid;
  }

  async lookupUsers(query: string | undefined) {
    const rows = await this.db.select().from(users).orderBy(desc(users.createdAt)).limit(100);
    const normalized = query?.trim().toLowerCase();
    const filtered = normalized
      ? rows.filter(
          (row) =>
            row.email.toLowerCase().includes(normalized) ||
            row.username.toLowerCase().includes(normalized) ||
            row.id === normalized,
        )
      : rows;
    return filtered.map(redactUser);
  }

  async getDashboardStats() {
    const [userRows, reportRows, subscriptionRows, liveRows] = await Promise.all([
      this.db.select().from(users),
      this.db.select().from(reports),
      this.db.select().from(subscriptions),
      this.db.select().from(liveSessions),
    ]);
    const byTier = {
      amateur: userRows.filter((row) => row.tier === "amateur").length,
      gearhead: userRows.filter((row) => row.tier === "gearhead").length,
      racing_pro: userRows.filter((row) => row.tier === "racing_pro").length,
      pro: userRows.filter((row) => row.tier === "pro").length,
    };
    return {
      users: userRows.length,
      paidUsers: userRows.filter((row) => row.tier !== "amateur").length,
      openReports: reportRows.filter((report) => report.status === "open").length,
      activeSubscriptions: subscriptionRows.filter((sub) => sub.status === "active").length,
      liveSessions: liveRows.length,
      byTier,
    };
  }

  async overrideTier(adminId: string, userId: string, input: z.infer<typeof tierOverrideSchema>) {
    const body = tierOverrideSchema.parse(input);
    const before = await this.findUser(userId);
    if (!before) return null;
    const status = body.status ?? (body.tier === "amateur" ? "canceled" : "active");
    let after = before;
    if (this.entitlements) {
      const granted = await this.entitlements.grantManualTier(userId, body.tier, status);
      if (!granted) return null;
      after = granted;
    } else {
      const [updated] = await this.db
        .update(users)
        .set({ tier: body.tier, tierStatus: status, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      if (!updated) return null;
      after = updated;
    }
    await this.audit(adminId, "admin.user.tier_override", "user", userId, before, after);
    return redactUser(after);
  }

  async suspendUser(adminId: string, userId: string, input: z.infer<typeof suspendUserSchema>) {
    const body = suspendUserSchema.parse(input);
    const before = await this.findUser(userId);
    if (!before) return null;
    const [after] = await this.db
      .update(users)
      .set({ suspendedAt: body.suspended ? new Date() : null, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    await this.audit(adminId, "admin.user.suspend", "user", userId, before, after);
    return after ? redactUser(after) : null;
  }

  async deleteUser(adminId: string, userId: string) {
    const before = await this.findUser(userId);
    if (!before) return null;
    const [after] = await this.db
      .update(users)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    await this.audit(adminId, "admin.user.delete", "user", userId, before, after);
    return after ? redactUser(after) : null;
  }

  async listReports() {
    return this.db.select().from(reports).orderBy(desc(reports.createdAt)).limit(100);
  }

  async moderateReport(
    adminId: string,
    reportId: string,
    input: z.infer<typeof moderationActionSchema>,
  ) {
    const body = moderationActionSchema.parse(input);
    const [before] = await this.db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
    if (!before) return null;
    await this.db.insert(moderationActions).values({
      id: uuidv7(),
      reportId,
      actorId: adminId,
      action: body.action,
      notes: body.notes ?? null,
    });
    const [after] = await this.db
      .update(reports)
      .set({ status: body.status ?? "resolved", updatedAt: new Date() })
      .where(eq(reports.id, reportId))
      .returning();
    await this.audit(adminId, "admin.report.moderate", "report", reportId, before, after);
    return after ?? null;
  }

  async listSiteSettings() {
    return this.db.select().from(featureFlags).orderBy(desc(featureFlags.createdAt)).limit(100);
  }

  async updateSiteSetting(
    adminId: string,
    key: string,
    input: z.infer<typeof siteSettingSchema>,
  ) {
    const body = siteSettingSchema.parse(input);
    const [before] = await this.db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
    const [after] = await this.db
      .insert(featureFlags)
      .values({
        id: before?.id ?? uuidv7(),
        key,
        enabled: String(body.enabled),
        meta: body.meta ?? {},
      })
      .onConflictDoUpdate({
        target: featureFlags.key,
        set: { enabled: String(body.enabled), meta: body.meta ?? {}, updatedAt: new Date() },
      })
      .returning();
    await this.audit(adminId, `admin.site_setting.update.${key}`, "site_setting", null, before, after);
    return after ?? null;
  }

  private async findUser(userId: string) {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return row ?? null;
  }

  private async audit(
    adminId: string,
    action: string,
    subjectType: string,
    subjectId: string | null,
    before: unknown,
    after: unknown,
  ) {
    await this.db.insert(auditLogs).values({
      id: uuidv7(),
      adminId,
      action,
      subjectType,
      subjectId,
      before: asRecord(before),
      after: asRecord(after),
    });
  }
}
