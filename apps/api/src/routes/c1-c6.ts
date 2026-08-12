import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { diagnosticInputSchema } from "../services/c1-c6-diagnostics.js";
import type { C1C6Service } from "../services/c1-c6-service.js";
import { webBluetoothSupport } from "../services/obd-elm327.js";

const idParam = z.object({ id: z.string().uuid() });
const vehicleParam = z.object({ vehicleId: z.string().uuid() });
const sessionParam = z.object({ sessionId: z.string().uuid() });
const tokenParam = z.object({ token: z.string().min(12).max(80) });
const quoteRequestSchema = z.object({
  cityArea: z.string().min(1).max(120),
  radiusMiles: z.number().int().min(1).max(250).default(25),
});
const quoteInputSchema = z.object({
  requestId: z.string().uuid(),
  lowCents: z.number().int().min(0),
  highCents: z.number().int().min(0),
  notes: z.string().max(2000).optional(),
  expiresAt: z.string().datetime(),
});
const bookQuoteSchema = z.object({
  scheduledAt: z.string().datetime(),
  serviceId: z.string().uuid().optional(),
});
const outcomeSchema = z.object({
  verifiedFix: z.string().min(1).max(500),
  parts: z.array(z.unknown()).default([]),
});
const obdDeviceSchema = z.object({
  fingerprint: z.string().min(3).max(160),
  protocol: z.string().max(80).optional(),
});
const obdSnapshotSchema = z.object({
  deviceId: z.string().uuid().optional(),
  snapshot: z.record(z.unknown()),
});

export const c1C6Routes: FastifyPluginAsync<{ trackC: C1C6Service }> = async (app, opts) => {
  app.post("/track-c/recalls/sweep", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return opts.trackC.runRecallSweep();
  });

  app.get("/garage/vehicles/:vehicleId/recall-badge", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { vehicleId } = vehicleParam.parse(req.params);
    const badge = await opts.trackC.recallBadge(req.user.id, vehicleId);
    if (!badge) return reply.code(404).send({ error: "not_found" });
    return badge;
  });

  app.post("/diagnostics/sessions", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const result = await opts.trackC.createDiagnosticSession(req.user.id, diagnosticInputSchema.parse(req.body));
    if (!result) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send(result);
  });

  app.post("/diagnostics/sessions/:sessionId/brief", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { sessionId } = sessionParam.parse(req.params);
    const brief = await opts.trackC.exportBrief(req.user.id, sessionId);
    if (!brief) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ brief });
  });

  app.get("/repair-briefs/share/:token", async (req, reply) => {
    const { token } = tokenParam.parse(req.params);
    const brief = await opts.trackC.getBriefByToken(token);
    if (!brief) return reply.code(404).send({ error: "not_found" });
    return { brief };
  });

  app.post("/repair-briefs/:id/quote-requests", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParam.parse(req.params);
    const body = quoteRequestSchema.parse(req.body);
    const request = await opts.trackC.requestQuotes(req.user.id, id, body.cityArea, body.radiusMiles);
    if (!request) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send(request);
  });

  app.post("/shops/:id/quotes", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParam.parse(req.params);
    const body = quoteInputSchema.parse(req.body);
    const quote = await opts.trackC.submitQuote(req.user.id, body.requestId, id, body);
    if (!quote) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ quote });
  });

  app.post("/quotes/:id/book", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParam.parse(req.params);
    const body = bookQuoteSchema.parse(req.body);
    const result = await opts.trackC.bookQuote(req.user.id, id, body.scheduledAt, body.serviceId);
    if (!result) return reply.code(400).send({ error: "quote_unavailable" });
    return reply.code(201).send(result);
  });

  app.post("/shops/bookings/:id/outcome", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParam.parse(req.params);
    const outcome = await opts.trackC.attestBookingOutcome(req.user.id, id, outcomeSchema.parse(req.body));
    if (!outcome) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ outcome });
  });

  app.post("/obd/devices", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = obdDeviceSchema.parse(req.body);
    return reply.code(201).send({ device: await opts.trackC.rememberObdDevice(req.user.id, body.fingerprint, body.protocol) });
  });

  app.get("/obd/web-bluetooth/support", async (req) => {
    const query = z.object({ userAgent: z.string().optional(), bluetooth: z.coerce.boolean().optional() }).parse(req.query);
    return webBluetoothSupport({ userAgent: query.userAgent, bluetooth: query.bluetooth ? {} : undefined });
  });

  app.post("/diagnostics/sessions/:sessionId/obd-snapshots", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { sessionId } = sessionParam.parse(req.params);
    const body = obdSnapshotSchema.parse(req.body);
    const snapshot = await opts.trackC.streamObdSnapshot(req.user.id, sessionId, body.snapshot, body.deviceId);
    if (!snapshot) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ snapshot });
  });

  app.post("/shops/:id/service-records/:recordId/attest", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const params = z.object({ id: z.string().uuid(), recordId: z.string().uuid() }).parse(req.params);
    const body = z.object({ note: z.string().max(500).default("") }).parse(req.body ?? {});
    const record = await opts.trackC.attestServiceRecord(req.user.id, params.id, params.recordId, body.note);
    if (!record) return reply.code(404).send({ error: "not_found" });
    return { record };
  });

  app.get("/verify/service-records/:id", async (req) => {
    const { id } = idParam.parse(req.params);
    return opts.trackC.verifyServiceRecord(id);
  });

  app.get("/garage/vehicles/:vehicleId/verified-history", async (req) => {
    const { vehicleId } = vehicleParam.parse(req.params);
    return { timeline: await opts.trackC.verifiedHistory(vehicleId) };
  });

  app.get("/marketplace/listings/:id/verified-history", async (req) => {
    const { id } = idParam.parse(req.params);
    return { timeline: await opts.trackC.listingVerifiedHistory(id) };
  });
};
