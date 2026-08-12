import {
  id,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  timestamps,
  uniqueIndex,
  uuid,
} from "./common.js";
import { users } from "./identity.js";
import { vehicles } from "./garage.js";
import { bookings, shops } from "./commerce.js";

export const diagnosticSessions = pgTable(
  "diagnostic_sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("open"),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().default({}),
    hypotheses: jsonb("hypotheses").$type<unknown[]>().default([]),
    safetyFlags: text("safety_flags").array().notNull().default([]),
    modelMeta: jsonb("model_meta").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [index("diagnostic_sessions_user_idx").on(t.userId)],
);

export const repairBriefs = pgTable(
  "repair_briefs",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => diagnosticSessions.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    shareToken: text("share_token").notNull(),
    pdfMedia: text("pdf_media"),
    ...timestamps,
  },
  (t) => [uniqueIndex("repair_briefs_share_token_uidx").on(t.shareToken)],
);

export const quoteRequests = pgTable("quote_requests", {
  id: id(),
  briefId: uuid("brief_id")
    .notNull()
    .references(() => repairBriefs.id, { onDelete: "cascade" }),
  cityArea: text("city_area").notNull(),
  radiusMiles: integer("radius_miles").notNull().default(25),
  status: text("status").notNull().default("open"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const quotes = pgTable("quotes", {
  id: id(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => quoteRequests.id, { onDelete: "cascade" }),
  shopId: uuid("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  lowCents: integer("low_cents").notNull(),
  highCents: integer("high_cents").notNull(),
  notes: text("notes"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("offered"),
  ...timestamps,
});

export const faultOutcomes = pgTable("fault_outcomes", {
  id: id(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => diagnosticSessions.id, { onDelete: "cascade" }),
  bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "set null" }),
  verifiedFix: text("verified_fix").notNull(),
  parts: jsonb("parts").$type<unknown[]>().default([]),
  attestation: jsonb("attestation").$type<{
    signedAt: string;
    sig: string;
    payloadHash: string;
  }>(),
  ...timestamps,
});

export const obdDevices = pgTable("obd_devices", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fingerprint: text("fingerprint").notNull(),
  protocol: text("protocol"),
  lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
  ...timestamps,
});
