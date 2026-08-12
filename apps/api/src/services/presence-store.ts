import { Redis } from "ioredis";

export type PresenceUser = { userId: string; count: number };

export type PresenceStore = {
  connect(roomId: string, userId: string): Promise<void>;
  disconnect(roomId: string, userId: string): Promise<void>;
  list(roomId: string): Promise<PresenceUser[]>;
  close(): Promise<void>;
};

const DISCONNECT_GRACE_MS = 5_000;

function keyFor(roomId: string, userId: string): string {
  return `${roomId}:${userId}`;
}

export class InMemoryPresenceStore implements PresenceStore {
  private readonly rooms = new Map<string, Map<string, number>>();
  private readonly pendingDisconnects = new Map<string, NodeJS.Timeout>();

  async connect(roomId: string, userId: string): Promise<void> {
    const pendingKey = keyFor(roomId, userId);
    const pending = this.pendingDisconnects.get(pendingKey);
    if (pending) {
      clearTimeout(pending);
      this.pendingDisconnects.delete(pendingKey);
      return;
    }
    const room = this.rooms.get(roomId) ?? new Map<string, number>();
    room.set(userId, (room.get(userId) ?? 0) + 1);
    this.rooms.set(roomId, room);
  }

  async disconnect(roomId: string, userId: string): Promise<void> {
    const pendingKey = keyFor(roomId, userId);
    if (this.pendingDisconnects.has(pendingKey)) return;
    const timer = setTimeout(() => {
      const room = this.rooms.get(roomId);
      const next = Math.max((room?.get(userId) ?? 1) - 1, 0);
      if (next === 0) room?.delete(userId);
      else room?.set(userId, next);
      if (room?.size === 0) this.rooms.delete(roomId);
      this.pendingDisconnects.delete(pendingKey);
    }, DISCONNECT_GRACE_MS);
    this.pendingDisconnects.set(pendingKey, timer);
  }

  async list(roomId: string): Promise<PresenceUser[]> {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.entries()).map(([userId, count]) => ({ userId, count }));
  }

  async close(): Promise<void> {
    for (const timer of this.pendingDisconnects.values()) clearTimeout(timer);
    this.pendingDisconnects.clear();
    this.rooms.clear();
  }
}

class RedisPresenceStore implements PresenceStore {
  private readonly redis: Redis;
  private readonly pendingDisconnects = new Map<string, NodeJS.Timeout>();

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  async connect(roomId: string, userId: string): Promise<void> {
    const pendingKey = keyFor(roomId, userId);
    const pending = this.pendingDisconnects.get(pendingKey);
    if (pending) {
      clearTimeout(pending);
      this.pendingDisconnects.delete(pendingKey);
      return;
    }
    await this.ensureConnected();
    await this.redis.hincrby(this.roomKey(roomId), userId, 1);
  }

  async disconnect(roomId: string, userId: string): Promise<void> {
    const pendingKey = keyFor(roomId, userId);
    if (this.pendingDisconnects.has(pendingKey)) return;
    const timer = setTimeout(() => {
      void this.decrement(roomId, userId);
    }, DISCONNECT_GRACE_MS);
    this.pendingDisconnects.set(pendingKey, timer);
  }

  async list(roomId: string): Promise<PresenceUser[]> {
    await this.ensureConnected();
    const counts = await this.redis.hgetall(this.roomKey(roomId));
    return Object.entries(counts)
      .map(([userId, count]) => ({ userId, count: Number(count) }))
      .filter((entry) => entry.count > 0);
  }

  async close(): Promise<void> {
    for (const timer of this.pendingDisconnects.values()) clearTimeout(timer);
    this.pendingDisconnects.clear();
    this.redis.disconnect();
  }

  private async decrement(roomId: string, userId: string): Promise<void> {
    await this.ensureConnected();
    const count = await this.redis.hincrby(this.roomKey(roomId), userId, -1);
    if (count <= 0) await this.redis.hdel(this.roomKey(roomId), userId);
    this.pendingDisconnects.delete(keyFor(roomId, userId));
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.status === "wait") await this.redis.connect();
  }

  private roomKey(roomId: string): string {
    return `gt:presence:${roomId}`;
  }
}

export function createPresenceStore(redisUrl = process.env.REDIS_URL): PresenceStore {
  return redisUrl ? new RedisPresenceStore(redisUrl) : new InMemoryPresenceStore();
}
