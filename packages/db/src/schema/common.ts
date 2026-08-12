import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  jsonb,
  numeric,
  uniqueIndex,
  index,
  primaryKey,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

export const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export const subscriptionTierEnum = pgEnum("subscription_tier", [
  "amateur",
  "gearhead",
  "racing_pro",
  "pro",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "canceled",
  "past_due",
  "trialing",
]);

export const avatarTypeEnum = pgEnum("avatar_type", ["color", "image", "animated"]);

export const authTokenTypeEnum = pgEnum("auth_token_type", [
  "verify_email",
  "password_reset",
  "stream_webhook",
]);

export const roomKindEnum = pgEnum("room_kind", ["topic", "spatial", "pit_crew", "class"]);

export const listingKindEnum = pgEnum("listing_kind", [
  "part",
  "vehicle",
  "tool",
  "accessory",
  "service",
]);

export const orderStateEnum = pgEnum("order_state", [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "disputed",
  "refunded",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "requested",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

export const hazardClassEnum = pgEnum("hazard_class", [
  "none",
  "caution",
  "restricted_demo_only",
]);

export const questSubmissionStatusEnum = pgEnum("quest_submission_status", [
  "submitted",
  "in_review",
  "accepted",
  "changes_requested",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "unclaimed",
  "pending",
  "verified",
  "rejected",
]);

export const ledgerEntryTypeEnum = pgEnum("ledger_entry_type", [
  "tip",
  "membership",
  "course_sale",
  "view_payout",
  "adjustment",
]);

export const lessonKindEnum = pgEnum("lesson_kind", ["video", "text", "quiz"]);

export const liveKindEnum = pgEnum("live_kind", ["stream", "class", "office_hours"]);

export const liveRoleEnum = pgEnum("live_role", ["host", "mod", "viewer"]);

export { sql, uuidv7, pgTable, text, timestamp, uuid, boolean, integer, jsonb, numeric, uniqueIndex, index, primaryKey, foreignKey };
