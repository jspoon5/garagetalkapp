import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { creatorLedgers, supporterBadges, tips } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

const DEFAULT_FEE_BPS = 1000;

export const creatorTipInputSchema = z.object({
  toUserId: z.string().uuid(),
  amountCents: z.number().int().min(100).max(100_000),
  subjectType: z.enum(["content", "live"]),
  subjectId: z.string().uuid().nullable().optional(),
});

function badgeLevel(totalCents: number): string {
  if (totalCents >= 50_000) return "legend";
  if (totalCents >= 10_000) return "super_supporter";
  return "supporter";
}

export class CreatorMonetizationService {
  constructor(private readonly db: Database) {}

  async createTip(fromUserId: string, input: z.infer<typeof creatorTipInputSchema>) {
    const body = creatorTipInputSchema.parse(input);
    const feeCents = Math.floor((body.amountCents * DEFAULT_FEE_BPS + 5000) / 10_000);
    const netCents = body.amountCents - feeCents;
    const [lastLedger] = await this.db
      .select()
      .from(creatorLedgers)
      .where(eq(creatorLedgers.userId, body.toUserId))
      .orderBy(desc(creatorLedgers.createdAt))
      .limit(1);
    const balanceAfter = (lastLedger?.balanceAfter ?? 0) + netCents;
    const tipId = uuidv7();
    const paymentIntent = `pi_creator_${tipId.replace(/-/g, "").slice(0, 16)}`;

    const [tip] = await this.db
      .insert(tips)
      .values({
        id: tipId,
        fromUserId,
        toUserId: body.toUserId,
        subjectType: body.subjectType,
        subjectId: body.subjectId ?? null,
        amountCents: body.amountCents,
        applicationFeeCents: feeCents,
        stripePaymentIntent: paymentIntent,
      })
      .returning();

    const [ledger] = await this.db
      .insert(creatorLedgers)
      .values({
        id: uuidv7(),
        userId: body.toUserId,
        entryType: "tip",
        amountCents: netCents,
        grossAmountCents: body.amountCents,
        applicationFeeCents: feeCents,
        subjectType: body.subjectType,
        subjectId: body.subjectId ?? tipId,
        stripePaymentIntent: paymentIntent,
        balanceAfter,
      })
      .returning();

    const badge = await this.upsertSupporterBadge(fromUserId, body.toUserId, body.amountCents);
    return { tip: tip ?? null, ledger: ledger ?? null, badge, feeCents, netCents };
  }

  async earningsDashboard(userId: string) {
    const rows = await this.db
      .select()
      .from(creatorLedgers)
      .where(eq(creatorLedgers.userId, userId))
      .orderBy(desc(creatorLedgers.createdAt));
    return rows.reduce(
      (dashboard, row) => {
        dashboard.netCents += row.amountCents;
        dashboard.grossCents += row.grossAmountCents ?? row.amountCents;
        dashboard.feeCents += row.applicationFeeCents;
        dashboard.byType[row.entryType] = (dashboard.byType[row.entryType] ?? 0) + row.amountCents;
        dashboard.entries.push(row);
        return dashboard;
      },
      {
        netCents: 0,
        grossCents: 0,
        feeCents: 0,
        byType: {} as Record<string, number>,
        entries: [] as Array<typeof creatorLedgers.$inferSelect>,
      },
    );
  }

  listSupporterBadges(creatorUserId: string) {
    return this.db
      .select()
      .from(supporterBadges)
      .where(eq(supporterBadges.creatorUserId, creatorUserId));
  }

  private async upsertSupporterBadge(supporterUserId: string, creatorUserId: string, amountCents: number) {
    const [existing] = await this.db
      .select()
      .from(supporterBadges)
      .where(
        and(
          eq(supporterBadges.supporterUserId, supporterUserId),
          eq(supporterBadges.creatorUserId, creatorUserId),
        ),
      )
      .limit(1);
    const totalCents = (existing?.totalCents ?? 0) + amountCents;
    if (existing) {
      const [badge] = await this.db
        .update(supporterBadges)
        .set({ totalCents, level: badgeLevel(totalCents), updatedAt: new Date() })
        .where(eq(supporterBadges.id, existing.id))
        .returning();
      return badge ?? null;
    }
    const [badge] = await this.db
      .insert(supporterBadges)
      .values({
        id: uuidv7(),
        supporterUserId,
        creatorUserId,
        totalCents: amountCents,
        level: badgeLevel(amountCents),
      })
      .returning();
    return badge ?? null;
  }
}
