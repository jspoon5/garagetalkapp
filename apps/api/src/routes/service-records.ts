import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  reminderInputSchema,
  serviceRecordInputSchema,
  type ServiceRecordService,
} from "../services/service-record-service.js";

const vehicleParamSchema = z.object({ vehicleId: z.string().uuid() });
const recordParamSchema = z.object({ vehicleId: z.string().uuid(), recordId: z.string().uuid() });

export const serviceRecordRoutes: FastifyPluginAsync<{ serviceRecords: ServiceRecordService }> = async (
  app,
  opts,
) => {
  app.get("/garage/vehicles/:vehicleId/service-records", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { vehicleId } = vehicleParamSchema.parse(req.params);
    const records = await opts.serviceRecords.listRecords(req.user.id, vehicleId);
    if (!records) return reply.code(404).send({ error: "not_found" });
    return { records };
  });

  app.post("/garage/vehicles/:vehicleId/service-records", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { vehicleId } = vehicleParamSchema.parse(req.params);
    const record = await opts.serviceRecords.createRecord(
      req.user.id,
      vehicleId,
      serviceRecordInputSchema.parse(req.body),
    );
    if (!record) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ record });
  });

  app.patch("/garage/vehicles/:vehicleId/service-records/:recordId", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { vehicleId, recordId } = recordParamSchema.parse(req.params);
    const record = await opts.serviceRecords.updateRecord(
      req.user.id,
      vehicleId,
      recordId,
      serviceRecordInputSchema.partial().parse(req.body),
    );
    if (!record) return reply.code(404).send({ error: "not_found" });
    return { record };
  });

  app.delete("/garage/vehicles/:vehicleId/service-records/:recordId", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { vehicleId, recordId } = recordParamSchema.parse(req.params);
    const record = await opts.serviceRecords.deleteRecord(req.user.id, vehicleId, recordId);
    if (!record) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/garage/vehicles/:vehicleId/service-reminders", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { vehicleId } = vehicleParamSchema.parse(req.params);
    const reminder = await opts.serviceRecords.scheduleReminder(
      req.user.id,
      vehicleId,
      reminderInputSchema.parse(req.body),
    );
    if (!reminder) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ reminder });
  });

  app.get("/garage/vehicles/:vehicleId/service-records/public", async (req) => {
    const { vehicleId } = vehicleParamSchema.parse(req.params);
    return { records: await opts.serviceRecords.publicProvenance(vehicleId) };
  });
};
