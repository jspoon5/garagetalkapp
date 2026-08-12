import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { AuthService, PublicUser } from "../services/auth-service.js";
import { SESSION_COOKIE } from "../routes/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    user: PublicUser | null;
  }
}

function readSessionToken(req: FastifyRequest): string | undefined {
  const fromCookie = req.cookies?.[SESSION_COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.headers.cookie;
  if (!header) return undefined;
  const raw = Array.isArray(header) ? header.join(";") : header;
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=");
  }
  return undefined;
}

const plugin: FastifyPluginAsync<{ auth: AuthService }> = async (app, opts) => {
  app.decorateRequest("user", undefined as unknown as PublicUser | null);
  app.addHook("preHandler", async (req) => {
    const token = readSessionToken(req);
    req.user = token ? await opts.auth.getUserBySession(token) : null;
  });
};

export const sessionPlugin = fp(plugin, { name: "gt-session" });
