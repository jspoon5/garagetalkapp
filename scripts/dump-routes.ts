import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildApp } from "../apps/api/src/app.js";
import { getRouteManifest } from "../apps/api/src/routes-manifest.js";
import { createTestDb } from "../apps/api/src/test/pglite.js";

async function main() {
  const outDir = path.resolve(process.argv[2] ?? "audit/cycle-2");
  mkdirSync(outDir, { recursive: true });

  const { client, db } = await createTestDb();
  const app = await buildApp({
    db,
    trustedOrigins: ["http://localhost:5173"],
  });

  const data = getRouteManifest();
  if (data.length === 0) {
    throw new Error("FIX-3: live route manifest empty after app.ready()");
  }
  if (!data.some((r) => r.url.startsWith("/garage"))) {
    throw new Error("FIX-3: garage routes missing from live manifest");
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "fastify onRoute hook at boot",
    count: data.length,
    routes: data,
  };

  writeFileSync(path.join(outDir, "routes-manifest.json"), JSON.stringify(payload, null, 2) + "\n");
  mkdirSync(path.resolve("audit/cycle-1"), { recursive: true });
  writeFileSync(
    path.resolve("audit/cycle-1/routes-manifest.json"),
    JSON.stringify(payload, null, 2) + "\n",
  );
  console.log(`Wrote ${data.length} live routes to ${outDir}/routes-manifest.json`);
  await app.close();
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
