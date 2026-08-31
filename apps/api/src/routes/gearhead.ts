import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  AiConcurrentRequestError,
  gearHeadInputSchema,
  GearHeadService,
  PhotosNotAllowedError,
  QuotaExceededError,
} from "../services/gearhead-service.js";

const threadIdParam = z.object({ id: z.string().uuid() });

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
          return reply.code(402).send({
            error: "limit_reached",
            upgrade_required: err.details.upgradeTier !== null,
            ...err.details,
          });
        }
        if (err instanceof PhotosNotAllowedError) {
          return reply.code(403).send({
            error: "photos_not_allowed",
            tier: err.effectiveTier,
            upgradeTier: "gearhead",
            upgrade_required: true,
            message: "Photo diagnostics require GearHead or higher. Upgrade to attach photos.",
          });
        }
        if (err instanceof AiConcurrentRequestError) {
          return reply.code(429).send({
            error: "ai_request_in_flight",
            message: "Please wait for your current GearHead question to finish.",
          });
        }
        if (err instanceof Error && err.message === "vehicle_not_found") {
          return reply.code(404).send({ error: "vehicle_not_found" });
        }
        throw err;
      }
    },
  });

  app.get("/ai/gearhead/threads", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return { threads: await gearhead.listThreads(req.user.id) };
  });

  app.get("/ai/gearhead/threads/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = threadIdParam.parse(req.params);
    const result = await gearhead.getThread(req.user.id, id);
    if (!result) return reply.code(404).send({ error: "not_found" });
    return result;
  });
};
