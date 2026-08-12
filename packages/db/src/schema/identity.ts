import {
  authTokenTypeEnum,
  avatarTypeEnum,
  boolean,
  id,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  softDelete,
  subscriptionStatusEnum,
  subscriptionTierEnum,
  text,
  timestamp,
  timestamps,
  uniqueIndex,
  uuid,
} from "./common.js";

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    username: text("username").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    legacyHash: text("legacy_hash"),
    avatarType: avatarTypeEnum("avatar_type").notNull().default("color"),
    avatarValue: text("avatar_value").notNull().default("#3b82f6"),
    bio: text("bio"),
    cityText: text("city_text"),
    locationLat: numeric("location_lat", { precision: 9, scale: 6 }),
    locationLng: numeric("location_lng", { precision: 9, scale: 6 }),
    locationConsentAt: timestamp("location_consent_at", { withTimezone: true }),
    roles: text("roles").array().notNull().default([]),
    tier: subscriptionTierEnum("tier").notNull().default("amateur"),
    tierStatus: subscriptionStatusEnum("tier_status").notNull().default("active"),
    stripeCustomerId: text("stripe_customer_id"),
    aiMonthUsage: integer("ai_month_usage").notNull().default(0),
    aiMonthResetAt: timestamp("ai_month_reset_at", { withTimezone: true }).defaultNow(),
    adminTotpSecret: text("admin_totp_secret"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("users_email_uidx").on(t.email),
    uniqueIndex("users_username_uidx").on(t.username),
    uniqueIndex("users_phone_uidx").on(t.phone),
    index("users_tier_idx").on(t.tier),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sessions_token_uidx").on(t.token),
    index("sessions_user_idx").on(t.userId),
  ],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: authTokenTypeEnum("type").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("auth_tokens_user_idx").on(t.userId),
    index("auth_tokens_hash_idx").on(t.tokenHash),
  ],
);

export const passkeys = pgTable(
  "passkeys",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports").array().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("passkeys_credential_uidx").on(t.credentialId),
    index("passkeys_user_idx").on(t.userId),
  ],
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    index("follows_followee_idx").on(t.followeeId),
  ],
);

export const blocks = pgTable(
  "blocks",
  {
    id: id(),
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("blocks_pair_uidx").on(t.blockerId, t.blockedId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    subjectType: text("subject_type"),
    subjectId: uuid("subject_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

export const notificationPrefs = pgTable(
  "notification_prefs",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    pushEnabled: boolean("push_enabled").notNull().default(true),
    smsEnabled: boolean("sms_enabled").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("notification_prefs_user_uidx").on(t.userId)],
);
