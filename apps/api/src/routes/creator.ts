import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  creatorTipInputSchema,
  type CreatorMonetizationService,
} from "../services/creator-monetization-service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

export const creatorRoutes: FastifyPluginAsync<{ creator: CreatorMonetizationService }> = async (
  app,
  opts,
) => {
  app.post("/creator/tips", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const result = await opts.creator.createTip(req.user.id, creatorTipInputSchema.parse(req.body));
    return reply.code(201).send(result);
  });

  app.get("/creator/earnings", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return { dashboard: await opts.creator.earningsDashboard(req.user.id) };
  });

  app.get("/creator/:id/supporter-badges", async (req) => {
    const { id } = idParamSchema.parse(req.params);
    return { badges: await opts.creator.listSupporterBadges(id) };
  });
};
