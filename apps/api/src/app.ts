import Fastify from "fastify";
import { ZodError } from "zod";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import websocket from "@fastify/websocket";
import type { Database } from "@garagetalk/db";
import { MemoryEmailClient, type EmailClient } from "@garagetalk/email";
import { AuthService } from "./services/auth-service.js";
import { GarageService } from "./services/garage-service.js";
import { GearHeadService } from "./services/gearhead-service.js";
import { MediaUploadService } from "./services/media-upload-service.js";
import { PodcastService } from "./services/podcast-service.js";
import { createPresenceStore, type PresenceStore } from "./services/presence-store.js";
import { RoomService } from "./services/room-service.js";
import { SpatialService } from "./services/spatial-service.js";
import { VideoService } from "./services/video-service.js";
import {
  MemoryChallengeStore,
  PasskeyService,
  type PasskeyConfig,
  type PasskeyVerifyHooks,
} from "./services/passkey-service.js";
import { authRoutes } from "./routes/auth.js";
import { gearHeadRoutes } from "./routes/gearhead.js";
import { garageRoutes } from "./routes/garage.js";
import { healthRoutes } from "./routes/health.js";
import { podcastRoutes } from "./routes/podcasts.js";
import { roomRoutes } from "./routes/rooms.js";
import { spatialRoutes } from "./routes/spatial.js";
import { uploadRoutes } from "./routes/uploads.js";
import { videoRoutes } from "./routes/videos.js";
import { streamWebhookRoutes } from "./routes/webhooks-stream.js";
import { emailAuthRoutes, passkeyRoutes } from "./routes/passkeys.js";
import { sessionPlugin } from "./plugins/session.js";
import { csrfPlugin } from "./plugins/csrf.js";
import { rateLimitRedisPlugin } from "./plugins/rate-limit-redis.js";
import { buildLogger } from "./logger.js";
import { registerRouteCollector } from "./routes-manifest.js";
import { registerA8A10Routes } from "./register-a8-a10.js";
import { registerB1B2Routes } from "./register-b1-b2.js";
import { registerB3B8Routes } from "./register-b3-b8.js";
import { registerC1C6Routes } from "./register-c1-c6.js";
import type { DiagnosticProvider } from "./services/c1-c6-diagnostics.js";
import type { NhtsaClient } from "./services/nhtsa-service.js";
import { registerD1D11Routes } from "./register-d1-d11.js";

export type BuildAppOptions = {
  db: Database;
  trustedOrigins: string[];
  ready?: () => Promise<boolean>;
  emailClient?: EmailClient;
  appBaseUrl?: string;
  passkeyConfig?: PasskeyConfig;
  passkeyVerifyHooks?: PasskeyVerifyHooks;
  video?: VideoService;
  podcasts?: PodcastService;
  rooms?: RoomService;
  spatial?: SpatialService;
  gearhead?: GearHeadService;
  presence?: PresenceStore;
  trustProxy?: boolean;
  nhtsa?: NhtsaClient;
  diagnosticsProvider?: DiagnosticProvider;
  /** Serve apps/web/dist when present (set true in production entrypoint). */
  serveWeb?: boolean;
};

export async function buildApp(opts: BuildAppOptions) {
  const app = Fastify({
    loggerInstance: buildLogger(),
    trustProxy: opts.trustProxy ?? process.env.NODE_ENV !== "test",
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
  await app.register(websocket);
  await app.register(csrfPlugin, { trustedOrigins: opts.trustedOrigins });

  const emailClient = opts.emailClient ?? new MemoryEmailClient();
  const auth = new AuthService(opts.db, {
    emailClient,
    appBaseUrl: opts.appBaseUrl ?? "http://localhost:5173",
  });
  const garage = new GarageService(opts.db, { nhtsa: opts.nhtsa });
  const media = new MediaUploadService(opts.db);
  const video = opts.video ?? new VideoService(opts.db);
  const podcasts = opts.podcasts ?? new PodcastService(opts.db);
  const rooms = opts.rooms ?? new RoomService(opts.db);
  const spatial = opts.spatial ?? new SpatialService(opts.db);
  const gearhead = opts.gearhead ?? new GearHeadService(opts.db);
  const presence = opts.presence ?? createPresenceStore();

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
  await app.register(rateLimitRedisPlugin);
  await app.register(healthRoutes, {
    ready: opts.ready ?? (async () => true),
  });
  await app.register(authRoutes, { auth });
  await app.register(emailAuthRoutes, { auth });
  await app.register(passkeyRoutes, { passkeys });
  await app.register(garageRoutes, { garage });
  await app.register(uploadRoutes, { media });
  await app.register(videoRoutes, { video });
  await app.register(podcastRoutes, { podcasts });
  await app.register(roomRoutes, { rooms, presence });
  await app.register(spatialRoutes, { spatial, rooms });
  await app.register(gearHeadRoutes, { gearhead });
  await app.register(streamWebhookRoutes, { video });
  app.addHook("onClose", async () => {
    await presence.close();
  });
  await registerA8A10Routes(app as never, {
    db: opts.db,
    emailClient,
    appBaseUrl: opts.appBaseUrl ?? "http://localhost:5173",
  });
  await registerB1B2Routes(app as never, opts.db);
  await registerB3B8Routes(app as never, { db: opts.db, emailClient });
  await registerC1C6Routes(app as never, {
    db: opts.db,
    emailClient,
    nhtsa: opts.nhtsa,
    diagnostics: opts.diagnosticsProvider,
  });
  await registerD1D11Routes(app as never, opts.db);

  if (opts.serveWeb) {
    const { registerWebStatic } = await import("./static-web.js");
    await registerWebStatic(app);
  }

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
