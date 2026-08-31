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
import { liveSessions } from "./rooms-live.js";

export const coinWallets = pgTable(
  "coin_wallets",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    balanceCoins: integer("balance_coins").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("coin_wallets_user_uidx").on(t.userId)],
);

export const coinLedger = pgTable(
  "coin_ledger",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deltaCoins: integer("delta_coins").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    entryType: text("entry_type").notNull(),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    idempotencyKey: text("idempotency_key"),
    stripePaymentIntent: text("stripe_payment_intent"),
    ...timestamps,
  },
  (t) => [
    index("coin_ledger_user_idx").on(t.userId),
    uniqueIndex("coin_ledger_idempotency_uidx").on(t.idempotencyKey),
  ],
);

export const giftCatalog = pgTable(
  "gift_catalog",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    coinCost: integer("coin_cost").notNull(),
    animationKey: text("animation_key").notNull().default("default"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: text("active").notNull().default("true"),
    ...timestamps,
  },
  (t) => [uniqueIndex("gift_catalog_slug_uidx").on(t.slug)],
);

export const liveGifts = pgTable(
  "live_gifts",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => liveSessions.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    giftId: uuid("gift_id")
      .notNull()
      .references(() => giftCatalog.id, { onDelete: "restrict" }),
    coinCost: integer("coin_cost").notNull(),
    creatorShareCents: integer("creator_share_cents").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    ...timestamps,
  },
  (t) => [
    index("live_gifts_session_idx").on(t.sessionId),
    uniqueIndex("live_gifts_idempotency_uidx").on(t.idempotencyKey),
  ],
);

/** Configurable creator revenue share (basis points). Snapshot share_bps onto earnings at gift time. */
export const revenueShareRules = pgTable(
  "revenue_share_rules",
  {
    id: id(),
    tier: text("tier").notNull(),
    shareBps: integer("share_bps").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    revenueType: text("revenue_type").notNull().default("live_gift"),
    ...timestamps,
  },
  (t) => [index("revenue_share_rules_tier_type_idx").on(t.tier, t.revenueType, t.effectiveFrom)],
);

/**
 * Internal SCT ledger (source of truth). Status: PENDING → AVAILABLE → PAID (or REVERSED).
 * tip_side_fee_cents is the tip-side platform deduction (not a Stripe processing fee).
 */
export const creatorEarnings = pgTable(
  "creator_earnings",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id"),
    grossCents: integer("gross_cents").notNull(),
    platformFeeCents: integer("platform_fee_cents").notNull().default(0),
    netCents: integer("net_cents").notNull(),
    balanceAfterCents: integer("balance_after_cents").notNull(),
    status: text("status").notNull().default("PENDING"),
    creatorTierAtTx: text("creator_tier_at_tx"),
    shareBps: integer("share_bps"),
    availableAt: timestamp("available_at", { withTimezone: true }),
    stripeTransferId: text("stripe_transfer_id"),
    tipSideFeeCents: integer("tip_side_fee_cents").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("creator_earnings_user_idx").on(t.userId),
    index("creator_earnings_status_idx").on(t.userId, t.status),
    index("creator_earnings_available_at_idx").on(t.status, t.availableAt),
  ],
);

export const creatorPayoutAccounts = pgTable(
  "creator_payout_accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeConnectAccountId: text("stripe_connect_account_id"),
    chargesEnabled: text("charges_enabled").notNull().default("false"),
    payoutsEnabled: text("payouts_enabled").notNull().default("false"),
    ...timestamps,
  },
  (t) => [uniqueIndex("creator_payout_accounts_user_uidx").on(t.userId)],
);

export const creatorPayouts = pgTable(
  "creator_payouts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    stripeTransferId: text("stripe_transfer_id"),
    status: text("status").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [index("creator_payouts_user_idx").on(t.userId)],
);

/** Share sheet: who shared what. */
export const shares = pgTable(
  "shares",
  {
    id: id(),
    senderUserId: uuid("sender_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    objectType: text("object_type").notNull(),
    objectId: uuid("object_id").notNull(),
    shareType: text("share_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("shares_sender_idx").on(t.senderUserId),
    index("shares_object_idx").on(t.objectType, t.objectId),
  ],
);

export const shareRecipients = pgTable(
  "share_recipients",
  {
    id: id(),
    shareId: uuid("share_id")
      .notNull()
      .references(() => shares.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("share_recipients_share_idx").on(t.shareId),
    index("share_recipients_user_idx").on(t.recipientUserId),
  ],
);

/** GearHead AI conversation history. */
export const gearheadThreads = pgTable(
  "gearhead_threads",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    ...timestamps,
  },
  (t) => [index("gearhead_threads_user_idx").on(t.userId)],
);

export const gearheadMessages = pgTable(
  "gearhead_messages",
  {
    id: id(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => gearheadThreads.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gearhead_messages_thread_idx").on(t.threadId)],
);
