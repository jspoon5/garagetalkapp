import {
  boolean,
  id,
  index,
  integer,
  jsonb,
  pgTable,
  softDelete,
  text,
  timestamp,
  timestamps,
  uuid,
} from "./common.js";
import { users } from "./identity.js";

export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    fuelType: text("fuel_type").notNull(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    year: integer("year").notNull(),
    trim: text("trim"),
    vin: text("vin"),
    vinDecoded: jsonb("vin_decoded").$type<Record<string, unknown>>(),
    nickname: text("nickname"),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    photos: text("photos").array().notNull().default([]),
    privacy: text("privacy").notNull().default("private"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("vehicles_user_idx").on(t.userId), index("vehicles_vin_idx").on(t.vin)],
);

export const serviceRecords = pgTable(
  "service_records",
  {
    id: id(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    mileage: integer("mileage"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    work: text("work"),
    notes: text("notes"),
    parts: jsonb("parts").$type<unknown[]>().default([]),
    costCents: integer("cost_cents"),
    receiptMedia: text("receipt_media").array().notNull().default([]),
    sharedFields: text("shared_fields").array().notNull().default([]),
    attestedByShopId: uuid("attested_by_shop_id"),
    attestation: jsonb("attestation").$type<{
      signedAt: string;
      sig: string;
      payloadHash: string;
    } | null>(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("service_records_vehicle_idx").on(t.vehicleId)],
);

export const maintenanceReminders = pgTable(
  "maintenance_reminders",
  {
    id: id(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    intervalMonths: integer("interval_months"),
    intervalMiles: integer("interval_miles"),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }),
    nextDueMiles: integer("next_due_miles"),
    ...timestamps,
  },
  (t) => [index("maintenance_reminders_vehicle_idx").on(t.vehicleId)],
);

export const recalls = pgTable("recalls", {
  id: id(),
  campaignId: text("campaign_id").notNull().unique(),
  make: text("make"),
  model: text("model"),
  year: integer("year"),
  summary: text("summary"),
  raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
  ...timestamps,
});

export const recallChecks = pgTable(
  "recall_checks",
  {
    id: id(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    campaignIds: text("campaign_ids").array().notNull().default([]),
    ...timestamps,
  },
  (t) => [index("recall_checks_vehicle_idx").on(t.vehicleId)],
);
