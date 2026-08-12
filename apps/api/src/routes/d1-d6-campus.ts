import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  campusHotspotsWithBadges,
  contentPresenceSchema,
  type CampusHotspot,
  type PresenceLayerService,
} from "../services/d1-d2-presence-campus-service.js";
import {
  courseInputSchema,
  questInputSchema,
  schoolInputSchema,
  syncedPlaybackPositions,
  type CampusLearningService,
} from "../services/d3-d6-campus-service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const nodeParamSchema = z.object({ pathId: z.string().uuid(), nodeId: z.string().uuid() });
const presenceParamSchema = contentPresenceSchema;

export const d1D6Routes: FastifyPluginAsync<{
  presence: PresenceLayerService;
  campus: CampusLearningService;
}> = async (app, opts) => {
  app.get("/presence/content/:contentType/:contentId", async (req) => {
    return opts.presence.snapshot(presenceParamSchema.parse(req.params));
  });

  app.post("/presence/content/:contentType/:contentId/enter", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return opts.presence.enter(presenceParamSchema.parse(req.params), req.user.id);
  });

  app.post("/presence/content/:contentType/:contentId/reactions", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = z.object({ kind: z.string().min(1).max(32) }).parse(req.body);
    return opts.presence.react(presenceParamSchema.parse(req.params), body.kind);
  });

  app.post("/presence/content/:contentType/:contentId/chat", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = z.object({ body: z.string().min(1).max(500) }).parse(req.body);
    return opts.presence.chat(presenceParamSchema.parse(req.params), req.user.id, body.body);
  });

  app.post("/campus-lite/badges", async (req) => {
    const body = z.object({
      hotspots: z.array(z.object({
        id: z.string(),
        label: z.string(),
        href: z.string(),
        activityCount: z.number().int().min(0),
      })),
    }).parse(req.body);
    return { hotspots: campusHotspotsWithBadges(body.hotspots as CampusHotspot[]) };
  });

  app.get("/skill-paths/recommendations", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return { nextLesson: await opts.campus.nextLesson(req.user.id) };
  });

  app.post("/skill-paths/:pathId/nodes/:nodeId/complete", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const params = nodeParamSchema.parse(req.params);
    const result = await opts.campus.completePathNode(req.user.id, params.pathId, params.nodeId);
    if (!result) return reply.code(404).send({ error: "not_found" });
    return result;
  });

  app.get("/videos/:id/learn-this", async (req) => {
    const { id } = idParamSchema.parse(req.params);
    return { lessons: await opts.campus.learnThis(id) };
  });

  app.post("/quests", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return reply.code(201).send({ quest: await opts.campus.createQuest(req.user.id, questInputSchema.parse(req.body)) });
  });

  app.post("/quests/:id/submissions", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const body = z.object({
      acks: z.record(z.boolean()).default({}),
      evidenceMedia: z.array(z.string()).default([]),
    }).parse(req.body);
    const result = await opts.campus.submitQuest(id, req.user.id, body.acks, body.evidenceMedia);
    if ("error" in result) return reply.code(result.error === "not_found" ? 404 : 409).send(result);
    return reply.code(201).send(result);
  });

  app.post("/quest-submissions/:id/review", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    return { submission: await opts.campus.acceptSubmission(id, req.user.id) };
  });

  app.post("/schools", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    return reply.code(201).send({ school: await opts.campus.createSchool(req.user.id, schoolInputSchema.parse(req.body)) });
  });

  app.post("/schools/:id/courses", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const body = z.object({
      title: z.string().min(1),
      priceCents: z.number().int().min(0).nullable().optional(),
    }).parse(req.body);
    return reply.code(201).send({
      course: await opts.campus.createCourse(req.user.id, courseInputSchema.parse({ ...body, schoolId: id })),
    });
  });

  app.get("/courses/:id/access", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    return await opts.campus.hasCourseAccess(req.user.id, id);
  });

  app.post("/courses/:id/purchase", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    return { purchase: await opts.campus.purchaseCourse(req.user.id, id) };
  });

  app.post("/schools/:id/membership/renewal", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    return { ledger: await opts.campus.renewMembership(id, req.user.id) };
  });

  app.post("/pit-crews", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const body = z.object({ name: z.string().min(1) }).parse(req.body);
    return reply.code(201).send({ crew: await opts.campus.createCrew(req.user.id, body.name) });
  });

  app.post("/pit-crews/:id/join", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    return { member: await opts.campus.joinCrew(id, req.user.id) };
  });

  app.post("/pit-crews/:id/streak", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = idParamSchema.parse(req.params);
    const body = z.object({ at: z.string().datetime(), timezone: z.string().min(1) }).parse(req.body);
    return { member: await opts.campus.recordLearningStreak(id, req.user.id, new Date(body.at), body.timezone) };
  });

  app.post("/watch-parties/sync-preview", async (req) => {
    const body = z.object({
      hostPositionSeconds: z.number(),
      hostNowMs: z.number(),
      clientClockOffsetsMs: z.array(z.number()),
    }).parse(req.body);
    return {
      positions: syncedPlaybackPositions(body.hostPositionSeconds, body.hostNowMs, body.clientClockOffsetsMs),
    };
  });
};
