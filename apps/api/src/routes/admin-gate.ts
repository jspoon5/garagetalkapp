import type { FastifyReply, FastifyRequest } from "fastify";
import type { AdminService } from "../services/admin-service.js";

export async function requireAdmin(
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
