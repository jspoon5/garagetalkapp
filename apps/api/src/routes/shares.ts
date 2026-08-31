import type { FastifyPluginAsync } from "fastify";
import { createShareSchema, type ShareService } from "../services/share-service.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ogHtml(preview: {
  title: string;
  description: string;
  url: string;
  image: string;
  siteName: string;
  appPath?: string;
}): string {
  const appBase = process.env.APP_BASE_URL?.replace(/\/$/, "") || "https://app.garagetalk.app";
  const redirect = preview.appPath ? `${appBase}${preview.appPath}` : appBase;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(preview.title)}</title>
  <meta name="description" content="${escapeHtml(preview.description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeHtml(preview.siteName)}" />
  <meta property="og:title" content="${escapeHtml(preview.title)}" />
  <meta property="og:description" content="${escapeHtml(preview.description)}" />
  <meta property="og:url" content="${escapeHtml(preview.url)}" />
  <meta property="og:image" content="${escapeHtml(preview.image)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(preview.title)}" />
  <meta name="twitter:description" content="${escapeHtml(preview.description)}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(redirect)}" />
  <link rel="canonical" href="${escapeHtml(preview.url)}" />
</head>
<body>
  <p><a href="${escapeHtml(redirect)}">Open in GarageTalk</a></p>
</body>
</html>`;
}

export const shareRoutes: FastifyPluginAsync<{ shares: ShareService }> = async (app, opts) => {
  const shares = opts.shares;

  app.post("/shares", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = createShareSchema.parse(req.body);
    const result = await shares.createShare(req.user.id, body);
    return result;
  });

  app.get("/shares/suggestions", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return { suggestions: await shares.suggestions(req.user.id) };
  });

  app.get("/s/:type/:id", async (req, reply) => {
    const params = req.params as { type: string; id: string };
    const preview = await shares.preview(params.type, params.id);
    if (!preview) return reply.code(404).send({ error: "not_found" });

    const accept = String(req.headers.accept ?? "");
    if (accept.includes("application/json") && !accept.includes("text/html")) {
      return preview;
    }

    reply.type("text/html").send(ogHtml(preview));
  });
};
