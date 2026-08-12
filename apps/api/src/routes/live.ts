import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  liveRoleInputSchema,
  liveSessionInputSchema,
  liveTokenInputSchema,
  recordingEventSchema,
  type LiveService,
} from "../services/live-service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

export const liveRoutes: FastifyPluginAsync<{ live: LiveService }> = async (app, opts) => {
  const live = opts.live;

  app.post("/live/sessions", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = liveSessionInputSchema.parse(req.body);
    const result = await live.createSession(req.user.id, body);
    return reply.code(201).send(result);
  });

  app.get("/live/sessions/:id/rtmp", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const rtmp = await live.getRtmpConfig(id, req.user.id);
    if (!rtmp) return reply.code(403).send({ error: "forbidden" });
    return { rtmp };
  });

  app.post("/live/sessions/:id/roles", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const body = liveRoleInputSchema.parse(req.body);
    const role = await live.assignRole(id, req.user.id, body.userId, body.role);
    if (!role) return reply.code(403).send({ error: "forbidden" });
    return { role };
  });

  app.post("/live/sessions/:id/token", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const body = liveTokenInputSchema.parse(req.body ?? {});
    const result = await live.issueToken(id, req.user.id, body.role);
    if (!result) return reply.code(404).send({ error: "not_found" });
    if ("error" in result) return reply.code(403).send({ error: result.error });
    return result;
  });

  app.post("/live/sessions/:id/reminders", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const rtmp = await live.getRtmpConfig(id, req.user.id);
    if (!rtmp) return reply.code(403).send({ error: "forbidden" });
    return { sent: await live.sendReminder(id) };
  });

  app.post("/live/sessions/:id/recording/start", async (req, reply) => {
    return handleRecording(req, reply, "start", live);
  });

  app.post("/live/sessions/:id/recording/egress-complete", async (req, reply) => {
    return handleRecording(req, reply, "egress_complete", live);
  });

  app.post("/live/sessions/:id/recording/upload-complete", async (req, reply) => {
    return handleRecording(req, reply, "upload_complete", live);
  });

  app.post("/live/sessions/:id/recording/fail", async (req, reply) => {
    return handleRecording(req, reply, "fail", live);
  });
};

async function handleRecording(
  req: FastifyRequest,
  reply: FastifyReply,
  event: "start" | "egress_complete" | "upload_complete" | "fail",
  live: LiveService,
) {
  if (!req.user) return reply.code(401).send({ error: "unauthorized" });
  const { id } = idParamSchema.parse(req.params);
  const body = recordingEventSchema.parse(req.body ?? {});
  const result = await live.transitionRecording(id, req.user.id, event, body);
  if (!result) return reply.code(403).send({ error: "forbidden" });
  if ("error" in result) return reply.code(409).send({ error: result.error, state: result.state });
  return result;
}
