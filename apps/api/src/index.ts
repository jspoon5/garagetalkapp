import { loadEnv } from "@garagetalk/shared";
import { createDb } from "@garagetalk/db";
import { AuthService } from "./services/auth-service.js";
import { seedHardcodedAmateurTesters } from "./seed-testers.js";
import { seedAdminFromEnv } from "./seed-admin.js";
import { buildApp } from "./app.js";
import { VideoService } from "./services/video-service.js";
import {
  createDefaultGearHeadProvider,
  GearHeadService,
} from "./services/gearhead-service.js";

async function main() {
  const env = loadEnv(process.env);
  const { db, pool } = createDb(env.DATABASE_URL);
  const appBaseUrl = env.APP_BASE_URL;
  const appHost = new URL(appBaseUrl).hostname;
  const trustedOrigins = env.AUTH_TRUSTED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const gearheadProvider = createDefaultGearHeadProvider(process.env);
  const app = await buildApp({
    db,
    trustedOrigins,
    appBaseUrl,
    serveWeb: true,
    gearhead: new GearHeadService(db, gearheadProvider),
    passkeyConfig: {
      rpName: "Garage Talk",
      rpID: appHost,
      origin: appBaseUrl,
    },
    ready: async () => {
      try {
        await pool.query("select 1");
        return true;
      } catch {
        return false;
      }
    },
  });

  app.log.info(
    { gearheadProvider: env.AI_API_KEY ? "openai-compatible" : "stub" },
    "GearHead provider selected",
  );

  if (process.env.NODE_ENV !== "test") {
    try {
      const auth = new AuthService(db, { appBaseUrl });
      const usernames = await seedHardcodedAmateurTesters(auth);
      app.log.info({ usernames }, "seeded amateur tester accounts");
    } catch (err) {
      app.log.error({ err }, "tester seed failed");
    }

    try {
      const auth = new AuthService(db, { appBaseUrl });
      const adminUsername = await seedAdminFromEnv(auth);
      if (adminUsername) {
        app.log.info({ username: adminUsername }, "seeded admin operator from ADMIN_EMAIL");
      } else {
        app.log.warn("ADMIN_EMAIL/ADMIN_PASSWORD not set — /admin login will not work until configured");
      }
    } catch (err) {
      app.log.error({ err }, "admin seed failed");
    }

    try {
      const video = new VideoService(db);
      const purged = await video.purgeAbandonedUploads(60 * 60 * 1000);
      if (purged.length > 0) {
        app.log.info({ count: purged.length, ids: purged.map((row) => row.id) }, "purged abandoned video uploads");
      }
    } catch (err) {
      app.log.error({ err }, "abandoned video purge failed");
    }
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
