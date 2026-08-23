import { loadEnv } from "@garagetalk/shared";
import { createDb } from "@garagetalk/db";
import { AuthService } from "./services/auth-service.js";
import { seedHardcodedAmateurTesters, seedTesterProGrant } from "./seed-testers.js";
import { buildApp } from "./app.js";
import {
  createDefaultGearHeadProvider,
  GearHeadService,
} from "./services/gearhead-service.js";
import { EntitlementService } from "./services/entitlement-service.js";

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
      const entitlements = new EntitlementService(db);
      const proGrant = await seedTesterProGrant(db, entitlements);
      app.log.info({ usernames, proGrant }, "seeded tester accounts");
    } catch (err) {
      app.log.error({ err }, "tester seed failed");
    }
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
