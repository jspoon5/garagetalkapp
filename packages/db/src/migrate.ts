import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

async function main() {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool);
  const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
  console.log(`[migrate] ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log("[migrate] complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
