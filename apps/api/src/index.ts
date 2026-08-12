import { loadEnv } from "@garagetalk/shared";
import { createDb } from "@garagetalk/db";
import { buildApp } from "./app.js";

async function main() {
  const env = loadEnv(process.env);
  const { db, pool } = createDb(env.DATABASE_URL);
  const app = await buildApp({
    db,
    trustedOrigins: env.AUTH_TRUSTED_ORIGINS.split(",").map((s) => s.trim()),
    ready: async () => {
      try {
        await pool.query("select 1");
        return true;
      } catch {
        return false;
      }
    },
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
