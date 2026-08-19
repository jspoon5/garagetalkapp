import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  checkoutTierSchema,
  stripeEventSchema,
  tipInputSchema,
  type BillingService,
} from "../services/billing-service.js";

const rawBodySchema = z.union([z.string(), z.instanceof(Buffer)]).transform((body) =>
  typeof body === "string" ? body : body.toString("utf8"),
);

export const billingRoutes: FastifyPluginAsync<{
  billing: BillingService;
  appBaseUrl?: string;
}> = async (app, opts) => {
  const billing = opts.billing;
  const appBaseUrl = opts.appBaseUrl ?? "http://localhost:5173";

  app.get("/billing/tiers", async () => ({ tiers: billing.listTiers() }));

  app.get("/billing/entitlement", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const entitlement = await billing.getEntitlement(req.user.id);
    if (!entitlement) return reply.code(404).send({ error: "not_found" });
    return { entitlement };
  });

  app.post("/billing/checkout", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { tier } = checkoutTierSchema.parse(req.body);
    const checkout = await billing.createSubscriptionCheckout(
      req.user.id,
      tier,
      `${appBaseUrl}/?billing=success`,
      `${appBaseUrl}/?billing=cancel`,
    );
    if (!checkout) return reply.code(404).send({ error: "not_found" });
    return { checkout };
  });

  app.get("/billing/portal", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const portal = await billing.createPortalUrl(req.user.id, `${appBaseUrl}/settings/billing`);
    if (!portal) return reply.code(404).send({ error: "not_found" });
    return { portal };
  });

  app.post("/billing/connect/onboarding", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const onboarding = await billing.createConnectOnboardingLink(
      req.user.id,
      `${appBaseUrl}/settings/payouts`,
    );
    if (!onboarding) return reply.code(404).send({ error: "not_found" });
    return { onboarding };
  });

  app.post("/creators/connect/onboard", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const onboarding = await billing.createConnectOnboardingLink(
      req.user.id,
      `${appBaseUrl}/settings/payouts`,
    );
    if (!onboarding) return reply.code(404).send({ error: "not_found" });
    return { onboarding };
  });

  app.post("/billing/tips", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = tipInputSchema.parse(req.body);
    const result = await billing.createTip(req.user.id, body, {
      successUrl: `${appBaseUrl}/?tip=success`,
      cancelUrl: `${appBaseUrl}/?tip=cancel`,
    });
    return reply.code(201).send(result);
  });

  await app.register(stripeWebhookRoutes, { billing });
};

const stripeWebhookRoutes: FastifyPluginAsync<{ billing: BillingService }> = async (app, opts) => {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/billing/webhooks/stripe", async (req, reply) => {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") return reply.code(400).send({ error: "missing_signature" });
    const rawBody = rawBodySchema.parse(req.body);
    stripeEventSchema.parse(JSON.parse(rawBody) as unknown);
    const result = await opts.billing.handleStripeWebhook(rawBody, signature);
    if (!result.ok) return reply.code(400).send({ error: result.error });
    return result;
  });
};
