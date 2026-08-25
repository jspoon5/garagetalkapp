import { createHash, randomBytes } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { mediaAssets } from "@garagetalk/db";
import sharp from "sharp";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

/** Allowed image MIME types for presigned uploads. */
export const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const ALLOWED_AUDIO_MIMES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/webm",
] as const;

const IMAGE_KINDS = ["avatar", "vehicle_photo", "video_thumb", "generic"] as const;

export const presignInputSchema = z.object({
  kind: z.enum(["avatar", "vehicle_photo", "video_thumb", "generic", "video", "podcast_audio"]),
  mimeType: z.union([
    z.enum(ALLOWED_IMAGE_MIMES),
    z.enum(ALLOWED_VIDEO_MIMES),
    z.enum(ALLOWED_AUDIO_MIMES),
  ]),
  sizeBytes: z.number().int().min(1).max(2 * 1024 * 1024 * 1024),
}).superRefine((value, ctx) => {
  const image = (ALLOWED_IMAGE_MIMES as readonly string[]).includes(value.mimeType);
  const video = (ALLOWED_VIDEO_MIMES as readonly string[]).includes(value.mimeType);
  const audio = (ALLOWED_AUDIO_MIMES as readonly string[]).includes(value.mimeType);
  if (value.kind === "video" && !video) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "video kind requires a video mime type" });
  }
  if (value.kind === "podcast_audio" && !audio) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "podcast_audio requires an audio mime type" });
  }
  if ((IMAGE_KINDS as readonly string[]).includes(value.kind) && !image) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "image kinds require an image mime type" });
  }
  if ((IMAGE_KINDS as readonly string[]).includes(value.kind) && value.sizeBytes > 20 * 1024 * 1024) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "image uploads max 20MB" });
  }
});

export type PresignInput = z.infer<typeof presignInputSchema>;

export const completeUploadSchema = z.object({
  assetId: z.string().uuid(),
});

export type PresignedUpload = {
  assetId: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
  storageKey: string;
};

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

function readR2Config(env: NodeJS.ProcessEnv = process.env): R2Config | null {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  const publicBaseUrl = env.R2_PUBLIC_BASE_URL?.trim()?.replace(/\/$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function publicUrlForKey(config: R2Config | null, storageKey: string, assetId: string): string {
  if (config) return `${config.publicBaseUrl}/${storageKey}`;
  return `https://stub-r2.local/cdn/${assetId}`;
}

/**
 * Strips EXIF metadata from image buffers via sharp re-encode.
 * If sharp fails (unsupported/corrupt input), returns the original buffer unchanged;
 * callers should treat `stripped: false` as a best-effort fallback, not a security guarantee.
 */
export async function stripExifFromBuffer(
  input: Buffer,
): Promise<{ buffer: Buffer; stripped: boolean; mimeType: string }> {
  try {
    const pipeline = sharp(input).rotate();
    const meta = await pipeline.metadata();
    const format = meta.format === "png" || meta.format === "webp" ? meta.format : "jpeg";
    const buffer =
      format === "png"
        ? await pipeline.png().toBuffer()
        : format === "webp"
          ? await pipeline.webp().toBuffer()
          : await pipeline.jpeg({ mozjpeg: true }).toBuffer();
    const mimeType =
      format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
    return { buffer, stripped: true, mimeType };
  } catch {
    return { buffer: input, stripped: false, mimeType: "application/octet-stream" };
  }
}

function buildStubSignature(assetId: string, storageKey: string): string {
  return createHash("sha256")
    .update(`${assetId}:${storageKey}:stub-r2`)
    .digest("hex")
    .slice(0, 32);
}

export class MediaUploadService {
  constructor(private readonly db: Database) {}

  /** True when live R2 credentials are present (not stub mode). */
  hasR2(): boolean {
    return Boolean(readR2Config());
  }

  publicUrlFor(storageKey: string, assetId: string): string {
    return publicUrlForKey(readR2Config(), storageKey, assetId);
  }

  async createPresignedUpload(
    ownerId: string,
    input: PresignInput,
    opts: { allowStub?: boolean } = {},
  ): Promise<PresignedUpload> {
    const parsed = presignInputSchema.parse(input);
    const assetId = uuidv7();
    const storageKey = `uploads/${ownerId}/${parsed.kind}/${assetId}`;
    const expiresInSeconds = parsed.kind === "video" ? 60 * 60 : 15 * 60;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const r2 = readR2Config();
    const allowStub = opts.allowStub ?? process.env.NODE_ENV !== "production";

    if (!r2 && !allowStub) {
      throw new Error("upload_storage_unconfigured");
    }

    await this.db.insert(mediaAssets).values({
      id: assetId,
      ownerId,
      kind: parsed.kind,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes,
      storageKey,
      status: "pending",
      metadata: { stub: !r2, provider: r2 ? "r2" : "stub" },
    });

    if (r2) {
      const client = createR2Client(r2);
      const command = new PutObjectCommand({
        Bucket: r2.bucket,
        Key: storageKey,
        ContentType: parsed.mimeType,
      });
      const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
      return {
        assetId,
        uploadUrl,
        method: "PUT",
        headers: {
          "Content-Type": parsed.mimeType,
        },
        expiresAt: expiresAt.toISOString(),
        storageKey,
      };
    }

    const signature = buildStubSignature(assetId, storageKey);
    return {
      assetId,
      uploadUrl: `https://stub-r2.local/${storageKey}?X-Amz-Signature=${signature}`,
      method: "PUT",
      headers: {
        "Content-Type": parsed.mimeType,
        "Content-Length": String(parsed.sizeBytes),
      },
      expiresAt: expiresAt.toISOString(),
      storageKey,
    };
  }

  async markUploadComplete(ownerId: string, assetId: string) {
    const [existing] = await this.db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.ownerId, ownerId)))
      .limit(1);
    if (!existing) return null;

    const r2 = readR2Config();
    const [row] = await this.db
      .update(mediaAssets)
      .set({
        status: "uploaded",
        publicUrl: publicUrlForKey(r2, existing.storageKey, assetId),
        updatedAt: new Date(),
      })
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.ownerId, ownerId)))
      .returning();
    return row ?? null;
  }

  async processExifStrip(ownerId: string, assetId: string, rawBuffer: Buffer) {
    const [asset] = await this.db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.ownerId, ownerId)))
      .limit(1);
    if (!asset) return null;

    const { buffer, stripped, mimeType } = await stripExifFromBuffer(rawBuffer);
    const r2 = readR2Config();
    const [row] = await this.db
      .update(mediaAssets)
      .set({
        exifStripped: stripped,
        status: "ready",
        publicUrl: publicUrlForKey(r2, asset.storageKey, assetId),
        metadata: {
          ...(asset.metadata ?? {}),
          processedMimeType: mimeType,
          processedBytes: buffer.length,
        },
        updatedAt: new Date(),
      })
      .where(eq(mediaAssets.id, assetId))
      .returning();

    return row ? { asset: row, buffer, stripped } : null;
  }

  getAsset(ownerId: string, assetId: string) {
    return this.db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.ownerId, ownerId)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  /** Generates a one-off upload token hash for webhook verification stubs. */
  static generateToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return { token, tokenHash };
  }
}
