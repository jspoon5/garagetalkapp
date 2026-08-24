import type { FastifyPluginAsync } from "fastify";
import {
  commentInputSchema,
  completeVideoUploadSchema,
  heartbeatInputSchema,
  updateVideoSchema,
  uploadSessionSchema,
  VideoService,
} from "../services/video-service.js";

export const videoRoutes: FastifyPluginAsync<{ video: VideoService }> = async (app, opts) => {
  const video = opts.video;

  app.get("/videos/categories", async () => ({ categories: video.listCategories() }));

  app.get("/videos/recently-watched", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const items = await video.listRecentlyWatched(req.user.id);
    return { items };
  });

  app.get("/videos", async (req) => ({
    videos: await video.listForViewer(req.user?.id ?? null),
  }));

  app.get("/videos/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await video.getPublic(id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { video: row };
  });

  app.post("/videos/upload-session", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      try {
        const body = uploadSessionSchema.parse(req.body);
        const session = await video.createUploadSession(req.user.id, body);
        return reply.code(201).send(session);
      } catch (err) {
        const message = err instanceof Error ? err.message : "upload_failed";
        if (message === "stream_not_configured" || message === "stream_stub_rejected") {
          return reply.code(503).send({
            error: "stream_not_configured",
            message:
              "Stream not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_TOKEN on the API.",
          });
        }
        if (message === "upload_storage_unconfigured") {
          return reply.code(503).send({
            error: "upload_storage_unconfigured",
            message:
              "Video storage is not configured. Set Cloudflare Stream credentials on the API.",
          });
        }
        throw err;
      }
    },
  });

  app.post("/videos/:id/complete", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      const { id } = req.params as { id: string };
      const body = completeVideoUploadSchema.parse(req.body ?? {});
      try {
        const row = await video.completeUpload(req.user.id, id, body.assetId);
        if (!row) return reply.code(404).send({ error: "not_found" });
        return { video: row };
      } catch (err) {
        const message = err instanceof Error ? err.message : "complete_failed";
        if (message === "stream_still_processing") {
          const pending = await video.getOwned(req.user.id, id);
          return reply.code(202).send({
            error: "stream_still_processing",
            video: pending,
          });
        }
        if (message === "playback_url_missing") {
          return reply.code(400).send({ error: "playback_url_missing" });
        }
        throw err;
      }
    },
  });

  app.patch("/videos/:id", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      const { id } = req.params as { id: string };
      const body = updateVideoSchema.parse(req.body ?? {});
      const row = await video.update(req.user.id, id, body);
      if (!row) return reply.code(404).send({ error: "not_found" });
      return { video: row };
    },
  });

  app.delete("/videos/:id", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      const { id } = req.params as { id: string };
      const row = await video.softDelete(req.user.id, id);
      if (!row) return reply.code(404).send({ error: "not_found" });
      return { ok: true };
    },
  });

  app.post("/videos/:id/like", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      const { id } = req.params as { id: string };
      const row = await video.like(req.user.id, id);
      if (!row) return reply.code(404).send({ error: "not_found" });
      return { video: row };
    },
  });

  app.delete("/videos/:id/like", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      const { id } = req.params as { id: string };
      const row = await video.unlike(req.user.id, id);
      if (!row) return reply.code(404).send({ error: "not_found" });
      return { video: row };
    },
  });

  app.get("/videos/:id/comments", async (req, reply) => {
    const { id } = req.params as { id: string };
    const v = await video.getPublic(id);
    if (!v) return reply.code(404).send({ error: "not_found" });
    const comments = await video.listComments(id);
    return { comments };
  });

  app.post("/videos/:id/comments", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      const { id } = req.params as { id: string };
      const body = commentInputSchema.parse(req.body);
      const comment = await video.addComment(req.user.id, id, body);
      if (!comment) return reply.code(404).send({ error: "not_found" });
      return reply.code(201).send({ comment });
    },
  });

  app.post("/videos/:id/heartbeat", {
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      const { id } = req.params as { id: string };
      const body = heartbeatInputSchema.parse(req.body);
      const result = await video.recordHeartbeat(req.user.id, id, body);
      if (!result) return reply.code(404).send({ error: "not_found" });
      return result;
    },
  });
};
