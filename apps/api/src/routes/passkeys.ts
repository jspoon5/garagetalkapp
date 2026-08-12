import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { PasskeyService } from "../services/passkey-service.js";
import { SESSION_COOKIE } from "./auth.js";

const confirmEmailSchema = z.object({ token: z.string().min(1) });
const passwordResetRequestSchema = z.object({ email: z.string().email() });
const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(10).max(128),
});

export const passkeyRoutes: FastifyPluginAsync<{ passkeys: PasskeyService }> = async (
  app,
  opts,
) => {
  const passkeys = opts.passkeys;

  app.post("/auth/passkey/register/options", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const options = await passkeys.registrationOptions(
      req.user.id,
      req.user.username,
      req.user.email,
    );
    return { options };
  });

  app.post("/auth/passkey/register/verify", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    try {
      await passkeys.verifyRegistration(req.user.id, req.body);
      return { ok: true };
    } catch {
      return reply.code(400).send({ error: "passkey_registration_failed" });
    }
  });

  app.post("/auth/passkey/login/options", async (_req, _reply) => {
    const options = await passkeys.loginOptions();
    return { options };
  });

  app.post("/auth/passkey/login/verify", async (req, reply) => {
    try {
      const result = await passkeys.verifyLogin(req.body, req.headers["user-agent"], req.ip);
      reply.setCookie(SESSION_COOKIE, result.sessionToken, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60,
      });
      return { ok: true };
    } catch {
      return reply.code(401).send({ error: "passkey_login_failed" });
    }
  });
};

export const emailAuthRoutes: FastifyPluginAsync<{
  auth: import("../services/auth-service.js").AuthService;
}> = async (app, opts) => {
  const auth = opts.auth;

  app.post("/auth/verify-email/request", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    await auth.requestEmailVerification(req.user.id);
    return { ok: true };
  });

  app.post("/auth/verify-email/confirm", async (req, reply) => {
    const body = confirmEmailSchema.parse(req.body);
    const user = await auth.confirmEmailVerification(body.token);
    if (!user) return reply.code(400).send({ error: "invalid_token" });
    return { user };
  });

  app.post("/auth/password-reset/request", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, _reply) => {
      const body = passwordResetRequestSchema.parse(req.body);
      await auth.requestPasswordReset(body.email);
      return { ok: true };
    },
  });

  app.post("/auth/password-reset/confirm", async (req, reply) => {
    const body = passwordResetConfirmSchema.parse(req.body);
    const ok = await auth.confirmPasswordReset(body.token, body.password);
    if (!ok) return reply.code(400).send({ error: "invalid_token" });
    return { ok: true };
  });
};
