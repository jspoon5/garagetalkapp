import type { FastifyPluginAsync } from "fastify";
import { vehicleInputSchema } from "../services/garage-service.js";
import type { GarageService } from "../services/garage-service.js";
import { z } from "zod";

export const garageRoutes: FastifyPluginAsync<{ garage: GarageService }> = async (app, opts) => {
  const garage = opts.garage;

  app.get("/garage/vehicles", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return { vehicles: await garage.list(req.user.id) };
  });

  app.get("/garage/vehicles/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const vehicle = await garage.get(req.user.id, id);
    if (!vehicle) return reply.code(404).send({ error: "not_found" });
    return { vehicle };
  });

  app.post("/garage/vehicles", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = vehicleInputSchema.parse(req.body);
    const vehicle = await garage.create(req.user.id, body);
    return reply.code(201).send({ vehicle });
  });

  app.patch("/garage/vehicles/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const body = vehicleInputSchema.partial().parse(req.body ?? {});
    const vehicle = await garage.update(req.user.id, id, body);
    if (!vehicle) return reply.code(404).send({ error: "not_found" });
    return { vehicle };
  });

  app.delete("/garage/vehicles/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const vehicle = await garage.softDelete(req.user.id, id);
    if (!vehicle) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/garage/vehicles/reorder", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = z.object({ vehicleIds: z.array(z.string().uuid()) }).parse(req.body);
    const ok = await garage.reorder(req.user.id, body.vehicleIds);
    if (!ok) return reply.code(400).send({ error: "invalid_order" });
    return { ok: true };
  });
};
