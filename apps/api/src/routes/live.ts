import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { sendGiftInputSchema, type GiftService } from "../services/gift-service.js";
import {
  guestDecisionSchema,
  guestRequestInputSchema,
  liveRoleInputSchema,
  liveSessionInputSchema,
  liveTokenInputSchema,
  recordingEventSchema,
  type LiveService,
} from "../services/live-service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

type LiveSocket = {
  readyState: number;
  send(payload: string): void;
  close(code?: number, reason?: string): void;
  on(event: "message" | "close", listener: (...args: unknown[]) => void): void;
};

const OPEN = 1;

function sendJson(socket: LiveSocket, payload: unknown) {
  if (socket.readyState === OPEN) socket.send(JSON.stringify(payload));
}

export const liveRoutes: FastifyPluginAsync<{ live: LiveService; gifts?: GiftService }> = async (app, opts) => {
  const live = opts.live;
  const gifts = opts.gifts;
  const sessionSockets = new Map<string, Set<LiveSocket>>();

  live.setBroadcaster((sessionId, payload) => {
    const sockets = sessionSockets.get(sessionId);
    if (!sockets) return;
    for (const socket of sockets) sendJson(socket, payload);
  });

  app.get("/live/sessions", async (req) => {
    return { sessions: await live.listSessions(req.user?.id ?? null), livekitUrl: live.liveKitUrl() };
  });

  app.get("/live/sessions/:id", async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const session = await live.getPublicSession(id, req.user?.id ?? null);
    if (!session) return reply.code(404).send({ error: "not_found" });
    return { session, livekitUrl: live.liveKitUrl() };
  });

  app.post("/live/sessions/:id/like", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const result = await live.toggleLike(req.user.id, id);
    if (!result) return reply.code(404).send({ error: "not_found" });
    return result;
  });

  app.post("/live/sessions", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = liveSessionInputSchema.parse(req.body);
    const result = await live.createSession(req.user.id, body);
    if ("error" in result) {
      return reply.code(402).send({ error: "upgrade_required", message: "Live hosting requires a paid tier." });
    }
    return reply.code(201).send(result);
  });

  app.post("/live/sessions/:id/start", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const result = await live.markStarted(id, req.user.id);
    if (!result) return reply.code(403).send({ error: "forbidden" });
    if ("error" in result) {
      return reply.code(402).send({ error: "upgrade_required", message: "Live hosting requires a paid tier." });
    }
    return { session: result };
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
    const result = await live.issueToken(id, req.user.id, body.role, body.clientId);
    if (!result) return reply.code(404).send({ error: "not_found" });
    if ("error" in result) {
      if (result.error === "upgrade_required") {
        return reply.code(402).send({ error: "upgrade_required", message: "Live hosting requires a paid tier." });
      }
      return reply.code(403).send({ error: result.error });
    }
    if (!result.livekitUrl && process.env.NODE_ENV === "production") {
      return reply.code(503).send({
        error: "livekit_not_configured",
        message: "LIVEKIT_URL is not set on the API.",
      });
    }
    return result;
  });

  /** Free / anonymous watch — no auth, viewer-only. */
  app.post("/live/sessions/:id/viewer-token", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const parsed = z
        .object({
          clientId: z.string().min(8).max(64).optional(),
        })
        .safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          message: "clientId must be a string between 8 and 64 characters when provided.",
          details: parsed.error.flatten(),
        });
      }
      const clientId =
        parsed.data.clientId?.trim() ||
        `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      if (clientId.length < 8) {
        return reply.code(400).send({
          error: "invalid_client",
          message: "clientId must be at least 8 characters.",
        });
      }
      try {
        const result = await live.issueAnonymousViewerToken(id, clientId);
        if (!result) return reply.code(404).send({ error: "not_found" });
        if ("error" in result) {
          return reply.code(400).send({ error: result.error });
        }
        if (!result.livekitUrl && process.env.NODE_ENV === "production") {
          return reply.code(503).send({
            error: "livekit_not_configured",
            message: "LIVEKIT_URL is not set on the API.",
          });
        }
        return result;
      } catch (err) {
        req.log.error({ err }, "viewer-token failed");
        return reply.code(500).send({
          error: "viewer_token_failed",
          message: err instanceof Error ? err.message : "viewer_token_failed",
        });
      }
    },
  });

  app.post("/live/sessions/:id/guest-requests", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const body = guestRequestInputSchema.parse(req.body ?? {});
    const result = await live.requestGuest(id, req.user.id, body.message);
    if ("error" in result) return reply.code(400).send({ error: result.error });
    return reply.code(201).send(result);
  });

  app.get("/live/sessions/:id/guest-requests", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const requests = await live.listGuestRequests(id, req.user.id);
    if (!requests) return reply.code(403).send({ error: "forbidden" });
    return { requests };
  });

  app.post("/live/sessions/:id/guest-requests/decide", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const body = guestDecisionSchema.parse(req.body);
    const result = await live.decideGuestRequest(id, req.user.id, body.requestId, body.approve);
    if (!result) return reply.code(403).send({ error: "forbidden" });
    if ("error" in result) return reply.code(409).send({ error: result.error });
    return result;
  });

  app.post("/live/sessions/:id/gifts", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      if (!gifts) return reply.code(503).send({ error: "gifts_unavailable" });
      const { id } = idParamSchema.parse(req.params);
      const body = sendGiftInputSchema.parse(req.body);
      const result = await gifts.sendGift(req.user.id, id, body);
      if ("error" in result) {
        const code = result.error;
        const status = code === "insufficient_coins" ? 402 : code === "self_gifting_not_allowed" ? 400 : 404;
        return reply.code(status).send({ error: code });
      }
      live.broadcast(id, result.event);
      return reply.code(201).send(result);
    },
  });

  app.get("/live/sessions/:id/ws", { websocket: true }, (socket, req) => {
    const user = req.user;
    if (!user) {
      socket.close(1008, "unauthorized");
      return;
    }
    const { id } = idParamSchema.parse(req.params);
    const roomSockets = sessionSockets.get(id) ?? new Set<LiveSocket>();
    roomSockets.add(socket as LiveSocket);
    sessionSockets.set(id, roomSockets);
    sendJson(socket as LiveSocket, { type: "ready", sessionId: id, userId: user.id });
    socket.on("close", () => {
      roomSockets.delete(socket as LiveSocket);
      if (roomSockets.size === 0) sessionSockets.delete(id);
    });
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
