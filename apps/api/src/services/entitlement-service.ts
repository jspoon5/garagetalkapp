import { and, desc, eq, or } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { entitlements, subscriptions, users } from "@garagetalk/db";
import {
  AI_PLANS,
  getEffectiveSubscriptionTier,
  type AiPlan,
  type AiPlanId,
} from "@garagetalk/shared";
import { uuidv7 } from "uuidv7";

export type UserEntitlement = {
  user: typeof users.$inferSelect;
  storedTier: AiPlanId;
  effectiveTier: AiPlanId;
  plan: AiPlan;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  periodEnd: Date | null;
  featureFlags: Record<string, boolean>;
  aiUsage: number;
  aiQuota: number;
  photosAllowed: boolean;
  canHostLive: boolean;
};

export type PublicEntitlement = {
  tier: AiPlanId;
  tierLabel: string;
  effectiveTier: AiPlanId;
  subscriptionStatus: string | null;
  periodEnd: string | null;
  aiUsage: number;
  aiQuota: number;
  photosAllowed: boolean;
  canHostLive: boolean;
  upgradeTier: Exclude<AiPlanId, "amateur"> | null;
};

function nextUpgrade(current: AiPlanId): Exclude<AiPlanId, "amateur"> | null {
  const order: AiPlanId[] = ["amateur", "gearhead", "racing_pro", "pro"];
  const idx = order.indexOf(current);
  if (idx < 0 || idx >= order.length - 1) return null;
  const next = order[idx + 1]!;
  return next === "amateur" ? "gearhead" : (next as Exclude<AiPlanId, "amateur">);
}

export class EntitlementService {
  constructor(private readonly db: Database) {}

  async resolveForUser(userId: string): Promise<UserEntitlement | null> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;

    const entitlementRow = await this.findActiveEntitlement(userId);
    let effectiveTier: AiPlanId = "amateur";
    let subscriptionId: string | null = null;
    let subscriptionStatus: string | null = null;
    let periodEnd: Date | null = null;
    let featureFlags: Record<string, boolean> = {};

    if (entitlementRow) {
      effectiveTier = this.tierFromEntitlement(entitlementRow);
      subscriptionId = entitlementRow.id;
      subscriptionStatus = entitlementRow.status;
      periodEnd = entitlementRow.currentPeriodEnd ?? null;
      featureFlags = entitlementRow.featureFlags ?? {};
    } else {
      const storedTier = user.tier;
      effectiveTier = getEffectiveSubscriptionTier(storedTier, user.tierStatus);
      if (storedTier !== "amateur") {
        const [sub] = await this.db
          .select()
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.userId, userId),
              or(eq(subscriptions.status, "active"), eq(subscriptions.status, "trialing")),
            ),
          )
          .orderBy(desc(subscriptions.updatedAt))
          .limit(1);

        if (!sub) {
          effectiveTier = "amateur";
        } else {
          subscriptionId = sub.id;
          subscriptionStatus = sub.status;
          periodEnd = sub.currentPeriodEnd ?? null;
          if (periodEnd && periodEnd.getTime() <= Date.now()) {
            effectiveTier = "amateur";
          } else {
            effectiveTier = getEffectiveSubscriptionTier(sub.tier, sub.status);
          }
        }
      }
    }

    const plan = AI_PLANS[effectiveTier];
    const photosAllowed = featureFlags.photos ?? plan.photosAllowed;
    const canHostLive = featureFlags.live_host ?? effectiveTier !== "amateur";

    return {
      user,
      storedTier: user.tier,
      effectiveTier,
      plan,
      subscriptionId,
      subscriptionStatus,
      periodEnd,
      featureFlags,
      aiUsage: user.aiMonthUsage,
      aiQuota: plan.monthlyQuestions,
      photosAllowed,
      canHostLive,
    };
  }

  toPublic(entitlement: UserEntitlement): PublicEntitlement {
    return {
      tier: entitlement.storedTier,
      tierLabel: entitlement.plan.label,
      effectiveTier: entitlement.effectiveTier,
      subscriptionStatus: entitlement.subscriptionStatus,
      periodEnd: entitlement.periodEnd?.toISOString() ?? null,
      aiUsage: entitlement.aiUsage,
      aiQuota: entitlement.aiQuota,
      photosAllowed: entitlement.photosAllowed,
      canHostLive: entitlement.canHostLive,
      upgradeTier: nextUpgrade(entitlement.effectiveTier),
    };
  }

  async syncFromStripeSubscription(input: {
    userId: string;
    tier: AiPlanId;
    status: string;
    providerSubscriptionId: string;
    currentPeriodEnd: Date | null;
  }) {
    const plan = AI_PLANS[input.tier === "amateur" ? "amateur" : input.tier];
    const active = input.status === "active" || input.status === "trialing";
    const effectiveTier = active ? input.tier : "amateur";
    const effectivePlan = AI_PLANS[effectiveTier];

    const [existing] = await this.db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.provider, "stripe"),
          eq(entitlements.providerSubscriptionId, input.providerSubscriptionId),
        ),
      )
      .limit(1);

    const values = {
      userId: input.userId,
      provider: "stripe" as const,
      providerSubscriptionId: input.providerSubscriptionId,
      tier: input.tier,
      status: mapEntitlementStatus(input.status),
      currentPeriodEnd: input.currentPeriodEnd,
      aiMonthlyAllowance: effectivePlan.monthlyQuestions,
      featureFlags: {
        photos: effectivePlan.photosAllowed,
        live_host: effectiveTier !== "amateur",
        gifting: true,
      },
      updatedAt: new Date(),
    };

    if (existing) {
      await this.db.update(entitlements).set(values).where(eq(entitlements.id, existing.id));
    } else {
      await this.db.insert(entitlements).values({ id: uuidv7(), ...values });
    }

    await this.db
      .update(users)
      .set({
        tier: active ? input.tier : "amateur",
        tierStatus: mapEntitlementStatus(input.status),
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.userId));

    void plan;
  }

  async grantManualTier(
    userId: string,
    tier: AiPlanId,
    status: "active" | "canceled" | "past_due" | "trialing" = "active",
  ) {
    const paid = tier !== "amateur" && (status === "active" || status === "trialing");
    const effectiveTier: AiPlanId = paid ? tier : "amateur";
    const plan = AI_PLANS[effectiveTier];
    const entitlementStatus = paid ? status : "canceled";
    const providerSubscriptionId = `manual:${userId}`;

    const [existing] = await this.db
      .select()
      .from(entitlements)
      .where(and(eq(entitlements.userId, userId), eq(entitlements.provider, "manual")))
      .limit(1);

    const values = {
      userId,
      provider: "manual" as const,
      providerSubscriptionId,
      tier: effectiveTier,
      status: entitlementStatus,
      currentPeriodEnd: null,
      aiMonthlyAllowance: plan.monthlyQuestions,
      featureFlags: {
        photos: plan.photosAllowed,
        live_host: effectiveTier !== "amateur",
        gifting: true,
      },
      updatedAt: new Date(),
    };

    if (existing) {
      await this.db.update(entitlements).set(values).where(eq(entitlements.id, existing.id));
    } else {
      await this.db.insert(entitlements).values({ id: uuidv7(), ...values });
    }

    const [user] = await this.db
      .update(users)
      .set({
        tier: effectiveTier,
        tierStatus: entitlementStatus,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user ?? null;
  }

  async findManualEntitlement(userId: string) {
    const [row] = await this.db
      .select()
      .from(entitlements)
      .where(and(eq(entitlements.userId, userId), eq(entitlements.provider, "manual")))
      .limit(1);
    return row ?? null;
  }

  private async findActiveEntitlement(userId: string) {
    const [row] = await this.db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.userId, userId),
          or(eq(entitlements.status, "active"), eq(entitlements.status, "trialing")),
        ),
      )
      .orderBy(desc(entitlements.updatedAt))
      .limit(1);
    if (!row) return null;
    if (row.currentPeriodEnd && row.currentPeriodEnd.getTime() <= Date.now()) return null;
    return row;
  }

  private tierFromEntitlement(row: typeof entitlements.$inferSelect): AiPlanId {
    if (row.status !== "active" && row.status !== "trialing") return "amateur";
    if (row.currentPeriodEnd && row.currentPeriodEnd.getTime() <= Date.now()) return "amateur";
    return getEffectiveSubscriptionTier(row.tier, row.status);
  }
}

function mapEntitlementStatus(status: string): "active" | "canceled" | "past_due" | "trialing" {
  if (status === "trialing") return "trialing";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  if (status === "canceled" || status === "deleted") return "canceled";
  return "active";
}
