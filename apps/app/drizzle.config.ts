import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

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

loadDotEnvFile();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Add it to your shell or .env file.");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
