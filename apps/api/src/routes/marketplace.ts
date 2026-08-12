import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  listingInputSchema,
  listingUpdateSchema,
  marketplaceSearchSchema,
  orderTransitionInputSchema,
  purchaseInputSchema,
  type MarketplaceService,
} from "../services/marketplace-service.js";

const idParamsSchema = z.object({ id: z.string().uuid() });

export const marketplaceRoutes: FastifyPluginAsync<{ marketplace: MarketplaceService }> = async (
  app,
  opts,
) => {
  const marketplace = opts.marketplace;

  app.get("/marketplace/listings", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return marketplace.searchListings(req.user.id, marketplaceSearchSchema.parse(req.query));
  });

  app.post("/marketplace/listings", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const listing = await marketplace.createListing(req.user.id, listingInputSchema.parse(req.body));
    return reply.code(201).send({ listing });
  });

  app.patch("/marketplace/listings/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamsSchema.parse(req.params);
    const listing = await marketplace.updateListing(req.user.id, id, listingUpdateSchema.parse(req.body));
    if (!listing) return reply.code(404).send({ error: "not_found" });
    return { listing };
  });

  app.delete("/marketplace/listings/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamsSchema.parse(req.params);
    const listing = await marketplace.deleteListing(req.user.id, id);
    if (!listing) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/marketplace/listings/:id/purchase", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamsSchema.parse(req.params);
    const result = await marketplace.purchase(req.user.id, id, purchaseInputSchema.parse(req.body ?? {}));
    if (!result) return reply.code(400).send({ error: "not_purchasable" });
    return reply.code(201).send(result);
  });

  app.post("/marketplace/orders/:id/state", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamsSchema.parse(req.params);
    const { state } = orderTransitionInputSchema.parse(req.body);
    const order = await marketplace.transitionOrder(req.user.id, id, state);
    if (!order) return reply.code(400).send({ error: "invalid_transition" });
    return { order };
  });

  app.post("/marketplace/orders/:id/refund", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamsSchema.parse(req.params);
    const order = await marketplace.refund(req.user.id, id);
    if (!order) return reply.code(400).send({ error: "not_refundable" });
    return { order };
  });

  app.get("/marketplace/seller/dashboard", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return marketplace.sellerDashboard(req.user.id);
  });
};
