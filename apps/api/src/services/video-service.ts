import { createHash } from "node:crypto";
import { and, eq, isNull, or, desc } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { videos, webhookEvents } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { createStreamDirectUpload, readStreamConfig } from "./cloudflare-stream.js";
import { MediaUploadService } from "./media-upload-service.js";
import { VideoCatalog } from "./video-catalog.js";
export {
  VIDEO_CATEGORIES,
  uploadSessionSchema,
  completeVideoUploadSchema,
  updateVideoSchema,
  commentInputSchema,
  heartbeatInputSchema,
  streamWebhookSchema,
  type UploadSessionInput,
  type StreamWebhookPayload,
} from "./video-schemas.js";
import {
  VIDEO_CATEGORIES,
  uploadSessionSchema,
  streamWebhookSchema,
  type UploadSessionInput,
  type StreamWebhookPayload,
} from "./video-schemas.js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class VideoService extends VideoCatalog {
  private readonly streamWebhookTokens = new Map<string, Date>();
  private readonly media: MediaUploadService;

  constructor(db: Database, media?: MediaUploadService) {
    super(db);
    this.media = media ?? new MediaUploadService(db);
  }

  listCategories() {
    return VIDEO_CATEGORIES.slice();
  }

  async createUploadSession(ownerId: string, input: UploadSessionInput) {
    const parsed = uploadSessionSchema.parse(input);
    const videoId = uuidv7();
    const stream = readStreamConfig();

    if (stream) {
      const direct = await createStreamDirectUpload({
        accountId: stream.accountId,
        token: stream.token,
        videoId,
      });
      const [video] = await this.db
        .insert(videos)
        .values({
          id: videoId,
          ownerId,
          title: parsed.title,
          description: parsed.description ?? null,
          category: parsed.category,
          tags: parsed.tags ?? [],
          streamAssetId: direct.uid,
          status: "processing",
        })
        .returning();
      return {
        video: video!,
        upload: {
          provider: "cloudflare_stream" as const,
          uploadUrl: direct.uploadUrl,
          method: "POST" as const,
          headers: {} as Record<string, string>,
          streamAssetId: direct.uid,
          assetId: null as string | null,
        },
      };
    }

    const sizeBytes = parsed.sizeBytes ?? 32 * 1024 * 1024;
    const presigned = await this.media.createPresignedUpload(
      ownerId,
      {
        kind: "video",
        mimeType: parsed.mimeType,
        sizeBytes,
      },
      { allowStub: process.env.NODE_ENV !== "production" },
    );

    const [video] = await this.db
      .insert(videos)
      .values({
        id: videoId,
        ownerId,
        title: parsed.title,
        description: parsed.description ?? null,
        category: parsed.category,
        tags: parsed.tags ?? [],
        streamAssetId: `r2_${presigned.assetId.replace(/-/g, "").slice(0, 16)}`,
        status: "processing",
      })
      .returning();

    return {
      video: video!,
      upload: {
        provider: (this.media.hasR2() ? "r2" : "stub_r2") as "r2" | "stub_r2",
        uploadUrl: presigned.uploadUrl,
        method: "PUT" as const,
        headers: presigned.headers,
        streamAssetId: video!.streamAssetId!,
        assetId: presigned.assetId,
      },
    };
  }

  async completeUpload(ownerId: string, videoId: string, assetId?: string) {
    const [video] = await this.db
      .select()
      .from(videos)
      .where(
        and(eq(videos.id, videoId), eq(videos.ownerId, ownerId), isNull(videos.deletedAt)),
      )
      .limit(1);
    if (!video) return null;

    let playbackUrl = video.hlsUrl;
    if (assetId) {
      const asset = await this.media.markUploadComplete(ownerId, assetId);
      if (!asset) return null;
      playbackUrl = asset.publicUrl ?? this.media.publicUrlFor(asset.storageKey, asset.id);
    } else if (!playbackUrl && process.env.NODE_ENV !== "production") {
      playbackUrl = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
    }

    if (!playbackUrl) {
      throw new Error("playback_url_missing");
    }

    const [updated] = await this.db
      .update(videos)
      .set({
        status: "ready",
        hlsUrl: playbackUrl,
        updatedAt: new Date(),
      })
      .where(eq(videos.id, videoId))
      .returning();
    return updated ?? null;
  }

  listForViewer(viewerId: string | null, limit = 50) {
    if (!viewerId) return this.listPublic(limit);
    return this.db
      .select()
      .from(videos)
      .where(
        and(
          isNull(videos.deletedAt),
          or(eq(videos.status, "ready"), eq(videos.ownerId, viewerId)),
        ),
      )
      .orderBy(desc(videos.createdAt))
      .limit(limit);
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

  async registerStreamWebhookToken(userId: string, token: string, expiresAt: Date) {
    this.streamWebhookTokens.set(hashToken(token), expiresAt);
    void userId;
  }

  verifyStreamWebhookToken(token: string): boolean {
    const expires = this.streamWebhookTokens.get(hashToken(token));
    if (!expires) return false;
    return expires.getTime() > Date.now();
  }
}
