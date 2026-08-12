import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getRouteManifest } from "../apps/api/src/routes-manifest.js";

/** Offline dump helper for CI/audit — prefer live dump after app.ready(). */
function main() {
  const outDir = path.resolve("audit/cycle-1");
  mkdirSync(outDir, { recursive: true });
  const manifest = getRouteManifest();
  const fallback = [
    { method: "GET", url: "/healthz", auth: "public", rateLimit: "global 300/min" },
    { method: "GET", url: "/readyz", auth: "public", rateLimit: "global 300/min" },
    { method: "POST", url: "/auth/register", auth: "public", rateLimit: "10/min" },
    { method: "POST", url: "/auth/login", auth: "public", rateLimit: "10/min" },
    { method: "POST", url: "/auth/logout", auth: "public", rateLimit: "global 300/min" },
    { method: "POST", url: "/auth/logout-everywhere", auth: "session", rateLimit: "global 300/min" },
    { method: "GET", url: "/auth/me", auth: "session", rateLimit: "global 300/min" },
    { method: "PATCH", url: "/auth/profile", auth: "session", rateLimit: "global 300/min" },
    { method: "POST", url: "/auth/delete-account", auth: "session", rateLimit: "global 300/min" },
    { method: "GET", url: "/auth/export", auth: "session", rateLimit: "global 300/min" },
  ];
  const data = manifest.length > 0 ? manifest : fallback;
  writeFileSync(path.join(outDir, "routes-manifest.json"), JSON.stringify(data, null, 2) + "\n");
  console.log(`Wrote ${data.length} routes`);
}

main();
