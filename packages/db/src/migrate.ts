import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

type Journal = {
  entries: Array<{ tag: string }>;
};

function assertSqlFilesAreJournaled(migrationsFolder: string) {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as Journal;
  const journaled = new Set(journal.entries.map((e) => e.tag));
  const sqlFiles = fs
    .readdirSync(migrationsFolder)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.replace(/\.sql$/, ""));
  const orphans = sqlFiles.filter((tag) => !journaled.has(tag));
  if (orphans.length > 0) {
    throw new Error(
      `[migrate] SQL migration(s) missing from meta/_journal.json: ${orphans.join(", ")}. ` +
        "Drizzle will silently skip unlisted files.",
    );
  }
  console.log(`[migrate] journal entries=${journal.entries.length} sqlFiles=${sqlFiles.length}`);
}

async function main() {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool);
  const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
  console.log(`[migrate] ${migrationsFolder}`);
  assertSqlFilesAreJournaled(migrationsFolder);
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log("[migrate] complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
