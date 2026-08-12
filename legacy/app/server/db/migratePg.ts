import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createPgPool } from "./pool";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const pool = createPgPool(databaseUrl);
  const db = drizzle(pool);

  // On Render, cwd is apps/app (rootDir). Locally the same when run from apps/app.
  const migrationsFolder = path.resolve(process.cwd(), "migrations");
  console.log(`[migrate] applying migrations from ${migrationsFolder}`);

  try {
    await migrate(db, { migrationsFolder });
    console.log("[migrate] complete");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
