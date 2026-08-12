import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  discussionThreadInputSchema,
  podcastCommentInputSchema,
  podcastEpisodeInputSchema,
  podcastReadyInputSchema,
  podcastShowInputSchema,
  PodcastService,
} from "../services/podcast-service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const episodeParamSchema = z.object({ episodeId: z.string().uuid() });
const episodeListQuerySchema = z.object({ showId: z.string().uuid().optional() });

export const podcastRoutes: FastifyPluginAsync<{ podcasts: PodcastService }> = async (app, opts) => {
  const podcasts = opts.podcasts;

  app.get("/podcasts/shows", async () => ({ shows: await podcasts.listShows() }));

  app.post("/podcasts/shows", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = podcastShowInputSchema.parse(req.body);
    const show = await podcasts.createShow(req.user.id, body);
    return reply.code(201).send({ show });
  });

  app.get("/podcasts/shows/:id", async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const show = await podcasts.getShow(id);
    if (!show) return reply.code(404).send({ error: "not_found" });
    return { show };
  });

  app.get("/podcasts/episodes", async (req) => {
    const query = episodeListQuerySchema.parse(req.query);
    return { episodes: await podcasts.listEpisodes(query.showId) };
  });

  app.post("/podcasts/episodes/upload-session", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "unauthorized" });
      const body = podcastEpisodeInputSchema.parse(req.body);
      const session = await podcasts.createEpisodeUploadSession(req.user.id, body);
      if (!session) return reply.code(404).send({ error: "not_found" });
      return reply.code(201).send(session);
    },
  });

  app.post("/podcasts/episodes/:id/ready", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const body = podcastReadyInputSchema.parse(req.body ?? {});
    const result = await podcasts.markEpisodeReady(req.user.id, id, body);
    if (!result) return reply.code(404).send({ error: "not_found" });
    return result;
  });

  app.get("/podcasts/episodes/:id", async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const episode = await podcasts.getEpisode(id);
    if (!episode) return reply.code(404).send({ error: "not_found" });
    return episode;
  });

  app.get("/podcasts/episodes/:episodeId/comments", async (req) => {
    const { episodeId } = episodeParamSchema.parse(req.params);
    return { comments: await podcasts.listComments(episodeId) };
  });

  app.post("/podcasts/episodes/:episodeId/comments", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { episodeId } = episodeParamSchema.parse(req.params);
    const body = podcastCommentInputSchema.parse(req.body);
    const comment = await podcasts.addComment(req.user.id, episodeId, body);
    if (!comment) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ comment });
  });

  app.get("/podcasts/episodes/:episodeId/threads", async (req) => {
    const { episodeId } = episodeParamSchema.parse(req.params);
    return { threads: await podcasts.listThreads(episodeId) };
  });

  app.post("/podcasts/episodes/:episodeId/threads", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { episodeId } = episodeParamSchema.parse(req.params);
    const body = discussionThreadInputSchema.parse(req.body);
    const thread = await podcasts.createThread(req.user.id, episodeId, body);
    if (!thread) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ thread });
  });
};
