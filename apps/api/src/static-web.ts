import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

/** Serve the Vite PWA build from apps/web/dist (same-origin with the API). */
export async function registerWebStatic(app: FastifyInstance): Promise<boolean> {
  const webDist =
    process.env.WEB_DIST_PATH ?? path.resolve(process.cwd(), "apps/web/dist");
  if (!fs.existsSync(path.join(webDist, "index.html"))) {
    app.log.warn({ webDist }, "web dist missing; API-only mode");
    return false;
  }

  await app.register(fastifyStatic, {
    root: webDist,
    wildcard: false,
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" || req.method === "HEAD") {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "not_found" });
  });

  app.log.info({ webDist }, "serving web SPA");
  return true;
}
