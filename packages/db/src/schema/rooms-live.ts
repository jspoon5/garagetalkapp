import {
  id,
  index,
  jsonb,
  liveKindEnum,
  liveRoleEnum,
  pgTable,
  roomKindEnum,
  softDelete,
  text,
  timestamp,
  timestamps,
  uuid,
} from "./common.js";
import { users } from "./identity.js";

export const chatRooms = pgTable(
  "chat_rooms",
  {
    id: id(),
    kind: roomKindEnum("kind").notNull().default("topic"),
    title: text("title").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    mapPoint: jsonb("map_point").$type<{ lat: number; lng: number; label: string } | null>(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("chat_rooms_kind_idx").on(t.kind)],
);

export const roomMembers = pgTable(
  "room_members",
  {
    id: id(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    ...timestamps,
  },
  (t) => [index("room_members_room_idx").on(t.roomId)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    media: text("media").array().notNull().default([]),
    replyToId: uuid("reply_to_id"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("messages_room_idx").on(t.roomId)],
);

export const liveSessions = pgTable(
  "live_sessions",
  {
    id: id(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roomName: text("room_name").notNull(),
    kind: liveKindEnum("kind").notNull().default("stream"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    rtmpEnabled: text("rtmp_enabled").notNull().default("false"),
    recordingAssetId: text("recording_asset_id"),
    chapterMarks: jsonb("chapter_marks").$type<unknown[]>().default([]),
    ...timestamps,
  },
  (t) => [index("live_sessions_host_idx").on(t.hostId)],
);

export const liveRoles = pgTable(
  "live_roles",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => liveSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: liveRoleEnum("role").notNull().default("viewer"),
    ...timestamps,
  },
  (t) => [index("live_roles_session_idx").on(t.sessionId)],
);

export const classInteractions = pgTable("class_interactions", {
  id: id(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => liveSessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  ...timestamps,
});
