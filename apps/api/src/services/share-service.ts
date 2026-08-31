import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import {
  follows,
  liveSessions,
  posts,
  shareRecipients,
  shares,
  users,
  videos,
} from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

export const createShareSchema = z.object({
  objectType: z.enum(["live", "video", "profile", "post"]),
  objectId: z.string().uuid(),
  recipientUserIds: z.array(z.string().uuid()).max(50).optional(),
  shareType: z.enum(["internal_dm", "copy_link", "external"]).default("copy_link"),
});

export class ShareService {
  constructor(private readonly db: Database) {}

  async createShare(senderUserId: string, input: z.infer<typeof createShareSchema>) {
    const body = createShareSchema.parse(input);
    const shareType =
      body.shareType === "internal_dm" || (body.recipientUserIds?.length ?? 0) > 0
        ? body.recipientUserIds?.length
          ? "internal_dm"
          : body.shareType
        : body.shareType;

    const [share] = await this.db
      .insert(shares)
      .values({
        id: uuidv7(),
        senderUserId,
        objectType: body.objectType,
        objectId: body.objectId,
        shareType,
      })
      .returning();

    const recipients = body.recipientUserIds ?? [];
    if (recipients.length > 0 && share) {
      await this.db.insert(shareRecipients).values(
        recipients.map((recipientUserId) => ({
          id: uuidv7(),
          shareId: share.id,
          recipientUserId,
          status: "pending",
        })),
      );
    }

    return {
      share,
      publicPath: `/s/${body.objectType}/${body.objectId}`,
    };
  }

  async suggestions(userId: string) {
    const followRows = await this.db
      .select({
        id: users.id,
        username: users.username,
        avatarValue: users.avatarValue,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followeeId, users.id))
      .where(eq(follows.followerId, userId))
      .orderBy(desc(follows.createdAt))
      .limit(24);

    if (followRows.length > 0) return followRows;

    return this.db
      .select({
        id: users.id,
        username: users.username,
        avatarValue: users.avatarValue,
      })
      .from(users)
      .where(and(ne(users.id, userId), isNull(users.deletedAt)))
      .orderBy(desc(users.createdAt))
      .limit(12);
  }

  async preview(objectType: string, objectId: string) {
    const type = z.enum(["live", "video", "profile", "post"]).safeParse(objectType);
    if (!type.success) return null;
    const idOk = z.string().uuid().safeParse(objectId);
    if (!idOk.success) return null;

    const base = {
      objectType: type.data,
      objectId: idOk.data,
      url: `https://garagetalk.app/s/${type.data}/${idOk.data}`,
      siteName: "GarageTalk",
      image: "https://garagetalk.app/og-default.jpg",
    };

    if (type.data === "live") {
      const [row] = await this.db
        .select()
        .from(liveSessions)
        .where(eq(liveSessions.id, idOk.data))
        .limit(1);
      if (!row) return { ...base, title: "Live on GarageTalk", description: "Join a live bay session." };
      return {
        ...base,
        title: row.title ?? row.roomName,
        description: `Live ${row.kind} on GarageTalk`,
        appPath: `/live/${row.id}`,
      };
    }

    if (type.data === "video") {
      const [row] = await this.db.select().from(videos).where(eq(videos.id, idOk.data)).limit(1);
      if (!row) return { ...base, title: "Video on GarageTalk", description: "Watch garage builds and repairs." };
      return {
        ...base,
        title: row.title,
        description: `${row.category} · GarageTalk video`,
        image: row.thumbUrl ?? base.image,
        appPath: `/videos`,
      };
    }

    if (type.data === "profile") {
      const [row] = await this.db.select().from(users).where(eq(users.id, idOk.data)).limit(1);
      if (!row) return { ...base, title: "GarageTalk profile", description: "Meet a gearhead on GarageTalk." };
      return {
        ...base,
        title: `@${row.username} on GarageTalk`,
        description: row.bio ?? `Follow @${row.username} on GarageTalk.`,
      };
    }

    const [post] = await this.db.select().from(posts).where(eq(posts.id, idOk.data)).limit(1);
    if (!post) return { ...base, title: "Post on GarageTalk", description: "See what’s popping in the bays." };
    const body = typeof post.body === "string" ? post.body : "";
    return {
      ...base,
      title: "GarageTalk post",
      description: body.slice(0, 160) || "A post from the GarageTalk feed.",
      appPath: `/`,
    };
  }

  /** Validate recipient ids exist (optional helper for callers). */
  async filterExistingUserIds(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await this.db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
    return rows.map((row) => row.id);
  }
}
