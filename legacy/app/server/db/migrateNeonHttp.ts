import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

function loadDotEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    if (!key || process.env[key] !== undefined) continue;

    const value = trimmed.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, "");
    process.env[key] = value;
  }
}

async function main() {
  loadDotEnvFile();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Add it to your shell or .env file.");
  }

  const sql = neon(databaseUrl);
  const db = drizzle({ client: sql });

  await migrate(db, {
    migrationsFolder: "./migrations",
  });

  console.log("✅ Neon HTTP migrations finished successfully.");
}

main().catch((error) => {
  console.error("❌ Neon HTTP migration failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
