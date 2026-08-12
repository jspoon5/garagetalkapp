/**
 * E2E API entry — boots Fastify against in-process PGlite (no Docker Postgres).
 */
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

async function main() {
  process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
  const { db } = await createTestDb();
  const origins = (process.env.AUTH_TRUSTED_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map((s) => s.trim());
  const app = await buildApp({
    db,
    trustedOrigins: origins,
    appBaseUrl: process.env.APP_BASE_URL ?? "http://127.0.0.1:5173",
  });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`e2e api listening on ${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
