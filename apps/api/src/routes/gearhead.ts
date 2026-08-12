import type { FastifyPluginAsync } from "fastify";
import {
  gearHeadInputSchema,
  GearHeadService,
  QuotaExceededError,
} from "../services/gearhead-service.js";

export const gearHeadRoutes: FastifyPluginAsync<{ gearhead: GearHeadService }> = async (app, opts) => {
  const gearhead = opts.gearhead;

  app.post("/ai/gearhead", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      const body = gearHeadInputSchema.parse(req.body);
      try {
        return await gearhead.ask(req.user.id, body);
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          return reply.code(402).send({ error: "ai_quota_exceeded", quota: err.quota });
        }
        if (err instanceof Error && err.message === "vehicle_not_found") {
          return reply.code(404).send({ error: "vehicle_not_found" });
        }
        throw err;
      }
    },
  });
};
