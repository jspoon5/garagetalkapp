import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAdmin } from "./admin-gate.js";
import {
  moderationActionSchema,
  siteSettingSchema,
  suspendUserSchema,
  tierOverrideSchema,
  type AdminService,
} from "../services/admin-service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const keyParamSchema = z.object({ key: z.string().min(1).max(120).regex(/^[a-zA-Z0-9_.:-]+$/) });
const userQuerySchema = z.object({ query: z.string().max(200).optional() });

export const adminRoutes: FastifyPluginAsync<{ admin: AdminService }> = async (app, opts) => {
  const admin = opts.admin;

  app.get("/admin/me", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, admin);
    if (!adminId || !req.user) return;
    return {
      admin: true,
      user: { id: req.user.id, email: req.user.email, username: req.user.username },
    };
  });

  app.get("/admin/users", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, admin);
    if (!adminId) return;
    const query = userQuerySchema.parse(req.query);
    return { users: await admin.lookupUsers(query.query) };
  });

  app.get("/admin/dashboard", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, admin);
    if (!adminId) return;
    return { stats: await admin.getDashboardStats() };
  });

  app.patch("/admin/users/:id/tier", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, admin);
    if (!adminId) return;
    const { id } = idParamSchema.parse(req.params);
    const user = await admin.overrideTier(adminId, id, tierOverrideSchema.parse(req.body));
    if (!user) return reply.code(404).send({ error: "not_found" });
    return { user };
  });

  app.post("/admin/users/:id/suspend", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, admin);
    if (!adminId) return;
    const { id } = idParamSchema.parse(req.params);
    const user = await admin.suspendUser(adminId, id, suspendUserSchema.parse(req.body));
    if (!user) return reply.code(404).send({ error: "not_found" });
    return { user };
  });

  app.delete("/admin/users/:id", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, admin);
    if (!adminId) return;
    const { id } = idParamSchema.parse(req.params);
    const user = await admin.deleteUser(adminId, id);
    if (!user) return reply.code(404).send({ error: "not_found" });
    return { user };
  });

  app.get("/admin/moderation/reports", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, admin);
    if (!adminId) return;
    return { reports: await admin.listReports() };
  });

  app.post("/admin/moderation/reports/:id", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, admin);
    if (!adminId) return;
    const { id } = idParamSchema.parse(req.params);
    const report = await admin.moderateReport(adminId, id, moderationActionSchema.parse(req.body));
    if (!report) return reply.code(404).send({ error: "not_found" });
    return { report };
  });

  app.get("/admin/settings", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, admin);
    if (!adminId) return;
    return { settings: await admin.listSiteSettings() };
  });

  app.put("/admin/settings/:key", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, admin);
    if (!adminId) return;
    const { key } = keyParamSchema.parse(req.params);
    const setting = await admin.updateSiteSetting(adminId, key, siteSettingSchema.parse(req.body));
    return { setting };
  });
};
