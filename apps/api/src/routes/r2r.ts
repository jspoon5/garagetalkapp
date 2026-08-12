import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAdmin } from "./admin-gate.js";
import type { AdminService } from "../services/admin-service.js";
import { articleInputSchema, articleSearchSchema, type R2RService } from "../services/r2r-service.js";

const slugParamSchema = z.object({ slug: z.string().min(3).max(160) });

export const r2rRoutes: FastifyPluginAsync<{ r2r: R2RService; admin: AdminService }> = async (
  app,
  opts,
) => {
  app.get("/r2r/articles", async (req) => ({
    articles: await opts.r2r.search(articleSearchSchema.parse(req.query)),
  }));

  app.get("/r2r/corpus/:slug", async (req, reply) => {
    const { slug } = slugParamSchema.parse(req.params);
    const corpus = await opts.r2r.loadCorpusBySlug(slug);
    if (!corpus) return reply.code(404).send({ error: "not_found" });
    return { corpus };
  });

  app.post("/admin/r2r/articles", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, opts.admin);
    if (!adminId) return;
    const article = await opts.r2r.createArticle(adminId, articleInputSchema.parse(req.body));
    return reply.code(201).send({ article });
  });

  app.patch("/admin/r2r/articles/:slug", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, opts.admin);
    if (!adminId) return;
    const { slug } = slugParamSchema.parse(req.params);
    const article = await opts.r2r.updateArticle(slug, articleInputSchema.partial().parse(req.body));
    if (!article) return reply.code(404).send({ error: "not_found" });
    return { article };
  });

  app.delete("/admin/r2r/articles/:slug", async (req, reply) => {
    const adminId = await requireAdmin(req, reply, opts.admin);
    if (!adminId) return;
    const { slug } = slugParamSchema.parse(req.params);
    const article = await opts.r2r.deleteArticle(slug);
    if (!article) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });
};
