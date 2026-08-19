import {
  id,
  index,
  integer,
  pgTable,
  text,
  timestamps,
  uniqueIndex,
  uuid,
} from "./common.js";
import { users } from "./identity.js";
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
    ...timestamps,
  },
  (t) => [index("creator_earnings_user_idx").on(t.userId)],
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
