import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { Database } from "@garagetalk/db";
import { AuthService } from "./services/auth-service.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { sessionPlugin } from "./plugins/session.js";
import { buildLogger } from "./logger.js";
import { registerRouteCollector } from "./routes-manifest.js";

export type BuildAppOptions = {
  db: Database;
  trustedOrigins: string[];
  ready?: () => Promise<boolean>;
};

export async function buildApp(opts: BuildAppOptions) {
  const app = Fastify({
    loggerInstance: buildLogger(),
    trustProxy: true,
  });

  registerRouteCollector(app as never);

  await app.register(cookie);
  await app.register(cors, {
    origin: opts.trustedOrigins,
    credentials: true,
  });
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });

  const auth = new AuthService(opts.db);
  await app.register(sessionPlugin, { auth });
  await app.register(healthRoutes, {
    ready: opts.ready ?? (async () => true),
  });
  await app.register(authRoutes, { auth });

  app.setErrorHandler((err, req, reply) => {
    const error = err as Error & { name?: string };
    if (error.name === "ZodError") {
      return reply.code(400).send({ error: "validation_error", details: error });
    }
    req.log.error({ err: error }, "unhandled");
    return reply.code(500).send({ error: "internal_error" });
  });

  await app.ready();
  return app;
}
