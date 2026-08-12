import { and, asc, desc, eq, isNull, lt } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { chatRooms, messages, roomMembers } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

const ROOM_KINDS = ["topic", "spatial", "pit_crew", "class"] as const;

export const mapPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().min(1).max(120),
});

export const roomInputSchema = z.object({
  title: z.string().min(1).max(160),
  kind: z.enum(ROOM_KINDS).optional(),
  mapPoint: mapPointSchema.nullable().optional(),
});

export const roomListQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const messageInputSchema = z.object({
  body: z.string().min(1).max(4000),
  media: z.array(z.string().url()).max(10).optional(),
  replyToId: z.string().uuid().nullable().optional(),
});

export const historyQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type RoomMessageInput = z.infer<typeof messageInputSchema>;
export type RoomInput = z.infer<typeof roomInputSchema>;

export class RoomService {
  constructor(private readonly db: Database) {}

  async create(ownerId: string, input: RoomInput) {
    const parsed = roomInputSchema.parse(input);
    const [room] = await this.db
      .insert(chatRooms)
      .values({
        id: uuidv7(),
        ownerId,
        title: parsed.title,
        kind: parsed.kind ?? "topic",
        mapPoint: parsed.mapPoint ?? null,
      })
      .returning();
    if (!room) throw new Error("failed_to_create_room");
    await this.join(ownerId, room.id, "owner");
    return room;
  }

  list() {
    return this.db
      .select()
      .from(chatRooms)
      .where(isNull(chatRooms.deletedAt))
      .orderBy(desc(chatRooms.createdAt));
  }

  listSpatial() {
    return this.db
      .select()
      .from(chatRooms)
      .where(and(eq(chatRooms.kind, "spatial"), isNull(chatRooms.deletedAt)))
      .orderBy(desc(chatRooms.createdAt));
  }

  get(roomId: string) {
    return this.db
      .select()
      .from(chatRooms)
      .where(and(eq(chatRooms.id, roomId), isNull(chatRooms.deletedAt)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async update(ownerId: string, roomId: string, input: Partial<RoomInput>) {
    const parsed = roomInputSchema.partial().parse(input);
    const [room] = await this.db
      .update(chatRooms)
      .set({ ...parsed, updatedAt: new Date() })
      .where(and(eq(chatRooms.id, roomId), eq(chatRooms.ownerId, ownerId), isNull(chatRooms.deletedAt)))
      .returning();
    return room ?? null;
  }

  async softDelete(ownerId: string, roomId: string) {
    const [room] = await this.db
      .update(chatRooms)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(chatRooms.id, roomId), eq(chatRooms.ownerId, ownerId), isNull(chatRooms.deletedAt)))
      .returning();
    return room ?? null;
  }

  async join(userId: string, roomId: string, role = "member") {
    if (!(await this.get(roomId))) return null;
    const [member] = await this.db
      .insert(roomMembers)
      .values({ id: uuidv7(), userId, roomId, role })
      .onConflictDoUpdate({
        target: [roomMembers.roomId, roomMembers.userId],
        set: { updatedAt: new Date() },
      })
      .returning();
    return member ?? null;
  }

  async addMessage(userId: string, roomId: string, input: RoomMessageInput) {
    const parsed = messageInputSchema.parse(input);
    if (!(await this.join(userId, roomId))) return null;
    const [message] = await this.db
      .insert(messages)
      .values({
        id: uuidv7(),
        roomId,
        authorId: userId,
        body: parsed.body,
        media: parsed.media ?? [],
        replyToId: parsed.replyToId ?? null,
      })
      .returning();
    return message ?? null;
  }

  async history(roomId: string, query: z.infer<typeof historyQuerySchema>) {
    const parsed = historyQuerySchema.parse(query);
    const before = parsed.before ? new Date(parsed.before) : null;
    const where = before
      ? and(eq(messages.roomId, roomId), isNull(messages.deletedAt), lt(messages.createdAt, before))
      : and(eq(messages.roomId, roomId), isNull(messages.deletedAt));
    const rows = await this.db
      .select()
      .from(messages)
      .where(where)
      .orderBy(desc(messages.createdAt))
      .limit(parsed.limit);
    return rows.reverse();
  }

  async firstMessages(roomId: string, limit = 20) {
    return this.db
      .select()
      .from(messages)
      .where(and(eq(messages.roomId, roomId), isNull(messages.deletedAt)))
      .orderBy(asc(messages.createdAt))
      .limit(limit);
  }
}
