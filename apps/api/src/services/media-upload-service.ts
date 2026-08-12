import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { mediaAssets } from "@garagetalk/db";
import sharp from "sharp";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

/** Allowed image MIME types for presigned uploads. */
export const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

export const presignInputSchema = z.object({
  kind: z.enum(["avatar", "vehicle_photo", "video_thumb", "generic"]),
  mimeType: z.enum(ALLOWED_IMAGE_MIMES),
  sizeBytes: z.number().int().min(1).max(20 * 1024 * 1024),
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

  async createPresignedUpload(ownerId: string, input: PresignInput): Promise<PresignedUpload> {
    const parsed = presignInputSchema.parse(input);
    const assetId = uuidv7();
    const storageKey = `uploads/${ownerId}/${parsed.kind}/${assetId}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const signature = buildStubSignature(assetId, storageKey);

    await this.db.insert(mediaAssets).values({
      id: assetId,
      ownerId,
      kind: parsed.kind,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes,
      storageKey,
      status: "pending",
      metadata: { stub: true },
    });

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
    const [row] = await this.db
      .update(mediaAssets)
      .set({
        status: "uploaded",
        publicUrl: `https://stub-r2.local/cdn/${assetId}`,
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
    const [row] = await this.db
      .update(mediaAssets)
      .set({
        exifStripped: stripped,
        status: "ready",
        publicUrl: `https://stub-r2.local/cdn/${assetId}`,
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
