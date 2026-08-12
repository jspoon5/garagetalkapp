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
    photos: text("photos").array().notNull().default([]),
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
    reviewCount: integer("review_count").notNull().default(0),
    ratingSum: integer("rating_sum").notNull().default(0),
    stripeConnectAccountId: text("stripe_connect_account_id"),
    chargesEnabled: boolean("charges_enabled").notNull().default(false),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex("shops_slug_uidx").on(t.slug)],
);

export const shopVerificationRequests = pgTable(
  "shop_verification_requests",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    requestedById: uuid("requested_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    documentMedia: text("document_media").array().notNull().default([]),
    status: verificationStatusEnum("status").notNull().default("pending"),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    decisionNotes: text("decision_notes"),
    appealOfId: uuid("appeal_of_id"),
    ...timestamps,
  },
  (t) => [index("shop_verification_requests_status_idx").on(t.status)],
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
    provenance: jsonb("provenance").$type<Record<string, unknown>>().default({}),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("listings_seller_idx").on(t.sellerId),
    index("listings_kind_idx").on(t.kind),
    index("listings_status_idx").on(t.status),
  ],
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
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    feeCents: integer("fee_cents").notNull().default(0),
    sellerNetCents: integer("seller_net_cents").notNull().default(0),
    stripePaymentIntent: text("stripe_payment_intent"),
    state: orderStateEnum("state").notNull().default("pending"),
    shipping: jsonb("shipping").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("orders_buyer_idx").on(t.buyerId),
    index("orders_seller_idx").on(t.sellerId),
  ],
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
    grossAmountCents: integer("gross_amount_cents"),
    applicationFeeCents: integer("application_fee_cents").notNull().default(0),
    subjectType: text("subject_type"),
    subjectId: uuid("subject_id"),
    stripePaymentIntent: text("stripe_payment_intent"),
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
    reminder24hSentAt: timestamp("reminder_24h_sent_at", { withTimezone: true }),
    reminder2hSentAt: timestamp("reminder_2h_sent_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    noShowAt: timestamp("no_show_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    calendarUid: text("calendar_uid"),
    ...timestamps,
  },
  (t) => [
    index("bookings_shop_idx").on(t.shopId),
    uniqueIndex("bookings_shop_slot_uidx").on(t.shopId, t.scheduledAt),
  ],
);

export const shopReviews = pgTable("shop_reviews", {
  id: id(),
  bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }).unique(),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }).unique(),
  shopId: uuid("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  body: text("body"),
  ownerResponse: text("owner_response"),
  reportStatus: text("report_status").notNull().default("none"),
  appealStatus: text("appeal_status").notNull().default("none"),
  ...timestamps,
});

export const supporterBadges = pgTable(
  "supporter_badges",
  {
    id: id(),
    supporterUserId: uuid("supporter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creatorUserId: uuid("creator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    totalCents: integer("total_cents").notNull().default(0),
    level: text("level").notNull().default("supporter"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("supporter_badges_pair_uidx").on(t.supporterUserId, t.creatorUserId),
    index("supporter_badges_creator_idx").on(t.creatorUserId),
  ],
);
