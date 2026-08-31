import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import {
  auditLogs,
  coinLedger,
  creatorEarnings,
  entitlements,
  featureFlags,
  liveGifts,
  liveSessions,
  moderationActions,
  reports,
  shares,
  subscriptions,
  users,
} from "@garagetalk/db";
import { AI_PLANS } from "@garagetalk/shared";
import { verifySync } from "otplib";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

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
  constructor(private readonly db: Database) {}

  async verifyAdmin(userId: string, token: string | undefined): Promise<boolean> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.roles.includes("admin")) return false;
    // Session-only admin when 2FA is not enrolled yet (bootstrap / tester ops).
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

    let giftCount = 0;
    let giftVolumeCoins = 0;
    let coinPurchases = 0;
    let coinsSold = 0;
    let creatorPendingCents = 0;
    let creatorAvailableCents = 0;
    let creatorPaidCents = 0;
    let shareCount = 0;

    try {
      const [giftAgg] = await this.db
        .select({
          giftCount: sql<number>`count(*)`.mapWith(Number),
          giftCoins: sql<number>`coalesce(sum(${liveGifts.coinCost}), 0)`.mapWith(Number),
        })
        .from(liveGifts);
      giftCount = giftAgg?.giftCount ?? 0;
      giftVolumeCoins = giftAgg?.giftCoins ?? 0;
    } catch {
      // table may be absent in older test DBs
    }

    try {
      const [coinAgg] = await this.db
        .select({
          purchaseCount: sql<number>`count(*)`.mapWith(Number),
          coinsSold: sql<number>`coalesce(sum(${coinLedger.deltaCoins}), 0)`.mapWith(Number),
        })
        .from(coinLedger)
        .where(eq(coinLedger.entryType, "coin_purchase"));
      coinPurchases = coinAgg?.purchaseCount ?? 0;
      coinsSold = coinAgg?.coinsSold ?? 0;
    } catch {
      // ignore
    }

    try {
      const earnings = await this.db
        .select({
          status: creatorEarnings.status,
          total: sql<number>`coalesce(sum(${creatorEarnings.netCents}), 0)`.mapWith(Number),
        })
        .from(creatorEarnings)
        .groupBy(creatorEarnings.status);
      for (const row of earnings) {
        if (row.status === "PENDING") creatorPendingCents = row.total;
        if (row.status === "AVAILABLE") creatorAvailableCents = row.total;
        if (row.status === "PAID") creatorPaidCents = row.total;
      }
    } catch {
      // ignore
    }

    try {
      const [shareAgg] = await this.db
        .select({ shareCount: sql<number>`count(*)`.mapWith(Number) })
        .from(shares);
      shareCount = shareAgg?.shareCount ?? 0;
    } catch {
      // ignore
    }

    const envHealth = {
      database: true,
      stripe: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
      livekit: Boolean(process.env.LIVEKIT_API_KEY?.trim() && process.env.LIVEKIT_API_SECRET?.trim()),
      stream: Boolean(process.env.CF_STREAM_TOKEN?.trim() || process.env.CLOUDFLARE_STREAM_TOKEN?.trim()),
      ai: Boolean(process.env.AI_API_KEY?.trim()),
      redis: Boolean(process.env.REDIS_URL?.trim()),
    };

    return {
      users: userRows.length,
      openReports: reportRows.filter((report) => report.status === "open").length,
      activeSubscriptions: subscriptionRows.filter((sub) => sub.status === "active").length,
      liveSessions: liveRows.length,
      giftCount,
      giftVolumeCoins,
      coinPurchases,
      coinsSold,
      creatorPendingCents,
      creatorAvailableCents,
      creatorPaidCents,
      shareCount,
      envHealth,
    };
  }

  async overrideTier(adminId: string, userId: string, input: z.infer<typeof tierOverrideSchema>) {
    const body = tierOverrideSchema.parse(input);
    const before = await this.findUser(userId);
    if (!before) return null;
    const status = body.status ?? "active";
    const [after] = await this.db
      .update(users)
      .set({ tier: body.tier, tierStatus: status, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    const plan = AI_PLANS[body.tier];
    const providerSubscriptionId = `manual:${userId}`;
    const [existing] = await this.db
      .select()
      .from(entitlements)
      .where(
        and(eq(entitlements.provider, "manual"), eq(entitlements.providerSubscriptionId, providerSubscriptionId)),
      )
      .limit(1);

    const entitlementValues = {
      userId,
      provider: "manual" as const,
      providerSubscriptionId,
      tier: body.tier,
      status,
      currentPeriodEnd:
        body.tier === "amateur" ? new Date(Date.now() - 60_000) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      aiMonthlyAllowance: plan.monthlyQuestions,
      featureFlags: {
        photos: plan.photosAllowed,
        live_host: body.tier !== "amateur",
        gifting: true,
      },
      updatedAt: new Date(),
    };

    if (existing) {
      await this.db.update(entitlements).set(entitlementValues).where(eq(entitlements.id, existing.id));
    } else {
      await this.db.insert(entitlements).values({ id: uuidv7(), ...entitlementValues });
    }

    await this.audit(adminId, "admin.user.tier_override", "user", userId, before, after);
    return after ? redactUser(after) : null;
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
