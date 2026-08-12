import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAdmin } from "./admin-gate.js";
import { BookingConflictError, bookingRequestSchema, type BookingService } from "../services/booking-service.js";
import {
  availabilityExceptionInputSchema,
  availabilityRuleInputSchema,
  shopServiceInputSchema,
} from "../services/booking-service.js";
import type { AdminService } from "../services/admin-service.js";
import {
  ownerResponseSchema,
  reportReviewSchema,
  reviewInputSchema,
  shopInputSchema,
  verificationDecisionSchema,
  verificationInputSchema,
  type ShopService,
} from "../services/shop-service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const slugParamSchema = z.object({ slug: z.string().min(3).max(160) });

export const shopRoutes: FastifyPluginAsync<{
  shops: ShopService;
  booking: BookingService;
  admin: AdminService;
}> = async (app, opts) => {
  app.post("/shops", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const shop = await opts.shops.createShop(req.user.id, shopInputSchema.parse(req.body));
    return reply.code(201).send({ shop });
  });

  app.get("/shops/:slug", async (req, reply) => {
    const { slug } = slugParamSchema.parse(req.params);
    const shop = await opts.shops.getShopBySlug(slug);
    if (!shop) return reply.code(404).send({ error: "not_found" });
    return { shop };
  });

  app.patch("/shops/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const shop = await opts.shops.updateShop(req.user.id, id, shopInputSchema.partial().parse(req.body));
    if (!shop) return reply.code(404).send({ error: "not_found" });
    return { shop };
  });

  app.post("/shops/:id/verification", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const request = await opts.shops.submitVerification(id, req.user.id, verificationInputSchema.parse(req.body));
    if (!request) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ request });
  });

  app.post("/shops/verification/:id/appeal", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const appeal = await opts.shops.appealVerification(req.user.id, id, verificationInputSchema.parse(req.body));
    if (!appeal) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ appeal });
  });

  app.get("/admin/shops/verification", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, opts.admin);
    if (!adminId) return;
    return { requests: await opts.shops.listVerificationQueue() };
  });

  app.post("/admin/shops/verification/:id", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, opts.admin);
    if (!adminId) return;
    const { id } = idParamSchema.parse(req.params);
    const request = await opts.shops.reviewVerification(adminId, id, verificationDecisionSchema.parse(req.body));
    if (!request) return reply.code(404).send({ error: "not_found" });
    return { request };
  });

  app.post("/shops/reviews", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const result = await opts.shops.createReview(req.user.id, reviewInputSchema.parse(req.body));
    if ("error" in result) return reply.code(400).send({ error: result.error });
    return reply.code(201).send(result);
  });

  app.post("/shops/reviews/:id/owner-response", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const body = ownerResponseSchema.parse(req.body);
    const review = await opts.shops.ownerRespond(req.user.id, id, body.body);
    if (!review) return reply.code(404).send({ error: "not_found" });
    return { review };
  });

  app.post("/shops/reviews/:id/report", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    reportReviewSchema.parse(req.body);
    const review = await opts.shops.reportReview(id);
    if (!review) return reply.code(404).send({ error: "not_found" });
    return { review };
  });

  app.post("/shops/reviews/:id/appeal", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const review = await opts.shops.appealReview(req.user.id, id);
    if (!review) return reply.code(404).send({ error: "not_found" });
    return { review };
  });

  app.post("/shops/:id/reviews/recompute", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const shop = await opts.shops.recomputeReviewAggregates(id);
    if (!shop) return reply.code(404).send({ error: "not_found" });
    return { shop };
  });

  app.post("/shops/:id/services", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const service = await opts.booking.createShopService(req.user.id, id, shopServiceInputSchema.parse(req.body));
    if (!service) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ service });
  });

  app.get("/shops/:id/services", async (req) => {
    const { id } = idParamSchema.parse(req.params);
    return { services: await opts.booking.listShopServices(id) };
  });

  app.post("/shops/:id/availability/rules", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const rule = await opts.booking.addAvailabilityRule(req.user.id, id, availabilityRuleInputSchema.parse(req.body));
    if (!rule) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ rule });
  });

  app.post("/shops/:id/availability/exceptions", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const exception = await opts.booking.addAvailabilityException(
      req.user.id,
      id,
      availabilityExceptionInputSchema.parse(req.body),
    );
    if (!exception) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ exception });
  });

  app.post("/shops/bookings/reminders/run", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return opts.booking.sendDueReminders();
  });

  app.post("/shops/bookings", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    try {
      const result = await opts.booking.requestBooking(req.user.id, bookingRequestSchema.parse(req.body));
      if ("error" in result) return reply.code(400).send({ error: result.error });
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof BookingConflictError) return reply.code(409).send({ error: "booking_conflict" });
      throw err;
    }
  });

  for (const action of ["confirm", "complete", "cancel", "no-show"] as const) {
    app.post(`/shops/bookings/:id/${action}`, async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      const { id } = idParamSchema.parse(req.params);
      const booking =
        action === "confirm"
          ? await opts.booking.confirmBooking(req.user.id, id)
          : action === "complete"
            ? await opts.booking.completeBooking(req.user.id, id)
            : action === "cancel"
              ? await opts.booking.cancelBooking(req.user.id, id)
              : await opts.booking.markNoShow(req.user.id, id);
      if (!booking) return reply.code(404).send({ error: "not_found" });
      return { booking };
    });
  }
};
