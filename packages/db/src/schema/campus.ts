import {
  boolean,
  foreignKey,
  hazardClassEnum,
  id,
  index,
  integer,
  jsonb,
  lessonKindEnum,
  pgTable,
  questSubmissionStatusEnum,
  softDelete,
  text,
  timestamp,
  timestamps,
  uniqueIndex,
  uuid,
} from "./common.js";
import { users } from "./identity.js";
import { videos } from "./media.js";

export const schools = pgTable(
  "schools",
  {
    id: id(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    branding: jsonb("branding").$type<Record<string, unknown>>().default({}),
    membershipPriceCents: integer("membership_price_cents"),
    stripeProductId: text("stripe_product_id"),
    status: text("status").notNull().default("pending"),
    qualificationReview: text("qualification_review"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex("schools_slug_uidx").on(t.slug)],
);

export const courses = pgTable("courses", {
  id: id(),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  schoolId: uuid("school_id").references(() => schools.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  coverUrl: text("cover_url"),
  status: text("status").notNull().default("draft"),
  priceCents: integer("price_cents"),
  ...timestamps,
  ...softDelete,
});

export const modules = pgTable("modules", {
  id: id(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  ...timestamps,
});

export const quizzes = pgTable("quizzes", {
  id: id(),
  title: text("title").notNull(),
  passScore: integer("pass_score").notNull().default(80),
  ...timestamps,
});

export const lessons = pgTable("lessons", {
  id: id(),
  moduleId: uuid("module_id")
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  kind: lessonKindEnum("kind").notNull(),
  title: text("title").notNull(),
  videoId: uuid("video_id").references(() => videos.id, { onDelete: "set null" }),
  bodyMd: text("body_md"),
  quizId: uuid("quiz_id").references(() => quizzes.id, { onDelete: "set null" }),
  orderIndex: integer("order_index").notNull().default(0),
  ...timestamps,
});

export const quizQuestions = pgTable("quiz_questions", {
  id: id(),
  quizId: uuid("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  choices: jsonb("choices").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  ...timestamps,
});

export const quizAttempts = pgTable("quiz_attempts", {
  id: id(),
  quizId: uuid("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  mastery: boolean("mastery").notNull().default(false),
  ...timestamps,
});

export const skillPaths = pgTable(
  "skill_paths",
  {
    id: id(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [uniqueIndex("skill_paths_slug_uidx").on(t.slug)],
);

export const quests = pgTable("quests", {
  id: id(),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  hazardClass: hazardClassEnum("hazard_class").notNull().default("none"),
  tools: jsonb("tools").$type<unknown[]>().default([]),
  parts: jsonb("parts").$type<unknown[]>().default([]),
  safetyCheckpoints: jsonb("safety_checkpoints").$type<unknown[]>().default([]),
  steps: jsonb("steps").$type<unknown[]>().default([]),
  evidenceRequirements: jsonb("evidence_requirements").$type<unknown[]>().default([]),
  ...timestamps,
  ...softDelete,
});

export const pathNodes = pgTable("path_nodes", {
  id: id(),
  pathId: uuid("path_id")
    .notNull()
    .references(() => skillPaths.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  questId: uuid("quest_id").references(() => quests.id, { onDelete: "set null" }),
  orderIndex: integer("order_index").notNull().default(0),
  required: boolean("required").notNull().default(true),
  ...timestamps,
});

export const enrollments = pgTable("enrollments", {
  id: id(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const lessonProgress = pgTable("lesson_progress", {
  id: id(),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [uniqueIndex("lesson_progress_user_lesson_uidx").on(t.userId, t.lessonId)]);

export const pathProgress = pgTable("path_progress", {
  id: id(),
  pathId: uuid("path_id")
    .notNull()
    .references(() => skillPaths.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  completedNodeIds: uuid("completed_node_ids").array().notNull().default([]),
  ...timestamps,
}, (t) => [uniqueIndex("path_progress_user_path_uidx").on(t.userId, t.pathId)]);

export const questSubmissions = pgTable("quest_submissions", {
  id: id(),
  questId: uuid("quest_id")
    .notNull()
    .references(() => quests.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  evidenceMedia: text("evidence_media").array().notNull().default([]),
  stepAcks: jsonb("step_acks").$type<Record<string, unknown>>().default({}),
  status: questSubmissionStatusEnum("status").notNull().default("submitted"),
  reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
  reviewNotes: text("review_notes"),
  ...timestamps,
});

export const skillBadges = pgTable("skill_badges", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  pathId: uuid("path_id").references(() => skillPaths.id, { onDelete: "set null" }),
  questId: uuid("quest_id").references(() => quests.id, { onDelete: "set null" }),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
  source: text("source").notNull().default("learning_event"),
  ...timestamps,
}, (t) => [
  uniqueIndex("skill_badges_user_path_uidx").on(t.userId, t.pathId),
  uniqueIndex("skill_badges_user_quest_uidx").on(t.userId, t.questId),
]);

export const endorsements = pgTable("endorsements", {
  id: id(),
  subjectUserId: uuid("subject_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endorserId: uuid("endorser_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  attestation: jsonb("attestation").$type<{
    signedAt: string;
    sig: string;
    payloadHash: string;
  }>(),
  ...timestamps,
});

export const pitCrews = pgTable("pit_crews", {
  id: id(),
  name: text("name").notNull(),
  memberIds: uuid("member_ids").array().notNull().default([]),
  streakData: jsonb("streak_data").$type<Record<string, unknown>>().default({}),
  weeklyChallengeRef: text("weekly_challenge_ref"),
  ...timestamps,
});

export const crewMembers = pgTable(
  "crew_members",
  {
    id: id(),
    crewId: uuid("crew_id")
      .notNull()
      .references(() => pitCrews.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    dailyStreak: integer("daily_streak").notNull().default(0),
    lastLearningDay: text("last_learning_day"),
    timezone: text("timezone").notNull().default("UTC"),
    ...timestamps,
  },
  (t) => [uniqueIndex("crew_members_crew_user_uidx").on(t.crewId, t.userId)],
);

export const watchParties = pgTable("watch_parties", {
  id: id(),
  crewId: uuid("crew_id")
    .notNull()
    .references(() => pitCrews.id, { onDelete: "cascade" }),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  syncState: jsonb("sync_state").$type<Record<string, unknown>>().default({}),
  ...timestamps,
});

export const avatarItems = pgTable("avatar_items", {
  id: id(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  unlockRule: text("unlock_rule").notNull(),
  ...timestamps,
});

export const learningEvents = pgTable(
  "learning_events",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id"),
    context: text("context").notNull().default("learning"),
    ...timestamps,
  },
  (t) => [index("learning_events_user_idx").on(t.userId)],
);

/** Learning-event only unlocks — FK targets learning tables; no purchase pathway. */
export const avatarUnlocks = pgTable(
  "avatar_unlocks",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => avatarItems.id, { onDelete: "cascade" }),
    sourceEventType: text("source_event_type").notNull(),
    sourceEventId: uuid("source_event_id")
      .notNull()
      .references(() => learningEvents.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    index("avatar_unlocks_user_idx").on(t.userId),
    uniqueIndex("avatar_unlocks_user_item_uidx").on(t.userId, t.itemId),
    foreignKey({
      columns: [t.itemId],
      foreignColumns: [avatarItems.id],
      name: "avatar_unlocks_item_fk",
    }),
  ],
);

export const coursePurchases = pgTable(
  "course_purchases",
  {
    id: id(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("paid"),
    ...timestamps,
  },
  (t) => [uniqueIndex("course_purchases_user_course_uidx").on(t.userId, t.courseId)],
);

export const schoolMemberships = pgTable(
  "school_memberships",
  {
    id: id(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("school_memberships_user_school_uidx").on(t.userId, t.schoolId)],
);

export const approvedCorpus = pgTable(
  "approved_corpus",
  {
    id: id(),
    slug: text("slug").notNull(),
    sourceType: text("source_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    published: boolean("published").notNull().default(false),
    hazardClass: hazardClassEnum("hazard_class").notNull().default("none"),
    ...timestamps,
  },
  (t) => [uniqueIndex("approved_corpus_slug_uidx").on(t.slug)],
);

export const publicBadgeShares = pgTable("public_badge_shares", {
  id: id(),
  badgeId: uuid("badge_id")
    .notNull()
    .references(() => skillBadges.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  disclaimer: text("disclaimer").notNull(),
  ...timestamps,
});

export const contentPresenceRooms = pgTable(
  "content_presence_rooms",
  {
    id: id(),
    contentType: text("content_type").notNull(),
    contentId: uuid("content_id").notNull(),
    roomKey: text("room_key").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("content_presence_rooms_subject_uidx").on(t.contentType, t.contentId)],
);
