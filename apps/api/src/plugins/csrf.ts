import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const plugin: FastifyPluginAsync<{ trustedOrigins: string[] }> = async (app, opts) => {
  app.addHook("preHandler", async (req, reply) => {
    if (!MUTATION_METHODS.has(req.method)) return;
    const path = req.url.split("?")[0] ?? req.url;
    if (path.startsWith("/webhooks/")) return;
    if (path.startsWith("/billing/webhooks/")) return;
    if (process.env.NODE_ENV === "test") return;

    const origin = req.headers.origin;
    if (origin && opts.trustedOrigins.includes(origin)) return;

    const secFetchSite = req.headers["sec-fetch-site"];
    if (secFetchSite === "same-origin" || secFetchSite === "same-site") return;

    return reply.code(403).send({ error: "csrf_failed" });
  });
};

export const csrfPlugin = fp(plugin, { name: "gt-csrf" });
