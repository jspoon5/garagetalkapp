import Fastify from "fastify";
import { ZodError } from "zod";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { Database } from "@garagetalk/db";
import { MemoryEmailClient, type EmailClient } from "@garagetalk/email";
import { AuthService } from "./services/auth-service.js";
import { GarageService } from "./services/garage-service.js";
import { MediaUploadService } from "./services/media-upload-service.js";
import { VideoService } from "./services/video-service.js";
import {
  MemoryChallengeStore,
  PasskeyService,
  type PasskeyConfig,
  type PasskeyVerifyHooks,
} from "./services/passkey-service.js";
import { authRoutes } from "./routes/auth.js";
import { garageRoutes } from "./routes/garage.js";
import { healthRoutes } from "./routes/health.js";
import { uploadRoutes } from "./routes/uploads.js";
import { videoRoutes } from "./routes/videos.js";
import { streamWebhookRoutes } from "./routes/webhooks-stream.js";
import { emailAuthRoutes, passkeyRoutes } from "./routes/passkeys.js";
import { sessionPlugin } from "./plugins/session.js";
import { csrfPlugin } from "./plugins/csrf.js";
import { buildLogger } from "./logger.js";
import { registerRouteCollector } from "./routes-manifest.js";

export type BuildAppOptions = {
  db: Database;
  trustedOrigins: string[];
  ready?: () => Promise<boolean>;
  emailClient?: EmailClient;
  appBaseUrl?: string;
  passkeyConfig?: PasskeyConfig;
  passkeyVerifyHooks?: PasskeyVerifyHooks;
  video?: VideoService;
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
  await app.register(csrfPlugin, { trustedOrigins: opts.trustedOrigins });

  const emailClient = opts.emailClient ?? new MemoryEmailClient();
  const auth = new AuthService(opts.db, {
    emailClient,
    appBaseUrl: opts.appBaseUrl ?? "http://localhost:5173",
  });
  const garage = new GarageService(opts.db);
  const media = new MediaUploadService(opts.db);
  const video = opts.video ?? new VideoService(opts.db);

  const passkeyConfig = opts.passkeyConfig ?? {
    rpName: "Garage Talk",
    rpID: "localhost",
    origin: opts.trustedOrigins[0] ?? "http://localhost:5173",
  };
  const passkeys = new PasskeyService(
    opts.db,
    auth,
    passkeyConfig,
    new MemoryChallengeStore(),
    opts.passkeyVerifyHooks ?? {},
  );

  await app.register(sessionPlugin, { auth });
  await app.register(healthRoutes, {
    ready: opts.ready ?? (async () => true),
  });
  await app.register(authRoutes, { auth });
  await app.register(emailAuthRoutes, { auth });
  await app.register(passkeyRoutes, { passkeys });
  await app.register(garageRoutes, { garage });
  await app.register(uploadRoutes, { media });
  await app.register(videoRoutes, { video });
  await app.register(streamWebhookRoutes, { video });

  app.setErrorHandler((err, req, reply) => {
    const zodErr = err instanceof ZodError ? err : null;
    const isZod =
      zodErr ??
      (typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as Error).name === "ZodError"
        ? (err as ZodError)
        : null);
    if (isZod) {
      return reply.code(400).send({ error: "validation_error", details: isZod.flatten() });
    }
    const error = err as Error;
    req.log.error({ err: error }, "unhandled");
    return reply.code(500).send({ error: "internal_error" });
  });

  await app.ready();
  return app;
}
