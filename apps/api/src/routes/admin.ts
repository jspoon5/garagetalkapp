import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
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

async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
  admin: AdminService,
): Promise<string | null> {
  if (!req.user) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  const token = req.headers["x-admin-totp"];
  const ok = await admin.verifyAdmin(req.user.id, typeof token === "string" ? token : undefined);
  if (!ok) {
    reply.code(403).send({ error: "admin_2fa_required" });
    return null;
  }
  return req.user.id;
}
