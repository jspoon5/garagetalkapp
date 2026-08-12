import {
  id,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  timestamps,
  uniqueIndex,
  uuid,
} from "./common.js";
import { users } from "./identity.js";

export const reports = pgTable(
  "reports",
  {
    id: id(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("open"),
    ...timestamps,
  },
  (t) => [index("reports_status_idx").on(t.status)],
);

export const moderationActions = pgTable("moderation_actions", {
  id: id(),
  reportId: uuid("report_id").references(() => reports.id, { onDelete: "set null" }),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  notes: text("notes"),
  ...timestamps,
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    subjectType: text("subject_type"),
    subjectId: uuid("subject_id"),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [index("audit_logs_admin_idx").on(t.adminId)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    source: text("source").notNull(),
    eventId: text("event_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("webhook_events_source_event_uidx").on(t.source, t.eventId)],
);

export const events = pgTable(
  "events",
  {
    id: id(),
    name: text("name").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    props: jsonb("props").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [index("events_name_idx").on(t.name)],
);

export const emailSignupLog = pgTable("email_signup_log", {
  id: id(),
  email: text("email").notNull(),
  source: text("source"),
  ...timestamps,
});

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: id(),
    key: text("key").notNull(),
    enabled: text("enabled").notNull().default("false"),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("feature_flags_key_uidx").on(t.key)],
);
