import { and, desc, eq } from "drizzle-orm";
import {
  approvedCorpus,
  avatarItems,
  avatarUnlocks,
  creatorLedgers,
  learningEvents,
  liveRoles,
  liveSessions,
  publicBadgeShares,
  qualifiedViews,
  skillBadges,
  videos,
  type Database,
} from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

export const BADGE_DISCLAIMER =
  "Educational achievement — not a professional certification or license";

export const corpusInputSchema = z.object({
  slug: z.string().min(2),
  title: z.string().min(1),
  body: z.string().min(1),
  sourceType: z.enum(["lesson", "b8_hub", "manual"]).default("lesson"),
  hazardClass: z.enum(["none", "caution", "restricted_demo_only"]).default("none"),
});

export const heartbeatInputSchema = z.object({
  mediaType: z.string().min(1),
  mediaId: z.string().uuid(),
  sessionId: z.string().min(3),
  positionSeconds: z.number().int().min(0),
  userAgent: z.string().max(500).optional(),
  observedAt: z.string().datetime().optional(),
});

type ClassRole = "instructor" | "student" | "mod";
type InteractionState = "idle" | "open" | "closed" | "graded";
type Chapter = { title: string; startsAt: number };

const HAZARD_PATTERN = /\b(airbag|srs|high voltage|hv battery|brake line|fuel leak|bypass|weld frame)\b/i;
const ROLE_POWER: Record<ClassRole, number> = { student: 0, mod: 1, instructor: 2 };

export function canClassRole(role: ClassRole, action: string): boolean {
  if (["raise_hand", "answer_poll", "answer_quiz"].includes(action)) return true;
  if (["moderate_chat", "breakout_bays"].includes(action)) return ROLE_POWER[role] >= 1;
  return ROLE_POWER[role] >= 2;
}

export function transitionClassInteraction(
  current: InteractionState,
  event: "open" | "close" | "answer" | "grade",
): InteractionState | null {
  if (event === "open" && current === "idle") return "open";
  if (event === "answer" && current === "open") return "open";
  if (event === "close" && current === "open") return "closed";
  if (event === "grade" && (current === "open" || current === "closed")) return "graded";
  return null;
}

export function chapterForSeek(chapters: Chapter[], seconds: number): Chapter | null {
  return chapters
    .slice()
    .sort((left, right) => left.startsAt - right.startsAt)
    .filter((chapter) => chapter.startsAt <= seconds)
    .at(-1) ?? null;
}

export function renderBadgeComponent(input: { title: string; badgeId: string }) {
  return {
    badgeId: input.badgeId,
    title: input.title,
    disclaimer: BADGE_DISCLAIMER,
    html: `<article data-badge-id="${input.badgeId}"><h1>${input.title}</h1><p>${BADGE_DISCLAIMER}</p></article>`,
  };
}

export class TrackDIntegrityService {
  constructor(private readonly db: Database) {}

  async roleFor(sessionId: string, userId: string): Promise<ClassRole> {
    const [session] = await this.db.select().from(liveSessions).where(eq(liveSessions.id, sessionId)).limit(1);
    if (session?.hostId === userId) return "instructor";
    const [role] = await this.db
      .select()
      .from(liveRoles)
      .where(and(eq(liveRoles.sessionId, sessionId), eq(liveRoles.userId, userId)))
      .limit(1);
    return role?.role === "mod" ? "mod" : "student";
  }

  async assertClassPermission(sessionId: string, userId: string, action: string) {
    const role = await this.roleFor(sessionId, userId);
    return { role, allowed: canClassRole(role, action) };
  }

  async addReplayChapters(sessionId: string, userId: string, chapters: Chapter[]) {
    const permission = await this.assertClassPermission(sessionId, userId, "recording");
    if (!permission.allowed) return null;
    const [session] = await this.db
      .update(liveSessions)
      .set({ chapterMarks: chapters, updatedAt: new Date() })
      .where(eq(liveSessions.id, sessionId))
      .returning();
    return session ?? null;
  }

  async seedCorpus(input: z.infer<typeof corpusInputSchema>) {
    const body = corpusInputSchema.parse(input);
    const [row] = await this.db
      .insert(approvedCorpus)
      .values({ id: uuidv7(), ...body, published: true })
      .onConflictDoUpdate({
        target: [approvedCorpus.slug],
        set: { title: body.title, body: body.body, hazardClass: body.hazardClass, published: true },
      })
      .returning();
    return row ?? null;
  }

  async askForeman(message: string) {
    if (HAZARD_PATTERN.test(message)) {
      return {
        mode: "foreman",
        answer: "This is safety-critical. Stop DIY work and route to a qualified professional.",
        citations: [] as string[],
        hazardEscalation: true,
      };
    }
    const rows = await this.db.select().from(approvedCorpus).where(eq(approvedCorpus.published, true));
    const terms = message.toLowerCase().split(/\W+/).filter((term) => term.length > 3);
    const matches = rows.filter((row) => terms.some((term) => row.body.toLowerCase().includes(term)));
    if (matches.length === 0) {
      return {
        mode: "foreman",
        answer: "I do not have that in the approved Foreman corpus. I can switch to general mode.",
        citations: [] as string[],
        outOfCorpus: true,
        offeredMode: "general",
      };
    }
    return {
      mode: "foreman",
      answer: matches[0]!.body.slice(0, 240),
      citations: matches.map((row) => row.slug),
      outOfCorpus: false,
    };
  }

  async shareBadge(badgeId: string, slug: string) {
    const [badge] = await this.db.select().from(skillBadges).where(eq(skillBadges.id, badgeId)).limit(1);
    if (!badge) return null;
    const [share] = await this.db
      .insert(publicBadgeShares)
      .values({ id: uuidv7(), badgeId, slug, disclaimer: BADGE_DISCLAIMER })
      .returning();
    return { share: share ?? null, component: renderBadgeComponent({ badgeId, title: "Skill Badge" }) };
  }

  async grantAvatarUnlock(userId: string, itemId: string, sourceType: string, sourceId?: string) {
    const [item] = await this.db.select().from(avatarItems).where(eq(avatarItems.id, itemId)).limit(1);
    if (!item) return null;
    const [event] = await this.db
      .insert(learningEvents)
      .values({ id: uuidv7(), userId, sourceType, sourceId: sourceId ?? null, context: "learning" })
      .returning();
    const [unlock] = await this.db
      .insert(avatarUnlocks)
      .values({
        id: uuidv7(),
        userId,
        itemId,
        sourceEventType: sourceType,
        sourceEventId: event!.id,
      })
      .onConflictDoNothing({ target: [avatarUnlocks.userId, avatarUnlocks.itemId] })
      .returning();
    return unlock ?? null;
  }

  async recordHeartbeat(viewerId: string, input: z.infer<typeof heartbeatInputSchema>) {
    const body = heartbeatInputSchema.parse(input);
    const observedAt = body.observedAt ? new Date(body.observedAt) : new Date();
    const viewDate = observedAt.toISOString().slice(0, 10);
    const [video] = await this.db.select().from(videos).where(eq(videos.id, body.mediaId)).limit(1);
    const [existing] = await this.db
      .select()
      .from(qualifiedViews)
      .where(
        and(
          eq(qualifiedViews.viewerId, viewerId),
          eq(qualifiedViews.mediaId, body.mediaId),
          eq(qualifiedViews.viewDate, viewDate),
        ),
      )
      .limit(1);
    const scripted = /bot|crawler|curl|headless|script/i.test(body.userAgent ?? "");
    const replayed = existing ? body.positionSeconds <= existing.watchSeconds : false;
    const heartbeatCount = (existing?.heartbeatCount ?? 0) + 1;
    const watchSeconds = Math.max(existing?.watchSeconds ?? 0, body.positionSeconds);
    const valid = !scripted && !replayed && heartbeatCount >= 3 && watchSeconds >= 30;
    const invalidReason = valid ? null : scripted ? "bot_heuristic" : replayed ? "replayed_or_scripted" : "min_watch";
    const values = {
      id: existing?.id ?? uuidv7(),
      mediaType: body.mediaType,
      mediaId: body.mediaId,
      creatorUserId: video?.ownerId ?? null,
      viewerId,
      sessionId: body.sessionId,
      viewDate,
      heartbeatCount,
      watchSeconds,
      valid,
      invalidReason,
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .insert(qualifiedViews)
      .values(values)
      .onConflictDoUpdate({
        target: [qualifiedViews.viewerId, qualifiedViews.mediaId, qualifiedViews.viewDate],
        set: values,
      })
      .returning();
    return row ?? null;
  }

  async payoutPreview(creatorUserId: string) {
    const rows = await this.db
      .select()
      .from(qualifiedViews)
      .where(and(eq(qualifiedViews.creatorUserId, creatorUserId), eq(qualifiedViews.valid, true)));
    return { validViews: rows.length, payoutCents: rows.length * 100 };
  }

  async dashboard(userId: string) {
    const rows = await this.db.select().from(creatorLedgers).where(eq(creatorLedgers.userId, userId));
    return { netCents: rows.reduce((sum, row) => sum + row.amountCents, 0), entries: rows };
  }

  async reconciliationReport(creatorUserId: string) {
    const payout = await this.payoutPreview(creatorUserId);
    const [last] = await this.db
      .select()
      .from(creatorLedgers)
      .where(eq(creatorLedgers.userId, creatorUserId))
      .orderBy(desc(creatorLedgers.createdAt))
      .limit(1);
    return { creatorUserId, validViewPayoutCents: payout.payoutCents, ledgerBalanceCents: last?.balanceAfter ?? 0 };
  }
}
