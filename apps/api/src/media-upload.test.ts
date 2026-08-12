import { describe, expect, it, beforeAll, afterAll } from "vitest";
import sharp from "sharp";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";
import {
  MediaUploadService,
  stripExifFromBuffer,
} from "./services/media-upload-service.js";

describe("media upload presign validation", () => {
  let client: Awaited<ReturnType<typeof createTestDb>>["client"];
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie: string;

  beforeAll(async () => {
    const ctx = await createTestDb();
    client = ctx.client;
    app = await buildApp({
      db: ctx.db,
      trustedOrigins: ["http://localhost:5173"],
    });
    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "upload@example.com",
        username: "uploaduser",
        password: "correct-horse-battery",
      },
    });
    const setCookie = reg.headers["set-cookie"];
    cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it("rejects invalid presign mime and oversize payload", async () => {
    const badMime = await app.inject({
      method: "POST",
      url: "/uploads/presign",
      headers: { cookie },
      payload: { kind: "avatar", mimeType: "application/pdf", sizeBytes: 1024 },
    });
    expect(badMime.statusCode).toBe(400);

    const tooLarge = await app.inject({
      method: "POST",
      url: "/uploads/presign",
      headers: { cookie },
      payload: { kind: "avatar", mimeType: "image/jpeg", sizeBytes: 30 * 1024 * 1024 },
    });
    expect(tooLarge.statusCode).toBe(400);
  });

  it("returns signed URL shape for valid presign", async () => {
    const ok = await app.inject({
      method: "POST",
      url: "/uploads/presign",
      headers: { cookie },
      payload: { kind: "vehicle_photo", mimeType: "image/jpeg", sizeBytes: 2048 },
    });
    expect(ok.statusCode).toBe(201);
    const body = ok.json() as {
      assetId: string;
      uploadUrl: string;
      method: string;
      headers: Record<string, string>;
    };
    expect(body.uploadUrl).toContain("X-Amz-Signature=");
    expect(body.method).toBe("PUT");
    expect(body.headers["Content-Type"]).toBe("image/jpeg");
    expect(body.assetId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe("media upload EXIF strip", () => {
  it("strips EXIF via sharp re-encode path", async () => {
    const withExif = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .jpeg()
      .toBuffer();

    const { buffer, stripped, mimeType } = await stripExifFromBuffer(withExif);
    expect(stripped).toBe(true);
    expect(mimeType).toBe("image/jpeg");
    expect(buffer.length).toBeGreaterThan(0);

    const meta = await sharp(buffer).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("processes asset through service pipeline", async () => {
    const ctx = await createTestDb();
    const media = new MediaUploadService(ctx.db);
    const app = await buildApp({
      db: ctx.db,
      trustedOrigins: ["http://localhost:5173"],
    });

    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "exif@example.com",
        username: "exifuser",
        password: "correct-horse-battery",
      },
    });
    const userId = reg.json().user.id as string;

    const presigned = await media.createPresignedUpload(userId, {
      kind: "avatar",
      mimeType: "image/png",
      sizeBytes: 4096,
    });

    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();

    const result = await media.processExifStrip(userId, presigned.assetId, png);
    expect(result).not.toBeNull();
    expect(result!.stripped).toBe(true);
    expect(result!.asset.status).toBe("ready");
    expect(result!.asset.exifStripped).toBe(true);

    await app.close();
    await ctx.client.close();
  });
});
