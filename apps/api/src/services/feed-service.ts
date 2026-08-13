import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  follows,
  postComments,
  posts,
  reactions,
  reports,
  users,
  vehicles,
  type Database,
} from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

const mediaTypeSchema = z.enum(["text", "photo", "video"]);

export const feedPostInputSchema = z.object({
  body: z.string().min(1).max(2_000),
  mediaType: mediaTypeSchema.default("text"),
  media: z.array(z.string().url()).max(8).default([]),
  vehicleId: z.string().uuid().nullable().optional(),
  visibility: z.enum(["public", "followers"]).default("public"),
});

export const feedCommentInputSchema = z.object({
  body: z.string().min(1).max(1_000),
  parentId: z.string().uuid().nullable().optional(),
});

export const feedReactionInputSchema = z.object({
  kind: z.enum(["like", "love", "helpful", "boost"]),
});

export const feedReportInputSchema = z.object({
  reason: z.string().min(3).max(200),
});

type FeedPost = typeof posts.$inferSelect & { source: "followed" | "discovery" };

export class FeedService {
  constructor(private readonly db: Database) {}

  async follow(followerId: string, followeeId: string) {
    if (followerId === followeeId) return false;
    await this.db
      .insert(follows)
      .values({ followerId, followeeId })
      .onConflictDoNothing();
    return true;
  }

  async createPost(authorId: string, input: z.infer<typeof feedPostInputSchema>) {
    const parsed = feedPostInputSchema.parse(input);
    await this.assertVehicleOwner(authorId, parsed.vehicleId ?? null);
    const [post] = await this.db
      .insert(posts)
      .values({
        id: uuidv7(),
        authorId,
        body: parsed.body,
        mediaType: parsed.mediaType,
        media: parsed.media,
        vehicleId: parsed.vehicleId ?? null,
        visibility: parsed.visibility,
      })
      .returning();
    return post!;
  }

  async listFeed(userId: string | null): Promise<Array<FeedPost & { authorUsername: string }>> {
    const followed = userId
      ? await this.db
          .select({ id: follows.followeeId })
          .from(follows)
          .where(eq(follows.followerId, userId))
      : [];
    const followedIds = new Set(followed.map((row) => row.id));
    const rows = await this.db
      .select()
      .from(posts)
      .where(userId ? isNull(posts.deletedAt) : and(isNull(posts.deletedAt), eq(posts.visibility, "public")))
      .orderBy(desc(posts.createdAt))
      .limit(100);
    const authorIds = [...new Set(rows.map((row) => row.authorId))];
    const authors =
      authorIds.length === 0
        ? []
        : await this.db
            .select({ id: users.id, username: users.username })
            .from(users)
            .where(inArray(users.id, authorIds));
    const names = new Map(authors.map((author) => [author.id, author.username]));
    return rows.map((post) => ({
      ...post,
      authorUsername: names.get(post.authorId) ?? "gearhead",
      source: followedIds.has(post.authorId) ? "followed" : "discovery",
    }));
  }

  async react(userId: string, postId: string, input: z.infer<typeof feedReactionInputSchema>) {
    const parsed = feedReactionInputSchema.parse(input);
    await this.db
      .delete(reactions)
      .where(
        and(
          eq(reactions.userId, userId),
          eq(reactions.subjectType, "post"),
          eq(reactions.subjectId, postId),
        ),
      );
    const [reaction] = await this.db
      .insert(reactions)
      .values({
        id: uuidv7(),
        userId,
        subjectType: "post",
        subjectId: postId,
        kind: parsed.kind,
      })
      .returning();
    return reaction!;
  }

  async comment(userId: string, postId: string, input: z.infer<typeof feedCommentInputSchema>) {
    const parsed = feedCommentInputSchema.parse(input);
    const [comment] = await this.db
      .insert(postComments)
      .values({
        id: uuidv7(),
        postId,
        userId,
        parentId: parsed.parentId ?? null,
        body: parsed.body,
      })
      .returning();
    return comment!;
  }

  async share(userId: string, postId: string, body: string) {
    const [original] = await this.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
      .limit(1);
    if (!original) return null;
    const [shared] = await this.db
      .insert(posts)
      .values({
        id: uuidv7(),
        authorId: userId,
        body,
        mediaType: "text",
        media: [],
        sharedPostId: original.id,
        visibility: "public",
      })
      .returning();
    return shared ?? null;
  }

  async report(userId: string, postId: string, input: z.infer<typeof feedReportInputSchema>) {
    const parsed = feedReportInputSchema.parse(input);
    const [report] = await this.db
      .insert(reports)
      .values({
        id: uuidv7(),
        reporterId: userId,
        subjectType: "post",
        subjectId: postId,
        reason: parsed.reason,
      })
      .returning();
    return report!;
  }

  private async assertVehicleOwner(userId: string, vehicleId: string | null) {
    if (!vehicleId) return;
    const owned = await this.db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.userId, userId), isNull(vehicles.deletedAt), inArray(vehicles.id, [vehicleId])))
      .limit(1);
    if (!owned[0]) throw new Error("vehicle_not_found");
  }
}
