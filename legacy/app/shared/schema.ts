import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const subscriptionTierEnum = pgEnum("subscription_tier", ["amateur", "gearhead", "racing_pro", "pro"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "canceled", "past_due", "trialing"]);
export const adminRoleEnum = pgEnum("admin_role", ["developer", "owner", "super_admin"]);
export const avatarTypeEnum = pgEnum("avatar_type", ["color", "image", "animated"]);

export const subscriptionTiers = ["amateur", "gearhead", "racing_pro", "pro"] as const;
export type SubscriptionTier = typeof subscriptionTiers[number];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  password: text("password").notNull(),
  avatarUrl: text("avatar_url"),
  avatarType: avatarTypeEnum("avatar_type").default("color"),
  bio: text("bio"),
  city: text("city"),
  avatarColor: text("avatar_color").default("#3b82f6"),
  subscriptionTier: subscriptionTierEnum("subscription_tier").notNull().default("amateur"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  squareCustomerId: text("square_customer_id"),
  squarePaymentId: text("square_payment_id"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("active"),
  aiSearchCount: integer("ai_search_count").default(0),
  aiSearchResetDate: timestamp("ai_search_reset_date").defaultNow(),
  isOnline: boolean("is_online").default(false),
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const phoneVerificationTokens = pgTable("phone_verification_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  password: text("password").notNull(),
  role: adminRoleEnum("role").notNull().default("developer"),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adminRecoveryTokens = pgTable("admin_recovery_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull(),
  emailCode: text("email_code").notNull(),
  phoneCode: text("phone_code").notNull(),
  emailVerified: boolean("email_verified").default(false),
  phoneVerified: boolean("phone_verified").default(false),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adminLoginTokens = pgTable("admin_login_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull(),
  emailCode: text("email_code").notNull(),
  phoneCode: text("phone_code").notNull(),
  emailVerified: boolean("email_verified").default(false),
  phoneVerified: boolean("phone_verified").default(false),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adminSessions = pgTable("admin_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const videos = pgTable("videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  uploaderId: varchar("uploader_id").notNull(),
  uploaderName: text("uploader_name").notNull(),
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  duration: text("duration"),
  thumbnail: text("thumbnail"),
  countryCode: text("country_code"),
  createdAt: timestamp("created_at").defaultNow(),
  isDeleted: boolean("is_deleted").default(false),
  deletedAt: timestamp("deleted_at"),
});

export const userVideoViews = pgTable("user_video_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  videoId: varchar("video_id").notNull(),
  viewedAt: timestamp("viewed_at").defaultNow(),
  playbackPosition: integer("playback_position").default(0),
});

export const videoComments = pgTable("video_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").notNull(),
  content: text("content").notNull(),
  userId: varchar("user_id").notNull(),
  username: text("username").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatRooms = pgTable("chat_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull(),
  userId: varchar("user_id").notNull(),
  username: text("username").notNull(),
  userCity: text("user_city"),
  content: text("content").notNull(),
  isSystem: integer("is_system").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const searches = pgTable("searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  query: text("query").notNull(),
  isAiSearch: integer("is_ai_search").default(0),
  response: text("response"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const earnings = pgTable("earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  profitSharing: decimal("profit_sharing", { precision: 10, scale: 2 }).default("0.00"),
  adRevenue: decimal("ad_revenue", { precision: 10, scale: 2 }).default("0.00"),
  viewerProfits: decimal("viewer_profits", { precision: 10, scale: 2 }).default("0.00"),
  productCommissions: decimal("product_commissions", { precision: 10, scale: 2 }).default("0.00"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const liveStreams = pgTable("live_streams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  streamerId: varchar("streamer_id").notNull(),
  streamerName: text("streamer_name").notNull(),
  category: text("category").notNull(),
  isLive: boolean("is_live").default(true),
  viewerCount: integer("viewer_count").default(0),
  streamKey: text("stream_key"),
  thumbnail: text("thumbnail"),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const roomParticipants = pgTable("room_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull(),
  userId: varchar("user_id").notNull(),
  username: text("username").notNull(),
  x: decimal("x", { precision: 10, scale: 2 }).notNull().default("400"),
  y: decimal("y", { precision: 10, scale: 2 }).notNull().default("300"),
  avatarColor: text("avatar_color").notNull().default("#3b82f6"),
  avatarUrl: text("avatar_url"),
  avatarType: text("avatar_type").notNull().default("color"),
  expression: text("expression"),
  customExpressionUrl: text("custom_expression_url"),
  bio: text("bio"),
  lastUpdate: timestamp("last_update").defaultNow(),
});

export const screenShareSessions = pgTable("screen_share_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingId: text("meeting_id").notNull().unique(),
  passcode: text("passcode").notNull(),
  hostId: varchar("host_id").notNull(),
  hostName: text("host_name").notNull(),
  title: text("title"),
  isActive: boolean("is_active").default(true),
  participantCount: integer("participant_count").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const podcastEpisodes = pgTable("podcast_episodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  audioUrl: text("audio_url").notNull(),
  duration: integer("duration").notNull(),
  category: text("category").notNull(),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  uploaderId: varchar("uploader_id").notNull(),
  uploaderName: text("uploader_name").notNull(),
  uploaderTier: subscriptionTierEnum("uploader_tier").notNull(),
  isFeatured: boolean("is_featured").default(false),
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const podcastThreads = pgTable("podcast_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  userId: varchar("user_id").notNull(),
  username: text("username").notNull(),
  isPinned: boolean("is_pinned").default(false),
  commentCount: integer("comment_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const podcastComments = pgTable("podcast_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: varchar("thread_id").notNull(),
  content: text("content").notNull(),
  userId: varchar("user_id").notNull(),
  username: text("username").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Session type enum for scheduled sessions
export const sessionTypeEnum = pgEnum("session_type", ["screen_share", "livestream", "video_call"]);
export const sessionStatusEnum = pgEnum("session_status", ["scheduled", "confirmed", "in_progress", "completed", "cancelled"]);

export const scheduledSessions = pgTable("scheduled_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  sessionType: sessionTypeEnum("session_type").notNull(),
  status: sessionStatusEnum("status").notNull().default("scheduled"),
  hostId: varchar("host_id").notNull(),
  hostName: text("host_name").notNull(),
  scheduledStart: timestamp("scheduled_start").notNull(),
  scheduledEnd: timestamp("scheduled_end").notNull(),
  meetingId: text("meeting_id"),
  passcode: text("passcode"),
  googleCalendarEventId: text("google_calendar_event_id"),
  inviteeEmails: text("invitee_emails").array().default(sql`ARRAY[]::text[]`),
  confirmedAttendees: text("confirmed_attendees").array().default(sql`ARRAY[]::text[]`),
  reminderSent: boolean("reminder_sent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Stream Recordings - recordings of live broadcasts
export const streamRecordings = pgTable("stream_recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storageId: varchar("storage_id").notNull(), // Object storage recording UUID
  title: text("title").notNull(),
  description: text("description"),
  userId: varchar("user_id").notNull(),
  username: text("username").notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  duration: integer("duration").notNull(), // in seconds
  fileSize: integer("file_size"), // in bytes
  mimeType: text("mime_type").default("video/webm"),
  streamType: text("stream_type").notNull(), // 'camera' or 'screen'
  folderPath: text("folder_path"), // Optional folder path in cloud storage
  isPublic: boolean("is_public").default(false),
  views: integer("views").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Analytics: User Sessions - tracks when users are on the app
export const usageSessions = pgTable("usage_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  sessionToken: text("session_token").notNull().unique(),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  lastHeartbeat: timestamp("last_heartbeat").defaultNow(),
  durationSeconds: integer("duration_seconds"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  isActive: boolean("is_active").default(true),
});

// Analytics: Usage Events - tracks specific actions
export const usageEvents = pgTable("usage_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  userId: varchar("user_id"),
  eventType: text("event_type").notNull(),
  eventData: text("event_data"),
  page: text("page"),
  occurredAt: timestamp("occurred_at").defaultNow(),
});

// Analytics: Usage Metrics - aggregated snapshots for dashboards
export const usageMetrics = pgTable("usage_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timestamp: timestamp("timestamp").defaultNow(),
  activeUsers: integer("active_users").default(0),
  totalSessions: integer("total_sessions").default(0),
  avgSessionDuration: integer("avg_session_duration"),
  peakConcurrentUsers: integer("peak_concurrent_users").default(0),
  newUsers: integer("new_users").default(0),
  returningUsers: integer("returning_users").default(0),
});

// Vehicle types enum - covers cars, trucks, motorcycles, aircraft, drones, etc.
export const vehicleTypeEnum = pgEnum("vehicle_type", [
  "car",
  "truck",
  "suv",
  "van",
  "motorcycle",
  "atv",
  "boat",
  "plane",
  "helicopter",
  "personal_flying_vehicle",
  "personal_drone",
  "commercial_drone",
  "project_vehicle",
  "other"
]);

// Fuel/power types enum - includes electric vehicles
export const fuelTypeEnum = pgEnum("fuel_type", [
  "gasoline",
  "diesel",
  "hybrid",
  "plug_in_hybrid",
  "battery_electric",
  "hydrogen",
  "propane",
  "natural_gas",
  "aviation_fuel",
  "other"
]);

export const vehicleTypes = [
  "car", "truck", "suv", "van", "motorcycle", "atv", "boat",
  "plane", "helicopter", "personal_flying_vehicle", "personal_drone", 
  "commercial_drone", "project_vehicle", "other"
] as const;
export type VehicleType = typeof vehicleTypes[number];

export const fuelTypes = [
  "gasoline", "diesel", "hybrid", "plug_in_hybrid", "battery_electric",
  "hydrogen", "propane", "natural_gas", "aviation_fuel", "other"
] as const;
export type FuelType = typeof fuelTypes[number];

// User Vehicles - user's garage of vehicles
export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  nickname: text("nickname"),
  vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
  fuelType: fuelTypeEnum("fuel_type").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year"),
  trim: text("trim"),
  vin: text("vin"),
  notes: text("notes"),
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  city: true,
}).extend({
  subscriptionTier: z.enum(subscriptionTiers).optional(),
  email: z.string().email().optional(),
  city: z.string().optional(),
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
  used: true,
});

export const insertPhoneVerificationTokenSchema = createInsertSchema(phoneVerificationTokens).omit({
  id: true,
  createdAt: true,
  used: true,
});

export const adminRoles = ["developer", "owner", "super_admin"] as const;
export type AdminRole = typeof adminRoles[number];

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({
  id: true,
  createdAt: true,
  lastLoginAt: true,
  isActive: true,
}).extend({
  role: z.enum(adminRoles).optional(),
});

export const insertAdminSessionSchema = createInsertSchema(adminSessions).omit({
  id: true,
  createdAt: true,
});

export const insertAdminRecoveryTokenSchema = createInsertSchema(adminRecoveryTokens).omit({
  id: true,
  createdAt: true,
  emailVerified: true,
  phoneVerified: true,
  used: true,
});

export const insertAdminLoginTokenSchema = createInsertSchema(adminLoginTokens).omit({
  id: true,
  createdAt: true,
  emailVerified: true,
  phoneVerified: true,
  used: true,
});

export const insertVideoSchema = createInsertSchema(videos).omit({
  id: true,
  createdAt: true,
  views: true,
  likes: true,
}).extend({
  tags: z.array(z.string()).optional(),
});

export const insertChatRoomSchema = createInsertSchema(chatRooms).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
}).extend({
  isSystem: z.boolean().optional(),
});

export const insertSearchSchema = createInsertSchema(searches).omit({
  id: true,
  createdAt: true,
}).extend({
  isAiSearch: z.boolean().optional(),
});

export const insertEarningsSchema = createInsertSchema(earnings).omit({
  id: true,
  lastUpdated: true,
});

export const insertLiveStreamSchema = createInsertSchema(liveStreams).omit({
  id: true,
  startedAt: true,
  endedAt: true,
});

export const insertRoomParticipantSchema = createInsertSchema(roomParticipants).omit({
  id: true,
  lastUpdate: true,
});

export const insertScreenShareSessionSchema = createInsertSchema(screenShareSessions).omit({
  id: true,
  createdAt: true,
  endedAt: true,
  participantCount: true,
  isActive: true,
});

export const insertPodcastEpisodeSchema = createInsertSchema(podcastEpisodes).omit({
  id: true,
  createdAt: true,
  views: true,
  likes: true,
}).extend({
  tags: z.array(z.string()).optional(),
});

export const insertPodcastThreadSchema = createInsertSchema(podcastThreads).omit({
  id: true,
  createdAt: true,
  commentCount: true,
});

export const insertPodcastCommentSchema = createInsertSchema(podcastComments).omit({
  id: true,
  createdAt: true,
});

export const insertVideoCommentSchema = createInsertSchema(videoComments).omit({
  id: true,
  createdAt: true,
});

export const insertUserVideoViewSchema = createInsertSchema(userVideoViews).omit({
  id: true,
  viewedAt: true,
});

export const sessionTypes = ["screen_share", "livestream", "video_call"] as const;
export type SessionType = typeof sessionTypes[number];

export const sessionStatuses = ["scheduled", "confirmed", "in_progress", "completed", "cancelled"] as const;
export type SessionStatus = typeof sessionStatuses[number];

export const insertScheduledSessionSchema = createInsertSchema(scheduledSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  googleCalendarEventId: true,
  reminderSent: true,
  confirmedAttendees: true,
}).extend({
  inviteeEmails: z.array(z.string().email()).optional(),
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  createdAt: true,
}).extend({
  vehicleType: z.enum(vehicleTypes),
  fuelType: z.enum(fuelTypes),
  year: z.number().min(1900).max(2100).optional(),
});

export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export type InsertPhoneVerificationToken = z.infer<typeof insertPhoneVerificationTokenSchema>;
export type PhoneVerificationToken = typeof phoneVerificationTokens.$inferSelect;

export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminUser = typeof adminUsers.$inferSelect;

export type InsertAdminSession = z.infer<typeof insertAdminSessionSchema>;
export type AdminSession = typeof adminSessions.$inferSelect;

export type InsertAdminRecoveryToken = z.infer<typeof insertAdminRecoveryTokenSchema>;
export type AdminRecoveryToken = typeof adminRecoveryTokens.$inferSelect;

export type InsertAdminLoginToken = z.infer<typeof insertAdminLoginTokenSchema>;
export type AdminLoginToken = typeof adminLoginTokens.$inferSelect;

export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = typeof videos.$inferSelect;

export type InsertChatRoom = z.infer<typeof insertChatRoomSchema>;
export type ChatRoom = typeof chatRooms.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type InsertSearch = z.infer<typeof insertSearchSchema>;
export type Search = typeof searches.$inferSelect;

export type InsertEarnings = z.infer<typeof insertEarningsSchema>;
export type Earnings = typeof earnings.$inferSelect;

export type InsertLiveStream = z.infer<typeof insertLiveStreamSchema>;
export type LiveStream = typeof liveStreams.$inferSelect;

export type InsertRoomParticipant = z.infer<typeof insertRoomParticipantSchema>;
export type RoomParticipant = typeof roomParticipants.$inferSelect;

export type InsertScreenShareSession = z.infer<typeof insertScreenShareSessionSchema>;
export type ScreenShareSession = typeof screenShareSessions.$inferSelect;

export type InsertPodcastEpisode = z.infer<typeof insertPodcastEpisodeSchema>;
export type PodcastEpisode = typeof podcastEpisodes.$inferSelect;

export type InsertPodcastThread = z.infer<typeof insertPodcastThreadSchema>;
export type PodcastThread = typeof podcastThreads.$inferSelect;

export type InsertPodcastComment = z.infer<typeof insertPodcastCommentSchema>;
export type PodcastComment = typeof podcastComments.$inferSelect;

export type InsertVideoComment = z.infer<typeof insertVideoCommentSchema>;
export type VideoComment = typeof videoComments.$inferSelect;

export type InsertUserVideoView = z.infer<typeof insertUserVideoViewSchema>;
export type UserVideoView = typeof userVideoViews.$inferSelect;

export type InsertScheduledSession = z.infer<typeof insertScheduledSessionSchema>;
export type ScheduledSession = typeof scheduledSessions.$inferSelect;

// Analytics page views for admin dashboard
export const analyticsPageViews = pgTable("analytics_page_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  sessionId: text("session_id").notNull(),
  pageUrl: text("page_url").notNull(),
  pagePath: text("page_path").notNull(),
  referrer: text("referrer"),
  source: text("source"),
  deviceType: text("device_type").notNull(),
  browser: text("browser"),
  os: text("os"),
  country: text("country"),
  countryCode: text("country_code"),
  city: text("city"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAnalyticsPageViewSchema = createInsertSchema(analyticsPageViews).omit({
  id: true,
  createdAt: true,
});

export type InsertAnalyticsPageView = z.infer<typeof insertAnalyticsPageViewSchema>;
export type AnalyticsPageView = typeof analyticsPageViews.$inferSelect;

export const insertUsageSessionSchema = createInsertSchema(usageSessions).omit({
  id: true,
  startedAt: true,
  endedAt: true,
  lastHeartbeat: true,
  durationSeconds: true,
});

export const insertUsageEventSchema = createInsertSchema(usageEvents).omit({
  id: true,
  occurredAt: true,
});

export const insertUsageMetricSchema = createInsertSchema(usageMetrics).omit({
  id: true,
  timestamp: true,
});

export type InsertUsageSession = z.infer<typeof insertUsageSessionSchema>;
export type UsageSession = typeof usageSessions.$inferSelect;

export type InsertUsageEvent = z.infer<typeof insertUsageEventSchema>;
export type UsageEvent = typeof usageEvents.$inferSelect;

export type InsertUsageMetric = z.infer<typeof insertUsageMetricSchema>;
export type UsageMetric = typeof usageMetrics.$inferSelect;

export const insertStreamRecordingSchema = createInsertSchema(streamRecordings).omit({
  id: true,
  createdAt: true,
  views: true,
});

export type InsertStreamRecording = z.infer<typeof insertStreamRecordingSchema>;
export type StreamRecording = typeof streamRecordings.$inferSelect;

// Email signup log for tracking real account registrations
export const emailSignupLog = pgTable("email_signup_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  userId: varchar("user_id").notNull(),
  username: text("username").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  country: text("country"),
  city: text("city"),
  signupMethod: text("signup_method").default("email"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmailSignupLogSchema = createInsertSchema(emailSignupLog).omit({
  id: true,
  createdAt: true,
});

export type InsertEmailSignupLog = z.infer<typeof insertEmailSignupLogSchema>;
export type EmailSignupLog = typeof emailSignupLog.$inferSelect;

export const tips = pgTable("tips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull(),
  recipientId: varchar("recipient_id").notNull(),
  giftType: text("gift_type").notNull(),
  giftName: text("gift_name").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").default("usd"),
  context: text("context").notNull(),
  contextId: text("context_id"),
  stripeSessionId: text("stripe_session_id"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTipSchema = createInsertSchema(tips).omit({
  id: true,
  createdAt: true,
});

export type InsertTip = z.infer<typeof insertTipSchema>;
export type Tip = typeof tips.$inferSelect;
