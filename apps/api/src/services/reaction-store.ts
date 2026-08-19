import { and, eq, inArray } from "drizzle-orm";
import { reactions, type Database } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";

export async function toggleReaction(
  db: Database,
  userId: string,
  subjectType: string,
  subjectId: string,
  kind: string,
): Promise<{ liked: boolean; reactionId: string | null }> {
  const [existing] = await db
    .select()
    .from(reactions)
    .where(
      and(
        eq(reactions.userId, userId),
        eq(reactions.subjectType, subjectType),
        eq(reactions.subjectId, subjectId),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.kind === kind) {
      await db.delete(reactions).where(eq(reactions.id, existing.id));
      return { liked: false, reactionId: null };
    }
    const [row] = await db
      .update(reactions)
      .set({ kind, updatedAt: new Date() })
      .where(eq(reactions.id, existing.id))
      .returning();
    return { liked: true, reactionId: row?.id ?? existing.id };
  }
  const [row] = await db
    .insert(reactions)
    .values({
      id: uuidv7(),
      userId,
      subjectType,
      subjectId,
      kind,
    })
    .returning();
  return { liked: true, reactionId: row?.id ?? null };
}

export async function reactionIdsForUser(
  db: Database,
  userId: string,
  subjectType: string,
  subjectIds: string[],
): Promise<Set<string>> {
  if (subjectIds.length === 0) return new Set();
  const rows = await db
    .select({ subjectId: reactions.subjectId })
    .from(reactions)
    .where(
      and(
        eq(reactions.userId, userId),
        eq(reactions.subjectType, subjectType),
        inArray(reactions.subjectId, subjectIds),
      ),
    );
  return new Set(rows.map((row) => row.subjectId));
}

export async function reactionCounts(
  db: Database,
  subjectType: string,
  subjectIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (subjectIds.length === 0) return counts;
  const rows = await db
    .select({ subjectId: reactions.subjectId })
    .from(reactions)
    .where(and(eq(reactions.subjectType, subjectType), inArray(reactions.subjectId, subjectIds)));
  for (const row of rows) {
    counts.set(row.subjectId, (counts.get(row.subjectId) ?? 0) + 1);
  }
  return counts;
}
