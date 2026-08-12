import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  coursePurchases,
  courses,
  crewMembers,
  creatorLedgers,
  learningEvents,
  lessonProgress,
  lessons,
  pathNodes,
  pathProgress,
  pitCrews,
  questSubmissions,
  quests,
  schoolMemberships,
  schools,
  skillBadges,
  type Database,
} from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

export const questInputSchema = z.object({
  title: z.string().min(1),
  hazardClass: z.enum(["none", "caution", "restricted_demo_only"]).default("none"),
  safetyCheckpoints: z.array(z.object({ id: z.string(), label: z.string(), blocking: z.boolean().default(true) })),
  steps: z.array(z.object({ id: z.string(), label: z.string() })),
  evidenceRequirements: z.array(z.string()).default([]),
});

export const schoolInputSchema = z.object({
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/),
  membershipPriceCents: z.number().int().min(0).nullable().optional(),
});

export const courseInputSchema = z.object({
  schoolId: z.string().uuid(),
  title: z.string().min(1),
  priceCents: z.number().int().min(0).nullable().optional(),
});

export function localLearningDay(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function syncedPlaybackPositions(
  hostPositionSeconds: number,
  hostNowMs: number,
  clientClockOffsetsMs: number[],
): number[] {
  return clientClockOffsetsMs.map((offset) => hostPositionSeconds + Math.max(offset - hostNowMs, 0) / 1000);
}

function daysBetween(left: string, right: string): number {
  const [ly, lm, ld] = left.split("-").map(Number);
  const [ry, rm, rd] = right.split("-").map(Number);
  return Math.round((Date.UTC(ry!, rm! - 1, rd!) - Date.UTC(ly!, lm! - 1, ld!)) / 86_400_000);
}

export class CampusLearningService {
  constructor(private readonly db: Database) {}

  async completePathNode(userId: string, pathId: string, nodeId: string) {
    const nodes = await this.db.select().from(pathNodes).where(eq(pathNodes.pathId, pathId));
    if (!nodes.some((node) => node.id === nodeId)) return null;
    const [existing] = await this.db
      .select()
      .from(pathProgress)
      .where(and(eq(pathProgress.userId, userId), eq(pathProgress.pathId, pathId)))
      .limit(1);
    const completed = Array.from(new Set([...(existing?.completedNodeIds ?? []), nodeId]));
    await this.db
      .insert(pathProgress)
      .values({ id: existing?.id ?? uuidv7(), userId, pathId, completedNodeIds: completed })
      .onConflictDoUpdate({
        target: [pathProgress.userId, pathProgress.pathId],
        set: { completedNodeIds: completed, updatedAt: new Date() },
      });
    const required = nodes.filter((node) => node.required).map((node) => node.id);
    const pathComplete = required.every((id) => completed.includes(id));
    let badge: typeof skillBadges.$inferSelect | null = null;
    if (pathComplete) {
      await this.db.insert(learningEvents).values({
        id: uuidv7(),
        userId,
        sourceType: "path_completed",
        sourceId: pathId,
      });
      const [inserted] = await this.db
        .insert(skillBadges)
        .values({ id: uuidv7(), userId, pathId, source: "learning_event" })
        .onConflictDoNothing({ target: [skillBadges.userId, skillBadges.pathId] })
        .returning();
      badge =
        inserted ??
        (await this.db
          .select()
          .from(skillBadges)
          .where(and(eq(skillBadges.userId, userId), eq(skillBadges.pathId, pathId)))
          .limit(1))[0] ??
        null;
    }
    return { completedNodeIds: completed, pathComplete, badge };
  }

  async nextLesson(userId: string) {
    const allLessons = await this.db.select().from(lessons).orderBy(asc(lessons.orderIndex));
    const done = await this.db.select().from(lessonProgress).where(eq(lessonProgress.userId, userId));
    const doneIds = new Set(done.map((row) => row.lessonId));
    return allLessons.find((lesson) => !doneIds.has(lesson.id)) ?? null;
  }

  async learnThis(videoId: string) {
    return this.db.select().from(lessons).where(eq(lessons.videoId, videoId)).orderBy(asc(lessons.orderIndex));
  }

  async createQuest(creatorId: string, input: z.infer<typeof questInputSchema>) {
    const body = questInputSchema.parse(input);
    const [quest] = await this.db
      .insert(quests)
      .values({
        id: uuidv7(),
        creatorId,
        title: body.title,
        hazardClass: body.hazardClass,
        safetyCheckpoints: body.safetyCheckpoints,
        steps: body.steps,
        evidenceRequirements: body.evidenceRequirements,
      })
      .returning();
    return quest ?? null;
  }

  async submitQuest(questId: string, userId: string, acks: Record<string, boolean>, evidenceMedia: string[]) {
    const [quest] = await this.db.select().from(quests).where(eq(quests.id, questId)).limit(1);
    if (!quest) return { error: "not_found" as const };
    if (quest.hazardClass === "restricted_demo_only") {
      return { error: "restricted_demo_only" as const, bookingRoute: "/shops/bookings" };
    }
    const checkpoints = z.array(z.object({ id: z.string(), blocking: z.boolean().optional() })).parse(
      quest.safetyCheckpoints ?? [],
    );
    const missing = checkpoints.filter((checkpoint) => checkpoint.blocking !== false && !acks[checkpoint.id]);
    if (missing.length > 0) return { error: "safety_checkpoints_unacked" as const, missing };
    const [submission] = await this.db
      .insert(questSubmissions)
      .values({ id: uuidv7(), questId, userId, stepAcks: acks, evidenceMedia })
      .returning();
    return { submission: submission ?? null };
  }

  async acceptSubmission(submissionId: string, reviewerId: string) {
    const [submission] = await this.db
      .update(questSubmissions)
      .set({ status: "accepted", reviewerId, updatedAt: new Date() })
      .where(eq(questSubmissions.id, submissionId))
      .returning();
    return submission ?? null;
  }

  async createSchool(creatorId: string, input: z.infer<typeof schoolInputSchema>) {
    const body = schoolInputSchema.parse(input);
    const [school] = await this.db
      .insert(schools)
      .values({ id: uuidv7(), creatorId, slug: body.slug, membershipPriceCents: body.membershipPriceCents })
      .returning();
    return school ?? null;
  }

  async createCourse(creatorId: string, input: z.infer<typeof courseInputSchema>) {
    const body = courseInputSchema.parse(input);
    const [course] = await this.db
      .insert(courses)
      .values({ id: uuidv7(), creatorId, schoolId: body.schoolId, title: body.title, priceCents: body.priceCents })
      .returning();
    return course ?? null;
  }

  async hasCourseAccess(userId: string, courseId: string) {
    const [course] = await this.db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    if (!course) return { allowed: false, reason: "not_found" };
    if (!course.priceCents) return { allowed: true, reason: "free" };
    const [purchase] = await this.db
      .select()
      .from(coursePurchases)
      .where(and(eq(coursePurchases.userId, userId), eq(coursePurchases.courseId, courseId)))
      .limit(1);
    return { allowed: Boolean(purchase), reason: purchase ? "paid" : "payment_required" };
  }

  async purchaseCourse(userId: string, courseId: string) {
    const [course] = await this.db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    if (!course) return null;
    const [purchase] = await this.db
      .insert(coursePurchases)
      .values({ id: uuidv7(), userId, courseId, amountCents: course.priceCents ?? 0 })
      .onConflictDoUpdate({
        target: [coursePurchases.userId, coursePurchases.courseId],
        set: { status: "paid", updatedAt: new Date() },
      })
      .returning();
    return purchase ?? null;
  }

  async renewMembership(schoolId: string, userId: string) {
    const [school] = await this.db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
    if (!school) return null;
    const amount = school.membershipPriceCents ?? 0;
    await this.db.insert(schoolMemberships).values({
      id: uuidv7(),
      schoolId,
      userId,
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    }).onConflictDoUpdate({
      target: [schoolMemberships.userId, schoolMemberships.schoolId],
      set: { status: "active", currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
    });
    const [last] = await this.db
      .select()
      .from(creatorLedgers)
      .where(eq(creatorLedgers.userId, school.creatorId))
      .orderBy(desc(creatorLedgers.createdAt))
      .limit(1);
    const [ledger] = await this.db.insert(creatorLedgers).values({
      id: uuidv7(),
      userId: school.creatorId,
      entryType: "membership",
      amountCents: amount,
      grossAmountCents: amount,
      applicationFeeCents: 0,
      subjectType: "school_membership",
      subjectId: schoolId,
      balanceAfter: (last?.balanceAfter ?? 0) + amount,
    }).returning();
    return ledger ?? null;
  }

  async createCrew(ownerId: string, name: string) {
    const [crew] = await this.db.insert(pitCrews).values({
      id: uuidv7(),
      name,
      memberIds: [ownerId],
    }).returning();
    if (crew) await this.joinCrew(crew.id, ownerId, "owner");
    return crew ?? null;
  }

  async joinCrew(crewId: string, userId: string, role = "member") {
    const [member] = await this.db.insert(crewMembers).values({
      id: uuidv7(),
      crewId,
      userId,
      role,
    }).onConflictDoUpdate({
      target: [crewMembers.crewId, crewMembers.userId],
      set: { role, updatedAt: new Date() },
    }).returning();
    return member ?? null;
  }

  async recordLearningStreak(crewId: string, userId: string, at: Date, timezone: string) {
    const [member] = await this.db
      .select()
      .from(crewMembers)
      .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, userId)))
      .limit(1);
    if (!member) return null;
    const day = localLearningDay(at, timezone);
    const increment =
      !member.lastLearningDay || daysBetween(member.lastLearningDay, day) === 1
        ? member.dailyStreak + 1
        : daysBetween(member.lastLearningDay, day) === 0
          ? member.dailyStreak
          : 1;
    const [updated] = await this.db
      .update(crewMembers)
      .set({ dailyStreak: increment, lastLearningDay: day, timezone, updatedAt: new Date() })
      .where(eq(crewMembers.id, member.id))
      .returning();
    return updated ?? null;
  }

  async portfolio(userId: string) {
    return this.db.select().from(skillBadges).where(eq(skillBadges.userId, userId));
  }

  async badgesForPaths(pathIds: string[]) {
    if (pathIds.length === 0) return [];
    return this.db.select().from(skillBadges).where(inArray(skillBadges.pathId, pathIds));
  }
}
