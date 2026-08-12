import type { FastifyInstance } from "fastify";

export type RouteManifestEntry = {
  method: string;
  url: string;
  auth: "public" | "session" | "admin";
  rateLimit: string | null;
};

const SESSION_PATHS = new Set([
  "/auth/me",
  "/auth/profile",
  "/auth/logout-everywhere",
  "/auth/delete-account",
  "/auth/export",
]);

let manifest: RouteManifestEntry[] = [];

export function registerRouteCollector(app: FastifyInstance): void {
  const entries: RouteManifestEntry[] = [];
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method === "HEAD" || method === "OPTIONS") continue;
      const url = route.url;
      let auth: RouteManifestEntry["auth"] = "public";
      if (url.startsWith("/admin")) auth = "admin";
      else if (SESSION_PATHS.has(url)) auth = "session";

      const rl =
        route.config && typeof route.config === "object" && "rateLimit" in route.config
          ? JSON.stringify(route.config.rateLimit)
          : "global 300/min";

      entries.push({ method: String(method), url, auth, rateLimit: rl });
    }
  });
  app.addHook("onReady", async () => {
    manifest = entries;
  });
}

export function getRouteManifest(): RouteManifestEntry[] {
  return manifest;
}
