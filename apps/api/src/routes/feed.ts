import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  feedCommentInputSchema,
  feedPostInputSchema,
  feedReactionInputSchema,
  feedReportInputSchema,
  type FeedService,
} from "../services/feed-service.js";

const idParamsSchema = z.object({ id: z.string().uuid() });
const shareInputSchema = z.object({ body: z.string().max(1_000).default("") });

export const feedRoutes: FastifyPluginAsync<{ feed: FeedService }> = async (app, opts) => {
  const feed = opts.feed;

  app.get("/feed", async (req) => {
    return { posts: await feed.listFeed(req.user?.id ?? null) };
  });

  app.post("/feed/follows/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamsSchema.parse(req.params);
    const ok = await feed.follow(req.user.id, id);
    return reply.code(ok ? 201 : 400).send({ ok });
  });

  app.post("/feed/posts", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const post = await feed.createPost(req.user.id, feedPostInputSchema.parse(req.body));
    return reply.code(201).send({ post });
  });

  app.post("/feed/posts/:id/reactions", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamsSchema.parse(req.params);
    const reaction = await feed.react(req.user.id, id, feedReactionInputSchema.parse(req.body));
    return reply.code(201).send({ reaction });
  });

  app.get("/feed/posts/:id/comments", async (req) => {
    const { id } = idParamsSchema.parse(req.params);
    return { comments: await feed.listComments(id) };
  });

  app.post("/feed/posts/:id/comments", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamsSchema.parse(req.params);
    const comment = await feed.comment(req.user.id, id, feedCommentInputSchema.parse(req.body));
    return reply.code(201).send({ comment });
  });

  app.post("/feed/posts/:id/share", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamsSchema.parse(req.params);
    const { body } = shareInputSchema.parse(req.body ?? {});
    const post = await feed.share(req.user.id, id, body);
    if (!post) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ post });
  });

  app.post("/feed/posts/:id/reports", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamsSchema.parse(req.params);
    const report = await feed.report(req.user.id, id, feedReportInputSchema.parse(req.body));
    return reply.code(201).send({ report });
  });
};
