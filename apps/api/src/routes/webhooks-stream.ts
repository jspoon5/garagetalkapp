import type { FastifyPluginAsync } from "fastify";
import { streamWebhookSchema, VideoService } from "../services/video-service.js";

export const streamWebhookRoutes: FastifyPluginAsync<{ video: VideoService }> = async (
  app,
  opts,
) => {
  const video = opts.video;

  app.post("/webhooks/stream", {
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const token = req.headers["x-webhook-token"];
      if (typeof token !== "string" || !(await video.verifyStreamWebhookToken(token))) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const eventId =
        typeof req.headers["x-webhook-id"] === "string"
          ? req.headers["x-webhook-id"]
          : `evt_${Date.now()}`;

      const payload = streamWebhookSchema.parse(req.body);
      const result = await video.handleStreamWebhook(eventId, payload);
      return reply.code(result.processed ? 200 : 202).send(result);
    },
  });
};
