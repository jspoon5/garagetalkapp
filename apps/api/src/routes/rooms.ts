import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { PresenceStore } from "../services/presence-store.js";
import {
  historyQuerySchema,
  messageInputSchema,
  roomInputSchema,
  roomListQuerySchema,
  RoomService,
} from "../services/room-service.js";

const roomParamSchema = z.object({ id: z.string().uuid() });
const wsClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    clientId: z.string().min(1).max(120),
    body: z.string().min(1).max(4000),
    media: z.array(z.string().url()).max(10).optional(),
    replyToId: z.string().uuid().nullable().optional(),
  }),
  z.object({ type: z.literal("typing"), isTyping: z.boolean() }),
]);

const OPEN = 1;

type SocketData = { toString(): string };
type RoomSocket = {
  readyState: number;
  send(payload: string): void;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (raw: SocketData) => void): void;
  on(event: "close", listener: () => void): void;
};

function sendJson(socket: RoomSocket, payload: unknown): void {
  if (socket.readyState === OPEN) socket.send(JSON.stringify(payload));
}

export const roomRoutes: FastifyPluginAsync<{
  rooms: RoomService;
  presence: PresenceStore;
}> = async (app, opts) => {
  const rooms = opts.rooms;
  const presence = opts.presence;
  const sockets = new Map<string, Set<RoomSocket>>();

  function broadcast(roomId: string, payload: unknown, except?: RoomSocket): void {
    const roomSockets = sockets.get(roomId);
    if (!roomSockets) return;
    for (const socket of roomSockets) {
      if (socket !== except) sendJson(socket, payload);
    }
  }

  app.get("/rooms", async (req) => {
    roomListQuerySchema.parse(req.query);
    return { rooms: await rooms.list() };
  });

  app.post("/rooms", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = roomInputSchema.parse(req.body);
    const room = await rooms.create(req.user.id, body);
    return reply.code(201).send({ room });
  });

  app.get("/rooms/:id", async (req, reply) => {
    const { id } = roomParamSchema.parse(req.params);
    const room = await rooms.get(id);
    if (!room) return reply.code(404).send({ error: "not_found" });
    return { room };
  });

  app.patch("/rooms/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = roomParamSchema.parse(req.params);
    const room = await rooms.update(req.user.id, id, req.body ?? {});
    if (!room) return reply.code(404).send({ error: "not_found" });
    return { room };
  });

  app.delete("/rooms/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = roomParamSchema.parse(req.params);
    const room = await rooms.softDelete(req.user.id, id);
    if (!room) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/rooms/:id/join", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = roomParamSchema.parse(req.params);
    const member = await rooms.join(req.user.id, id);
    if (!member) return reply.code(404).send({ error: "not_found" });
    return { member };
  });

  app.get("/rooms/:id/messages", async (req) => {
    const { id } = roomParamSchema.parse(req.params);
    const query = historyQuerySchema.parse(req.query);
    return { messages: await rooms.history(id, query) };
  });

  app.post("/rooms/:id/messages", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = roomParamSchema.parse(req.params);
    const body = messageInputSchema.parse(req.body);
    const message = await rooms.addMessage(req.user.id, id, body);
    if (!message) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ message });
  });

  app.get("/rooms/:id/presence", async (req) => {
    const { id } = roomParamSchema.parse(req.params);
    return { users: await presence.list(id) };
  });

  app.get("/rooms/:id/ws", { websocket: true }, (socket, req) => {
    const user = req.user;
    if (!user) {
      socket.close(1008, "unauthorized");
      return;
    }
    const { id } = roomParamSchema.parse(req.params);
    const roomSockets = sockets.get(id) ?? new Set<RoomSocket>();
    roomSockets.add(socket);
    sockets.set(id, roomSockets);

    socket.on("message", (raw: SocketData) => {
      void handleMessage(socket, id, user.id, raw);
    });
    socket.on("close", () => {
      roomSockets.delete(socket);
      if (roomSockets.size === 0) sockets.delete(id);
      void presence.disconnect(id, user.id);
      broadcast(id, { type: "presence", users: [] });
    });

    void presence.connect(id, user.id).then(async () => {
      await rooms.join(user.id, id);
      sendJson(socket, { type: "ready", roomId: id, userId: user.id });
      broadcast(id, { type: "presence", users: await presence.list(id) });
    });
  });

  async function handleMessage(socket: RoomSocket, roomId: string, userId: string, raw: SocketData) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw.toString());
    } catch {
      sendJson(socket, { type: "error", error: "validation_error" });
      return;
    }
    const parsed = wsClientMessageSchema.safeParse(decoded);
    if (!parsed.success) {
      sendJson(socket, { type: "error", error: "validation_error" });
      return;
    }
    if (parsed.data.type === "typing") {
      broadcast(roomId, { type: "typing", userId, isTyping: parsed.data.isTyping }, socket);
      return;
    }
    const message = await rooms.addMessage(userId, roomId, parsed.data);
    if (!message) {
      sendJson(socket, { type: "error", error: "not_found" });
      return;
    }
    sendJson(socket, { type: "ack", clientId: parsed.data.clientId, messageId: message.id });
    broadcast(roomId, { type: "message", message }, socket);
  }
};
