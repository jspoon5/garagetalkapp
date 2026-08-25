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
  mimeType: z.enum(["video/mp4", "video/webm", "video/quicktime"]).default("video/mp4"),
  sizeBytes: z.number().int().min(1).max(2 * 1024 * 1024 * 1024).optional(),
});

export const completeVideoUploadSchema = z.object({
  assetId: z.string().uuid().optional(),
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

