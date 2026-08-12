import {
  boolean,
  bookingStatusEnum,
  id,
  index,
  integer,
  jsonb,
  ledgerEntryTypeEnum,
  listingKindEnum,
  orderStateEnum,
  pgTable,
  softDelete,
  subscriptionStatusEnum,
  subscriptionTierEnum,
  text,
  timestamp,
  timestamps,
  uniqueIndex,
  uuid,
  verificationStatusEnum,
} from "./common.js";
import { users } from "./identity.js";
import { vehicles } from "./garage.js";

export const subscriptionTierDefs = pgTable("subscription_tiers", {
  id: id(),
  slug: subscriptionTierEnum("slug").notNull().unique(),
  name: text("name").notNull(),
  aiSearches: integer("ai_searches").notNull(),
  liveFeatures: boolean("live_features").notNull().default(false),
  listingSlots: integer("listing_slots").notNull().default(0),
  ...timestamps,
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: subscriptionTierEnum("tier").notNull(),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("subscriptions_user_idx").on(t.userId)],
);

export const tips = pgTable("tips", {
  id: id(),
  fromUserId: uuid("from_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  toUserId: uuid("to_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subjectType: text("subject_type"),
  subjectId: uuid("subject_id"),
  amountCents: integer("amount_cents").notNull(),
  applicationFeeCents: integer("application_fee_cents").notNull().default(0),
  stripePaymentIntent: text("stripe_payment_intent"),
  ...timestamps,
});

export const shops = pgTable(
  "shops",
  {
    id: id(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    about: text("about"),
    address: jsonb("address").$type<Record<string, unknown>>().default({}),
    serviceArea: text("service_area"),
    specialties: text("specialties").array().notNull().default([]),
    credentialsMedia: text("credentials_media").array().notNull().default([]),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("unclaimed"),
    veteranOwnedStatus: verificationStatusEnum("veteran_owned_status")
      .notNull()
      .default("unclaimed"),
    disabledOwnedStatus: verificationStatusEnum("disabled_owned_status")
      .notNull()
      .default("unclaimed"),
    stripeConnectAccountId: text("stripe_connect_account_id"),
    chargesEnabled: boolean("charges_enabled").notNull().default(false),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex("shops_slug_uidx").on(t.slug)],
);

export const listings = pgTable(
  "listings",
  {
    id: id(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "set null" }),
    kind: listingKindEnum("kind").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    condition: text("condition"),
    photos: text("photos").array().notNull().default([]),
    fitment: jsonb("fitment").$type<Record<string, unknown>>().default({}),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("listings_seller_idx").on(t.sellerId)],
);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    feeCents: integer("fee_cents").notNull().default(0),
    stripePaymentIntent: text("stripe_payment_intent"),
    state: orderStateEnum("state").notNull().default("pending"),
    shipping: jsonb("shipping").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [index("orders_buyer_idx").on(t.buyerId)],
);

export const creatorLedgers = pgTable(
  "creator_ledgers",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryType: ledgerEntryTypeEnum("entry_type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    subjectType: text("subject_type"),
    subjectId: uuid("subject_id"),
    balanceAfter: integer("balance_after").notNull(),
    ...timestamps,
  },
  (t) => [index("creator_ledgers_user_idx").on(t.userId)],
);

export const shopServices = pgTable("shop_services", {
  id: id(),
  shopId: uuid("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  durationMin: integer("duration_min").notNull(),
  priceBandLowCents: integer("price_band_low_cents"),
  priceBandHighCents: integer("price_band_high_cents"),
  ...timestamps,
});

export const availabilityRules = pgTable("availability_rules", {
  id: id(),
  shopId: uuid("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  openTime: text("open_time").notNull(),
  closeTime: text("close_time").notNull(),
  capacity: integer("capacity").notNull().default(1),
  ...timestamps,
});

export const availabilityExceptions = pgTable("availability_exceptions", {
  id: id(),
  shopId: uuid("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  date: timestamp("date", { withTimezone: true }).notNull(),
  closed: boolean("closed").notNull().default(false),
  openTime: text("open_time"),
  closeTime: text("close_time"),
  capacity: integer("capacity"),
  ...timestamps,
});

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => shopServices.id, { onDelete: "set null" }),
    quoteId: uuid("quote_id"),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: bookingStatusEnum("status").notNull().default("requested"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("bookings_shop_idx").on(t.shopId),
    uniqueIndex("bookings_shop_slot_uidx").on(t.shopId, t.scheduledAt),
  ],
);

export const shopReviews = pgTable("shop_reviews", {
  id: id(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" })
    .unique(),
  shopId: uuid("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  body: text("body"),
  ownerResponse: text("owner_response"),
  ...timestamps,
});
