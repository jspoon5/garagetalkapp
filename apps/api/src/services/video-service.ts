import { createHash } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import {
  recentlyWatched,
  videoComments,
  videoLikes,
  videos,
  viewHeartbeats,
  webhookEvents,
} from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

export const VIDEO_CATEGORIES = [
  "repair",
  "restoration",
  "review",
  "racing",
  "diy",
  "other",
] as const;

export const uploadSessionSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  category: z.enum(VIDEO_CATEGORIES),
  tags: z.array(z.string().min(1).max(48)).max(20).optional(),
});

export const updateVideoSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  category: z.enum(VIDEO_CATEGORIES).optional(),
  tags: z.array(z.string().min(1).max(48)).max(20).optional(),
  customThumb: z.string().url().nullable().optional(),
});

export const commentInputSchema = z.object({
  body: z.string().min(1).max(4000),
  parentId: z.string().uuid().nullable().optional(),
});

export const heartbeatInputSchema = z.object({
  sessionId: z.string().min(8).max(128),
  positionSeconds: z.number().int().min(0).max(86400),
});

export const streamWebhookSchema = z.object({
  uid: z.string().min(1),
  status: z.object({ state: z.string() }),
  duration: z.number().optional(),
  playback: z.object({ hls: z.string().url().optional() }).optional(),
  thumbnail: z.string().url().optional(),
  meta: z
    .object({
      videoId: z.string().uuid().optional(),
    })
    .optional(),
});

export type UploadSessionInput = z.infer<typeof uploadSessionSchema>;
export type StreamWebhookPayload = z.infer<typeof streamWebhookSchema>;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class VideoService {
  private readonly streamWebhookTokens = new Map<string, Date>();

  constructor(private readonly db: Database) {}

  listCategories() {
    return VIDEO_CATEGORIES.slice();
  }

  async createUploadSession(ownerId: string, input: UploadSessionInput) {
    const parsed = uploadSessionSchema.parse(input);
    const videoId = uuidv7();
    const streamAssetId = `cf_${videoId.replace(/-/g, "").slice(0, 16)}`;

    const [video] = await this.db
      .insert(videos)
      .values({
        id: videoId,
        ownerId,
        title: parsed.title,
        description: parsed.description ?? null,
        category: parsed.category,
        tags: parsed.tags ?? [],
        streamAssetId,
        status: "processing",
      })
      .returning();

    return {
      video: video!,
      upload: {
        provider: "cloudflare_stream" as const,
        uploadUrl: `https://upload.videodelivery.net/stub/${streamAssetId}`,
        streamAssetId,
      },
    };
  }

  async handleStreamWebhook(eventId: string, payload: StreamWebhookPayload) {
    const parsed = streamWebhookSchema.parse(payload);
    if (parsed.status.state !== "ready") {
      return { processed: false, reason: "not_ready" as const };
    }

    const existing = await this.db
      .select()
      .from(webhookEvents)
      .where(
        and(eq(webhookEvents.source, "cloudflare_stream"), eq(webhookEvents.eventId, eventId)),
      )
      .limit(1);
    if (existing[0]) {
      return { processed: false, reason: "duplicate" as const };
    }

    const videoId = parsed.meta?.videoId;
    const whereClause = videoId
      ? eq(videos.id, videoId)
      : eq(videos.streamAssetId, parsed.uid);

    const [video] = await this.db
      .update(videos)
      .set({
        status: "ready",
        hlsUrl: parsed.playback?.hls ?? `https://videodelivery.net/${parsed.uid}/manifest/video.m3u8`,
        thumbUrl: parsed.thumbnail ?? null,
        durationSeconds: parsed.duration ?? null,
        updatedAt: new Date(),
      })
      .where(whereClause)
      .returning();

    await this.db.insert(webhookEvents).values({
      id: uuidv7(),
      source: "cloudflare_stream",
      eventId,
      processedAt: new Date(),
      payload: parsed as Record<string, unknown>,
    });

    return { processed: true, video: video ?? null };
  }

  listPublic(limit = 50) {
    return this.db
      .select()
      .from(videos)
      .where(and(eq(videos.status, "ready"), isNull(videos.deletedAt)))
      .orderBy(desc(videos.createdAt))
      .limit(limit);
  }

  getPublic(videoId: string) {
    return this.db
      .select()
      .from(videos)
      .where(
        and(eq(videos.id, videoId), eq(videos.status, "ready"), isNull(videos.deletedAt)),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async update(ownerId: string, videoId: string, input: z.infer<typeof updateVideoSchema>) {
    const parsed = updateVideoSchema.parse(input);
    const [row] = await this.db
      .update(videos)
      .set({ ...parsed, updatedAt: new Date() })
      .where(
        and(eq(videos.id, videoId), eq(videos.ownerId, ownerId), isNull(videos.deletedAt)),
      )
      .returning();
    return row ?? null;
  }

  async softDelete(ownerId: string, videoId: string) {
    const [row] = await this.db
      .update(videos)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(videos.id, videoId), eq(videos.ownerId, ownerId), isNull(videos.deletedAt)),
      )
      .returning();
    return row ?? null;
  }

  async like(userId: string, videoId: string) {
    const video = await this.getPublic(videoId);
    if (!video) return null;

    const likeId = uuidv7();
    await this.db
      .insert(videoLikes)
      .values({ id: likeId, videoId, userId })
      .onConflictDoNothing();

    await this.db
      .update(videos)
      .set({ likeCount: sql`${videos.likeCount} + 1`, updatedAt: new Date() })
      .where(eq(videos.id, videoId));

    const [updated] = await this.db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    return updated ?? null;
  }

  async unlike(userId: string, videoId: string) {
    const deleted = await this.db
      .delete(videoLikes)
      .where(and(eq(videoLikes.videoId, videoId), eq(videoLikes.userId, userId)))
      .returning();
    if (deleted.length === 0) return null;

    await this.db
      .update(videos)
      .set({
        likeCount: sql`GREATEST(${videos.likeCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(videos.id, videoId));

    const [updated] = await this.db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    return updated ?? null;
  }

  listComments(videoId: string) {
    return this.db
      .select()
      .from(videoComments)
      .where(and(eq(videoComments.videoId, videoId), isNull(videoComments.deletedAt)))
      .orderBy(asc(videoComments.createdAt));
  }

  async addComment(userId: string, videoId: string, input: z.infer<typeof commentInputSchema>) {
    const parsed = commentInputSchema.parse(input);
    const video = await this.getPublic(videoId);
    if (!video) return null;

    if (parsed.parentId) {
      const [parent] = await this.db
        .select()
        .from(videoComments)
        .where(
          and(
            eq(videoComments.id, parsed.parentId),
            eq(videoComments.videoId, videoId),
            isNull(videoComments.deletedAt),
          ),
        )
        .limit(1);
      if (!parent) return null;
    }

    const [comment] = await this.db
      .insert(videoComments)
      .values({
        id: uuidv7(),
        videoId,
        userId,
        parentId: parsed.parentId ?? null,
        body: parsed.body,
      })
      .returning();
    return comment ?? null;
  }

  async recordRecentlyWatched(userId: string, videoId: string, positionSeconds: number) {
    const video = await this.getPublic(videoId);
    if (!video) return null;

    const [row] = await this.db
      .insert(recentlyWatched)
      .values({
        id: uuidv7(),
        userId,
        videoId,
        positionSeconds,
        lastWatchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [recentlyWatched.userId, recentlyWatched.videoId],
        set: {
          positionSeconds,
          lastWatchedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return row ?? null;
  }

  listRecentlyWatched(userId: string, limit = 20) {
    return this.db
      .select({
        entry: recentlyWatched,
        video: videos,
      })
      .from(recentlyWatched)
      .innerJoin(videos, eq(recentlyWatched.videoId, videos.id))
      .where(
        and(eq(recentlyWatched.userId, userId), isNull(videos.deletedAt), eq(videos.status, "ready")),
      )
      .orderBy(desc(recentlyWatched.lastWatchedAt))
      .limit(limit);
  }

  async recordHeartbeat(userId: string, videoId: string, input: z.infer<typeof heartbeatInputSchema>) {
    const parsed = heartbeatInputSchema.parse(input);
    const video = await this.getPublic(videoId);
    if (!video) return null;

    const viewDate = todayUtc();
    const existing = await this.db
      .select()
      .from(viewHeartbeats)
      .where(
        and(
          eq(viewHeartbeats.userId, userId),
          eq(viewHeartbeats.mediaId, videoId),
          eq(viewHeartbeats.viewDate, viewDate),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await this.db
        .update(viewHeartbeats)
        .set({
          positionSeconds: parsed.positionSeconds,
          sessionId: parsed.sessionId,
          updatedAt: new Date(),
        })
        .where(eq(viewHeartbeats.id, existing[0].id));

      await this.recordRecentlyWatched(userId, videoId, parsed.positionSeconds);

      return {
        deduped: true,
        qualified: existing[0].id,
        viewCount: video.viewCount,
      };
    }

    const heartbeatId = uuidv7();
    await this.db.insert(viewHeartbeats).values({
      id: heartbeatId,
      userId,
      sessionId: parsed.sessionId,
      mediaType: "video",
      mediaId: videoId,
      viewDate,
      positionSeconds: parsed.positionSeconds,
    });

    const [updated] = await this.db
      .update(videos)
      .set({ viewCount: sql`${videos.viewCount} + 1`, updatedAt: new Date() })
      .where(eq(videos.id, videoId))
      .returning();

    await this.recordRecentlyWatched(userId, videoId, parsed.positionSeconds);

    return {
      deduped: false,
      qualified: heartbeatId,
      viewCount: updated?.viewCount ?? video.viewCount + 1,
    };
  }

  async registerStreamWebhookToken(_userId: string | null, token: string, expiresAt: Date) {
    this.streamWebhookTokens.set(hashToken(token), expiresAt);
  }

  async verifyStreamWebhookToken(token: string): Promise<boolean> {
    const expiresAt = this.streamWebhookTokens.get(hashToken(token));
    if (!expiresAt) return false;
    if (expiresAt.getTime() < Date.now()) return false;
    return true;
  }
}
