import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync<{ ready: () => Promise<boolean> }> = async (
  app,
  opts,
) => {
  app.get("/healthz", async () => ({ ok: true }));
  app.get("/readyz", async (_req, reply) => {
    const ok = await opts.ready();
    if (!ok) return reply.code(503).send({ ok: false });
    return { ok: true };
  });
};
