import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { AuthService } from "../services/auth-service.js";

const registerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(10).max(128),
});

const loginSchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(1),
});

const profileSchema = z.object({
  bio: z.string().max(500).nullable().optional(),
  cityText: z.string().max(120).nullable().optional(),
  avatarType: z.enum(["color", "image", "animated"]).optional(),
  avatarValue: z.string().max(500).optional(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
});

const SESSION_COOKIE = "gt_session";

export const authRoutes: FastifyPluginAsync<{ auth: AuthService }> = async (app, opts) => {
  const auth = opts.auth;

  app.post("/auth/register", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const body = registerSchema.parse(req.body);
      try {
        const result = await auth.register(body);
        reply.setCookie(SESSION_COOKIE, result.sessionToken, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: 7 * 24 * 60 * 60,
        });
        return { user: result.user };
      } catch (err) {
        req.log.warn({ err: String(err) }, "register failed");
        return reply.code(409).send({ error: "could_not_register" });
      }
    },
  });

  app.post("/auth/login", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const body = loginSchema.parse(req.body);
      const result = await auth.login({
        ...body,
        userAgent: req.headers["user-agent"],
        ip: req.ip,
      });
      if (!result) {
        return reply.code(401).send({ error: "invalid_credentials" });
      }
      reply.setCookie(SESSION_COOKIE, result.sessionToken, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60,
      });
      return { user: result.user };
    },
  });

  app.post("/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await auth.logout(token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.post("/auth/logout-everywhere", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    await auth.logoutEverywhere(user.id);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/auth/me", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return { user: req.user };
  });

  app.patch("/auth/profile", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = profileSchema.parse(req.body ?? {});
    const user = await auth.updateProfile(req.user.id, body);
    if (!user) return reply.code(404).send({ error: "not_found" });
    return { user };
  });

  app.post("/auth/delete-account", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    await auth.softDeleteAccount(req.user.id);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/auth/export", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const data = await auth.exportUserData(req.user.id);
    return data;
  });
};

export { SESSION_COOKIE };
