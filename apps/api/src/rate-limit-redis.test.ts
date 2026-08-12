import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import {
  InMemoryTokenBuckets,
  rateLimitRedisPlugin,
  type RateLimitStore,
} from "./plugins/rate-limit-redis.js";

describe("rate-limit redis-compatible plugin A5", () => {
  const apps: Array<Awaited<ReturnType<typeof Fastify>>> = [];

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
  });

  it("uses in-process token buckets when Redis is unavailable", async () => {
    const buckets = new InMemoryTokenBuckets();
    const store: RateLimitStore = {
      check: async (key, limit) => buckets.check(key, limit),
      close: async () => buckets.clear(),
    };
    const app = Fastify();
    apps.push(app);
    await app.register(rateLimitRedisPlugin, { store });
    app.get(
      "/limited",
      { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } },
      async () => ({ ok: true }),
    );
    await app.ready();

    expect((await app.inject({ method: "GET", url: "/limited" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/limited" })).statusCode).toBe(200);
    const limited = await app.inject({ method: "GET", url: "/limited" });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toBe("rate_limited");
  });
});
