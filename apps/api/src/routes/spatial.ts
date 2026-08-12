import type { FastifyPluginAsync } from "fastify";
import type { RoomService } from "../services/room-service.js";
import { locationPinInputSchema, SpatialService } from "../services/spatial-service.js";

export const spatialRoutes: FastifyPluginAsync<{
  spatial: SpatialService;
  rooms: RoomService;
}> = async (app, opts) => {
  const spatial = opts.spatial;
  const rooms = opts.rooms;

  app.post("/me/location-pin", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = locationPinInputSchema.parse(req.body);
    const pin = await spatial.setLocationPin(req.user.id, body);
    if (!pin) return reply.code(404).send({ error: "not_found" });
    return { pin };
  });

  app.delete("/me/location-pin", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    await spatial.removeLocationPin(req.user.id);
    return { ok: true };
  });

  app.get("/me/location-pin", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return { pin: await spatial.getLocationPin(req.user.id) };
  });

  app.get("/spatial/rooms", async () => ({ rooms: await rooms.listSpatial() }));
};
