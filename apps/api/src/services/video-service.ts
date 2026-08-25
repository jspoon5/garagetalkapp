import { createHash } from "node:crypto";
import { and, eq, isNull, or, desc } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { videos, webhookEvents } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import {
  createStreamDirectUpload,
  getStreamVideo,
  isStubStreamUploadUrl,
  playbackUrlForUid,
  readStreamConfig,
  streamProviderIsCloudflare,
} from "./cloudflare-stream.js";
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

function allowTestFallback(): boolean {
  return process.env.NODE_ENV === "test";
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

    if (streamProviderIsCloudflare() && stream) {
      const direct = await createStreamDirectUpload({
        accountId: stream.accountId,
        token: stream.token,
        videoId,
      });
      if (isStubStreamUploadUrl(direct.uploadUrl)) {
        throw new Error("stream_stub_rejected");
      }
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

    if (streamProviderIsCloudflare() && !stream && !allowTestFallback()) {
      throw new Error("stream_not_configured");
    }

    // Test-only (or non-cloudflare provider) fallback: R2 / stub R2 — never cloudflare_stream stubs.
    const sizeBytes = parsed.sizeBytes ?? 32 * 1024 * 1024;
    const presigned = await this.media.createPresignedUpload(
      ownerId,
      {
        kind: "video",
        mimeType: parsed.mimeType,
        sizeBytes,
      },
      { allowStub: allowTestFallback() || process.env.NODE_ENV !== "production" },
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

    const stream = readStreamConfig();
    const streamUid = video.streamAssetId;
    const isStreamAsset = Boolean(streamUid && !streamUid.startsWith("r2_"));

    if (isStreamAsset && stream && streamUid) {
      let details;
      try {
        details = await getStreamVideo({
          accountId: stream.accountId,
          token: stream.token,
          uid: streamUid,
          customerSubdomain: stream.customerSubdomain,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream_check_failed";
        if (message.startsWith("stream_http_404")) {
          throw new Error("stream_upload_missing");
        }
        if (message.startsWith("stream_http_")) {
          throw new Error("stream_still_processing");
        }
        throw err;
      }
      if (details.statusState === "error") {
        throw new Error("stream_encoding_failed");
      }
      if (!details.readyToStream || !details.hlsUrl) {
        throw new Error("stream_still_processing");
      }
      const [updated] = await this.db
        .update(videos)
        .set({
          status: "ready",
          hlsUrl: details.hlsUrl,
          thumbUrl: details.thumbUrl ?? video.thumbUrl,
          durationSeconds: details.durationSeconds ?? video.durationSeconds,
          updatedAt: new Date(),
        })
        .where(eq(videos.id, videoId))
        .returning();
      return updated ?? null;
    }

    let playbackUrl = video.hlsUrl;
    if (assetId) {
      const asset = await this.media.markUploadComplete(ownerId, assetId);
      if (!asset) return null;
      playbackUrl = asset.publicUrl ?? this.media.publicUrlFor(asset.storageKey, asset.id);
    } else if (!playbackUrl && allowTestFallback()) {
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

    const stream = readStreamConfig();
    const hls =
      parsed.playback?.hls ??
      playbackUrlForUid(parsed.uid, stream?.customerSubdomain ?? null);

    const [video] = await this.db
      .update(videos)
      .set({
        status: "ready",
        hlsUrl: hls,
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
