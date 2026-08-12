import type { FastifyPluginAsync } from "fastify";
import {
  commentInputSchema,
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

  app.get("/videos", async () => ({ videos: await video.listPublic() }));

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
      const body = uploadSessionSchema.parse(req.body);
      const session = await video.createUploadSession(req.user.id, body);
      return reply.code(201).send(session);
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
