import { createHash } from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import {
  discussionThreads,
  mediaAssets,
  podcastComments,
  podcastEpisodes,
  podcastShows,
} from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

const AUDIO_MIMES = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/webm"] as const;

export const podcastShowInputSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(5000).nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
});

export const podcastEpisodeInputSchema = z.object({
  showId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  mimeType: z.enum(AUDIO_MIMES),
  sizeBytes: z.number().int().min(1).max(500 * 1024 * 1024),
  durationSeconds: z.number().int().min(1).max(24 * 60 * 60).optional(),
  artworkUrl: z.string().url().nullable().optional(),
});

export const podcastReadyInputSchema = z.object({
  audioUrl: z.string().url().optional(),
  durationSeconds: z.number().int().min(1).max(24 * 60 * 60).optional(),
  artworkUrl: z.string().url().nullable().optional(),
});

export const podcastCommentInputSchema = z.object({
  body: z.string().min(1).max(4000),
  parentId: z.string().uuid().nullable().optional(),
});

export const discussionThreadInputSchema = z.object({
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(8000),
});

type EpisodeInput = z.infer<typeof podcastEpisodeInputSchema>;

function signUpload(assetId: string, storageKey: string): string {
  return createHash("sha256").update(`${assetId}:${storageKey}:podcast-audio`).digest("hex").slice(0, 32);
}

function mediaSessionFor(
  episode: typeof podcastEpisodes.$inferSelect,
  show: typeof podcastShows.$inferSelect,
) {
  const artwork = episode.artworkUrl ?? show.coverUrl;
  return {
    title: episode.title,
    artist: show.title,
    artwork: artwork ? [{ src: artwork, sizes: "512x512", type: "image/jpeg" }] : [],
    duration: episode.durationSeconds,
  };
}

export class PodcastService {
  constructor(private readonly db: Database) {}

  createShow(ownerId: string, input: z.infer<typeof podcastShowInputSchema>) {
    const parsed = podcastShowInputSchema.parse(input);
    return this.db
      .insert(podcastShows)
      .values({
        id: uuidv7(),
        ownerId,
        title: parsed.title,
        description: parsed.description ?? null,
        coverUrl: parsed.coverUrl ?? null,
      })
      .returning()
      .then((rows) => rows[0]!);
  }

  listShows(limit = 50) {
    return this.db
      .select()
      .from(podcastShows)
      .where(isNull(podcastShows.deletedAt))
      .orderBy(desc(podcastShows.createdAt))
      .limit(limit);
  }

  getShow(showId: string) {
    return this.db
      .select()
      .from(podcastShows)
      .where(and(eq(podcastShows.id, showId), isNull(podcastShows.deletedAt)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async createEpisodeUploadSession(ownerId: string, input: EpisodeInput) {
    const parsed = podcastEpisodeInputSchema.parse(input);
    const show = await this.getOwnedShow(ownerId, parsed.showId);
    if (!show) return null;

    const episodeId = uuidv7();
    const assetId = uuidv7();
    const storageKey = `uploads/${ownerId}/podcast_audio/${assetId}`;

    await this.db.insert(mediaAssets).values({
      id: assetId,
      ownerId,
      kind: "podcast_audio",
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes,
      storageKey,
      status: "pending",
      metadata: { episodeId },
    });

    const [episode] = await this.db
      .insert(podcastEpisodes)
      .values({
        id: episodeId,
        showId: show.id,
        title: parsed.title,
        description: parsed.description ?? null,
        mediaAssetId: assetId,
        status: "processing",
        artworkUrl: parsed.artworkUrl ?? null,
        durationSeconds: parsed.durationSeconds ?? null,
      })
      .returning();

    return {
      episode: episode!,
      upload: {
        provider: "stub_r2_audio" as const,
        assetId,
        uploadUrl: `https://stub-r2.local/${storageKey}?X-Amz-Signature=${signUpload(assetId, storageKey)}`,
        method: "PUT" as const,
        headers: {
          "Content-Type": parsed.mimeType,
          "Content-Length": String(parsed.sizeBytes),
        },
      },
    };
  }

  async markEpisodeReady(
    ownerId: string,
    episodeId: string,
    input: z.infer<typeof podcastReadyInputSchema>,
  ) {
    const parsed = podcastReadyInputSchema.parse(input);
    const owned = await this.getOwnedEpisode(ownerId, episodeId);
    if (!owned) return null;
    const audioUrl = parsed.audioUrl ?? `https://stub-r2.local/cdn/${owned.episode.mediaAssetId}`;

    const [episode] = await this.db
      .update(podcastEpisodes)
      .set({
        status: "ready",
        audioUrl,
        artworkUrl: parsed.artworkUrl ?? owned.episode.artworkUrl,
        durationSeconds: parsed.durationSeconds ?? owned.episode.durationSeconds,
        updatedAt: new Date(),
      })
      .where(eq(podcastEpisodes.id, episodeId))
      .returning();
    return episode ? { episode, mediaSession: mediaSessionFor(episode, owned.show) } : null;
  }

  async getEpisode(episodeId: string) {
    const [row] = await this.db
      .select({ episode: podcastEpisodes, show: podcastShows })
      .from(podcastEpisodes)
      .innerJoin(podcastShows, eq(podcastEpisodes.showId, podcastShows.id))
      .where(and(eq(podcastEpisodes.id, episodeId), isNull(podcastEpisodes.deletedAt)))
      .limit(1);
    if (!row) return null;
    return { ...row, mediaSession: mediaSessionFor(row.episode, row.show) };
  }

  listEpisodes(showId?: string, limit = 50) {
    const filters = showId
      ? and(eq(podcastEpisodes.showId, showId), isNull(podcastEpisodes.deletedAt))
      : isNull(podcastEpisodes.deletedAt);
    return this.db
      .select()
      .from(podcastEpisodes)
      .where(filters)
      .orderBy(desc(podcastEpisodes.createdAt))
      .limit(limit);
  }

  listComments(episodeId: string) {
    return this.db
      .select()
      .from(podcastComments)
      .where(and(eq(podcastComments.episodeId, episodeId), isNull(podcastComments.deletedAt)))
      .orderBy(asc(podcastComments.createdAt));
  }

  async addComment(userId: string, episodeId: string, input: z.infer<typeof podcastCommentInputSchema>) {
    const parsed = podcastCommentInputSchema.parse(input);
    if (!(await this.getEpisode(episodeId))) return null;
    const [comment] = await this.db
      .insert(podcastComments)
      .values({
        id: uuidv7(),
        episodeId,
        userId,
        parentId: parsed.parentId ?? null,
        body: parsed.body,
      })
      .returning();
    return comment ?? null;
  }

  listThreads(episodeId: string) {
    return this.db
      .select()
      .from(discussionThreads)
      .where(and(eq(discussionThreads.episodeId, episodeId), isNull(discussionThreads.deletedAt)))
      .orderBy(desc(discussionThreads.createdAt));
  }

  async createThread(userId: string, episodeId: string, input: z.infer<typeof discussionThreadInputSchema>) {
    const parsed = discussionThreadInputSchema.parse(input);
    if (!(await this.getEpisode(episodeId))) return null;
    const [thread] = await this.db
      .insert(discussionThreads)
      .values({ id: uuidv7(), episodeId, authorId: userId, title: parsed.title, body: parsed.body })
      .returning();
    return thread ?? null;
  }

  private getOwnedShow(ownerId: string, showId: string) {
    return this.db
      .select()
      .from(podcastShows)
      .where(and(eq(podcastShows.id, showId), eq(podcastShows.ownerId, ownerId), isNull(podcastShows.deletedAt)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  private async getOwnedEpisode(ownerId: string, episodeId: string) {
    const [row] = await this.db
      .select({ episode: podcastEpisodes, show: podcastShows })
      .from(podcastEpisodes)
      .innerJoin(podcastShows, eq(podcastEpisodes.showId, podcastShows.id))
      .where(and(eq(podcastEpisodes.id, episodeId), eq(podcastShows.ownerId, ownerId), isNull(podcastEpisodes.deletedAt)))
      .limit(1);
    return row ?? null;
  }
}
