import type { FastifyInstance, RouteOptions } from "fastify";

export type RouteManifestEntry = {
  method: string;
  url: string;
  auth: "public" | "session" | "admin";
  rateLimit: string | null;
  csrf: "required" | "pending" | "n/a";
};

const SESSION_PREFIXES = [
  "/auth/me",
  "/auth/profile",
  "/auth/logout-everywhere",
  "/auth/delete-account",
  "/auth/export",
  "/auth/verify-email",
  "/auth/password-reset",
  "/auth/passkey",
  "/garage",
  "/me/location-pin",
  "/podcasts",
  "/rooms",
  "/ai",
  "/videos",
  "/uploads",
  "/live",
  "/billing/portal",
  "/billing/checkout",
  "/billing/entitlement",
  "/billing/connect",
  "/billing/tips",
  "/wallet",
  "/coins/checkout",
  "/creators",
  "/gifts",
  "/feed",
  "/marketplace",
  "/admin",
];

const PUBLIC_AUTH = new Set([
  "/auth/register",
  "/auth/login",
  "/auth/logout",
  "/auth/passkey/login/options",
  "/auth/passkey/login/verify",
  "/auth/password-reset/request",
  "/auth/password-reset/confirm",
  "/auth/verify-email/confirm",
  "/billing/tiers",
  "/billing/webhooks/stripe",
  "/healthz",
  "/readyz",
]);

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let manifest: RouteManifestEntry[] = [];

function classifyAuth(url: string): RouteManifestEntry["auth"] {
  if (url.startsWith("/admin")) return "admin";
  if (PUBLIC_AUTH.has(url)) return "public";
  if (SESSION_PREFIXES.some((p) => url === p || url.startsWith(p))) return "session";
  if (url.startsWith("/auth/")) return "session";
  return "public";
}

export function registerRouteCollector(app: FastifyInstance): void {
  const entries: RouteManifestEntry[] = [];
  app.addHook("onRoute", (route: RouteOptions) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (!method || method === "HEAD" || method === "OPTIONS") continue;
      const url = route.url;
      const auth = classifyAuth(url);
      const rl =
        route.config && typeof route.config === "object" && "rateLimit" in route.config
          ? JSON.stringify(route.config.rateLimit)
          : url.startsWith("/auth/register") || url.startsWith("/auth/login")
            ? "10/min"
            : "global 300/min";
      const csrf = MUTATION_METHODS.has(String(method))
        ? url.startsWith("/webhooks/") || url.startsWith("/billing/webhooks/")
          ? "n/a"
          : "required"
        : "n/a";
      entries.push({
        method: String(method),
        url,
        auth,
        rateLimit: rl,
        csrf,
      });
    }
  });
  app.addHook("onReady", async () => {
    manifest = entries.slice().sort((a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method));
  });
}

export function getRouteManifest(): RouteManifestEntry[] {
  return manifest;
}

export function resetRouteManifestForTests(): void {
  manifest = [];
}
