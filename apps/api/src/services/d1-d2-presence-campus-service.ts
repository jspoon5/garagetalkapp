import { performance } from "node:perf_hooks";
import { z } from "zod";

export const contentPresenceSchema = z.object({
  contentType: z.enum(["video", "lesson", "live", "shop", "listing"]),
  contentId: z.string().uuid(),
});

export type PresenceLayerUser = { userId: string; avatarLabel: string };
export type CampusHotspot = {
  id: string;
  label: string;
  href: string;
  activityCount: number;
};

type PresenceRoom = {
  users: Map<string, PresenceLayerUser>;
  reactions: Map<string, number>;
  chat: Array<{ userId: string; body: string }>;
};

const DEFAULT_THRESHOLD = 3;

function keyOf(contentType: string, contentId: string): string {
  return `${contentType}:${contentId}`;
}

export function isPresenceLayerVisible(count: number, enabled = true, threshold = DEFAULT_THRESHOLD): boolean {
  return enabled && count >= threshold;
}

export function renderPresenceChips(users: PresenceLayerUser[]) {
  const start = performance.now();
  const chips = users.slice(0, 12).map((user) => ({
    userId: user.userId,
    label: user.avatarLabel.slice(0, 2).toUpperCase(),
  }));
  return { chips, renderMs: performance.now() - start };
}

export function campusHotspotsWithBadges(
  hotspots: CampusHotspot[],
  enabled = true,
  threshold = DEFAULT_THRESHOLD,
): CampusHotspot[] {
  return hotspots.map((spot) => ({
    ...spot,
    activityCount: isPresenceLayerVisible(spot.activityCount, enabled, threshold) ? spot.activityCount : 0,
  }));
}

export class PresenceLayerService {
  private readonly rooms = new Map<string, PresenceRoom>();

  constructor(
    private readonly threshold = DEFAULT_THRESHOLD,
    private readonly enabled = true,
  ) {}

  enter(input: z.infer<typeof contentPresenceSchema>, userId: string) {
    const parsed = contentPresenceSchema.parse(input);
    const room = this.room(parsed.contentType, parsed.contentId);
    room.users.set(userId, { userId, avatarLabel: userId.replace(/-/g, "") });
    return this.snapshot(parsed);
  }

  react(input: z.infer<typeof contentPresenceSchema>, kind: string) {
    const parsed = contentPresenceSchema.parse(input);
    const room = this.room(parsed.contentType, parsed.contentId);
    room.reactions.set(kind, (room.reactions.get(kind) ?? 0) + 1);
    return this.snapshot(parsed);
  }

  chat(input: z.infer<typeof contentPresenceSchema>, userId: string, body: string) {
    const parsed = contentPresenceSchema.parse(input);
    const room = this.room(parsed.contentType, parsed.contentId);
    room.chat.push({ userId, body: body.slice(0, 500) });
    room.chat = room.chat.slice(-25);
    return this.snapshot(parsed);
  }

  snapshot(input: z.infer<typeof contentPresenceSchema>) {
    const parsed = contentPresenceSchema.parse(input);
    const room = this.room(parsed.contentType, parsed.contentId);
    const users = Array.from(room.users.values());
    const visible = isPresenceLayerVisible(users.length, this.enabled, this.threshold);
    return {
      enabled: visible,
      mode: visible ? "presence_layer" : "normal_page",
      threshold: this.threshold,
      concurrent: users.length,
      roomKey: keyOf(parsed.contentType, parsed.contentId),
      avatarChips: visible ? renderPresenceChips(users).chips : [],
      reactions: visible ? Object.fromEntries(room.reactions) : {},
      chat: visible ? room.chat : [],
    };
  }

  private room(contentType: string, contentId: string): PresenceRoom {
    const key = keyOf(contentType, contentId);
    const existing = this.rooms.get(key);
    if (existing) return existing;
    const next = { users: new Map<string, PresenceLayerUser>(), reactions: new Map<string, number>(), chat: [] };
    this.rooms.set(key, next);
    return next;
  }
}
