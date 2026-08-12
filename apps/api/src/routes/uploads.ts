import type { FastifyPluginAsync } from "fastify";
import {
  completeUploadSchema,
  MediaUploadService,
  presignInputSchema,
} from "../services/media-upload-service.js";

export const uploadRoutes: FastifyPluginAsync<{ media: MediaUploadService }> = async (
  app,
  opts,
) => {
  const media = opts.media;

  app.post("/uploads/presign", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      const parsed = presignInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }
      const presigned = await media.createPresignedUpload(req.user.id, parsed.data);
      return reply.code(201).send(presigned);
    },
  });

  app.post("/uploads/:assetId/complete", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      const { assetId } = req.params as { assetId: string };
      completeUploadSchema.parse({ assetId });
      const asset = await media.markUploadComplete(req.user.id, assetId);
      if (!asset) return reply.code(404).send({ error: "not_found" });
      return { asset };
    },
  });

  app.post("/uploads/:assetId/strip-exif", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      const { assetId } = req.params as { assetId: string };
      const body = req.body;
      if (!Buffer.isBuffer(body)) {
        return reply.code(400).send({ error: "binary_body_required" });
      }
      const result = await media.processExifStrip(req.user.id, assetId, body);
      if (!result) return reply.code(404).send({ error: "not_found" });
      return {
        asset: result.asset,
        stripped: result.stripped,
        processedBytes: result.buffer.length,
      };
    },
  });

  app.get("/uploads/:assetId", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { assetId } = req.params as { assetId: string };
    const asset = await media.getAsset(req.user.id, assetId);
    if (!asset) return reply.code(404).send({ error: "not_found" });
    return { asset };
  });
};
