import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  chapterForSeek,
  corpusInputSchema,
  heartbeatInputSchema,
  type TrackDIntegrityService,
} from "../services/d7-d11-integrity-service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

export const d7D11Routes: FastifyPluginAsync<{ integrity: TrackDIntegrityService }> = async (
  app,
  opts,
) => {
  app.get("/live/classes/:id/permissions", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const query = z.object({ action: z.string().min(1) }).parse(req.query);
    return opts.integrity.assertClassPermission(id, req.user.id, query.action);
  });

  app.post("/live/classes/:id/replay-chapters", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const body = z.object({
      chapters: z.array(z.object({ title: z.string(), startsAt: z.number().min(0) })),
    }).parse(req.body);
    const session = await opts.integrity.addReplayChapters(id, req.user.id, body.chapters);
    if (!session) return reply.code(403).send({ error: "forbidden" });
    return { session };
  });

  app.post("/live/classes/replay/seek", async (req) => {
    const body = z.object({
      seconds: z.number().min(0),
      chapters: z.array(z.object({ title: z.string(), startsAt: z.number().min(0) })),
    }).parse(req.body);
    return { chapter: chapterForSeek(body.chapters, body.seconds) };
  });

  app.post("/ai/foreman/corpus", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return { corpus: await opts.integrity.seedCorpus(corpusInputSchema.parse(req.body)) };
  });

  app.post("/ai/foreman", async (req) => {
    const body = z.object({ message: z.string().min(1) }).parse(req.body);
    return opts.integrity.askForeman(body.message);
  });

  app.post("/proof/badges/:id/share", async (req) => {
    const { id } = idParamSchema.parse(req.params);
    const body = z.object({ slug: z.string().min(3) }).parse(req.body);
    return opts.integrity.shareBadge(id, body.slug);
  });

  app.post("/avatars/items/:id/unlock", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const body = z.object({ sourceType: z.string().min(1), sourceId: z.string().uuid().optional() }).parse(req.body);
    return { unlock: await opts.integrity.grantAvatarUnlock(req.user.id, id, body.sourceType, body.sourceId) };
  });

  app.post("/earnings/heartbeats", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return { view: await opts.integrity.recordHeartbeat(req.user.id, heartbeatInputSchema.parse(req.body)) };
  });

  app.get("/earnings/payout-preview", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return opts.integrity.payoutPreview(req.user.id);
  });

  app.get("/earnings/dashboard-d11", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return { dashboard: await opts.integrity.dashboard(req.user.id) };
  });

  app.get("/admin/reconciliation/:id", async (req) => {
    const { id } = idParamSchema.parse(req.params);
    return { report: await opts.integrity.reconciliationReport(id) };
  });
};
