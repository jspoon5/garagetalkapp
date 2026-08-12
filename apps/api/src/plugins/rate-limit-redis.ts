import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { Redis } from "ioredis";

type LimitCategory = "global" | "auth" | "ai" | "uploads" | "search";
type RateLimitConfig = { max: number; windowMs: number };
type RouteRateLimitConfig = { max?: number; timeWindow?: string | number };
type RateLimitCheck = { allowed: boolean; remaining: number; resetAt: number };

export const SECURITY_RATE_LIMITS: Record<LimitCategory, RateLimitConfig> = {
  global: { max: 300, windowMs: 60_000 },
  auth: { max: 10, windowMs: 60_000 },
  ai: { max: 20, windowMs: 60_000 },
  uploads: { max: 30, windowMs: 60_000 },
  search: { max: 60, windowMs: 60_000 },
};

type Bucket = { count: number; resetAt: number };

export class InMemoryTokenBuckets {
  private readonly buckets = new Map<string, Bucket>();

  check(key: string, limit: RateLimitConfig, now = Date.now()): RateLimitCheck {
    const existing = this.buckets.get(key);
    const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + limit.windowMs };
    bucket.count += 1;
    this.buckets.set(key, bucket);
    return {
      allowed: bucket.count <= limit.max,
      remaining: Math.max(limit.max - bucket.count, 0),
      resetAt: bucket.resetAt,
    };
  }

  clear(): void {
    this.buckets.clear();
  }
}

export type RateLimitStore = {
  check(key: string, limit: RateLimitConfig): Promise<RateLimitCheck>;
  close(): Promise<void>;
};

class RedisTokenBucketStore implements RateLimitStore {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  async check(key: string, limit: RateLimitConfig): Promise<RateLimitCheck> {
    if (this.redis.status === "wait") await this.redis.connect();
    const redisKey = `gt:rate:${key}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) await this.redis.pexpire(redisKey, limit.windowMs);
    const ttl = await this.redis.pttl(redisKey);
    const resetAt = Date.now() + Math.max(ttl, 0);
    return { allowed: count <= limit.max, remaining: Math.max(limit.max - count, 0), resetAt };
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }
}

class MemoryRateLimitStore implements RateLimitStore {
  constructor(private readonly buckets = new InMemoryTokenBuckets()) {}

  async check(key: string, limit: RateLimitConfig): Promise<RateLimitCheck> {
    return this.buckets.check(key, limit);
  }

  async close(): Promise<void> {
    this.buckets.clear();
  }
}

function parseWindow(input: string | number | undefined, fallback: number): number {
  if (typeof input === "number") return input;
  if (!input) return fallback;
  const match = /^(\d+)\s*(ms|millisecond|milliseconds|second|seconds|minute|minutes)$/i.exec(input);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  if (unit.startsWith("ms") || unit.startsWith("millisecond")) return amount;
  if (unit.startsWith("second")) return amount * 1000;
  return amount * 60_000;
}

function categoryForUrl(url: string): LimitCategory {
  if (url.startsWith("/auth/")) return "auth";
  if (url.startsWith("/ai/")) return "ai";
  if (url.startsWith("/uploads") || url.includes("upload-session")) return "uploads";
  if (url.startsWith("/search")) return "search";
  return "global";
}

function routeLimit(req: FastifyRequest): { category: LimitCategory; limit: RateLimitConfig } {
  const url = req.routeOptions.url ?? req.url;
  const category = categoryForUrl(url);
  const baseline = SECURITY_RATE_LIMITS[category];
  const config = req.routeOptions.config as { rateLimit?: RouteRateLimitConfig } | undefined;
  const routeConfig = config?.rateLimit;
  return {
    category,
    limit: {
      max: routeConfig?.max ?? baseline.max,
      windowMs: parseWindow(routeConfig?.timeWindow, baseline.windowMs),
    },
  };
}

function clientKey(req: FastifyRequest, category: LimitCategory): string {
  const userId = req.user?.id;
  return `${category}:${userId ?? req.ip}`;
}

export function createRateLimitStore(redisUrl = process.env.REDIS_URL): RateLimitStore {
  return redisUrl ? new RedisTokenBucketStore(redisUrl) : new MemoryRateLimitStore();
}

const plugin: FastifyPluginAsync<{ store?: RateLimitStore }> = async (app, opts) => {
  const store = opts.store ?? createRateLimitStore();
  app.addHook("preHandler", async (req, reply) => {
    const { category, limit } = routeLimit(req);
    const result = await store.check(clientKey(req, category), limit);
    reply.header("x-ratelimit-limit", String(limit.max));
    reply.header("x-ratelimit-remaining", String(result.remaining));
    reply.header("x-ratelimit-reset", new Date(result.resetAt).toISOString());
    if (!result.allowed) {
      return reply.code(429).send({ error: "rate_limited" });
    }
    return undefined;
  });
  app.addHook("onClose", async () => {
    await store.close();
  });
};

export const rateLimitRedisPlugin = fp(plugin, { name: "gt-rate-limit-redis" });
