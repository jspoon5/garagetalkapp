import type { FastifyPluginAsync } from "fastify";
import { coinCheckoutSchema, type GiftService } from "../services/gift-service.js";

export const giftRoutes: FastifyPluginAsync<{ gifts: GiftService; appBaseUrl?: string }> = async (app, opts) => {
  const gifts = opts.gifts;
  const appBaseUrl = opts.appBaseUrl ?? "http://localhost:5173";

  app.get("/gifts/catalog", async () => ({ gifts: await gifts.listCatalog() }));

  app.get("/wallet", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return await gifts.getWallet(req.user.id);
  });

  app.post("/coins/checkout", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { packId } = coinCheckoutSchema.parse(req.body);
    const checkout = await gifts.createCoinCheckout(
      req.user.id,
      packId,
      `${appBaseUrl}/?coins=success`,
      `${appBaseUrl}/?coins=cancel`,
    );
    if (!checkout) return reply.code(404).send({ error: "not_found" });
    return { checkout };
  });

  app.get("/creators/earnings", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return await gifts.getCreatorEarnings(req.user.id);
  });
};
