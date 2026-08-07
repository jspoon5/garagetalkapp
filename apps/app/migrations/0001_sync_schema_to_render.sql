CREATE TYPE "public"."admin_role" AS ENUM('developer', 'owner', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."avatar_type" AS ENUM('color', 'image', 'animated');--> statement-breakpoint
CREATE TYPE "public"."fuel_type" AS ENUM('gasoline', 'diesel', 'hybrid', 'plug_in_hybrid', 'battery_electric', 'hydrogen', 'propane', 'natural_gas', 'aviation_fuel', 'other');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."session_type" AS ENUM('screen_share', 'livestream', 'video_call');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('car', 'truck', 'suv', 'van', 'motorcycle', 'atv', 'boat', 'plane', 'helicopter', 'personal_flying_vehicle', 'personal_drone', 'commercial_drone', 'project_vehicle', 'other');--> statement-breakpoint
CREATE TABLE "admin_login_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar NOT NULL,
	"email_code" text NOT NULL,
	"phone_code" text NOT NULL,
	"email_verified" boolean DEFAULT false,
	"phone_verified" boolean DEFAULT false,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_recovery_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar NOT NULL,
	"email_code" text NOT NULL,
	"phone_code" text NOT NULL,
	"email_verified" boolean DEFAULT false,
	"phone_verified" boolean DEFAULT false,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password" text NOT NULL,
	"role" "admin_role" DEFAULT 'developer' NOT NULL,
	"is_active" boolean DEFAULT true,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_users_username_unique" UNIQUE("username"),
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "analytics_page_views" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"session_id" text NOT NULL,
	"page_url" text NOT NULL,
	"page_path" text NOT NULL,
	"referrer" text,
	"source" text,
	"device_type" text NOT NULL,
	"browser" text,
	"os" text,
	"country" text,
	"country_code" text,
	"city" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_signup_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"country" text,
	"city" text,
	"signup_method" text DEFAULT 'email',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "phone_verification_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "podcast_comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" varchar NOT NULL,
	"content" text NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "podcast_episodes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"audio_url" text NOT NULL,
	"duration" integer NOT NULL,
	"category" text NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[],
	"uploader_id" varchar NOT NULL,
	"uploader_name" text NOT NULL,
	"uploader_tier" "subscription_tier" NOT NULL,
	"is_featured" boolean DEFAULT false,
	"views" integer DEFAULT 0,
	"likes" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "podcast_threads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"is_pinned" boolean DEFAULT false,
	"comment_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "room_participants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"x" numeric(10, 2) DEFAULT '400' NOT NULL,
	"y" numeric(10, 2) DEFAULT '300' NOT NULL,
	"avatar_color" text DEFAULT '#3b82f6' NOT NULL,
	"avatar_url" text,
	"avatar_type" text DEFAULT 'color' NOT NULL,
	"expression" text,
	"custom_expression_url" text,
	"bio" text,
	"last_update" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scheduled_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"session_type" "session_type" NOT NULL,
	"status" "session_status" DEFAULT 'scheduled' NOT NULL,
	"host_id" varchar NOT NULL,
	"host_name" text NOT NULL,
	"scheduled_start" timestamp NOT NULL,
	"scheduled_end" timestamp NOT NULL,
	"meeting_id" text,
	"passcode" text,
	"google_calendar_event_id" text,
	"invitee_emails" text[] DEFAULT ARRAY[]::text[],
	"confirmed_attendees" text[] DEFAULT ARRAY[]::text[],
	"reminder_sent" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "screen_share_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" text NOT NULL,
	"passcode" text NOT NULL,
	"host_id" varchar NOT NULL,
	"host_name" text NOT NULL,
	"title" text,
	"is_active" boolean DEFAULT true,
	"participant_count" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"ended_at" timestamp,
	CONSTRAINT "screen_share_sessions_meeting_id_unique" UNIQUE("meeting_id")
);
--> statement-breakpoint
CREATE TABLE "stream_recordings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"duration" integer NOT NULL,
	"file_size" integer,
	"mime_type" text DEFAULT 'video/webm',
	"stream_type" text NOT NULL,
	"folder_path" text,
	"is_public" boolean DEFAULT false,
	"views" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tips" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" varchar NOT NULL,
	"recipient_id" varchar NOT NULL,
	"gift_type" text NOT NULL,
	"gift_name" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'usd',
	"context" text NOT NULL,
	"context_id" text,
	"stripe_session_id" text,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"user_id" varchar,
	"event_type" text NOT NULL,
	"event_data" text,
	"page" text,
	"occurred_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "usage_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"active_users" integer DEFAULT 0,
	"total_sessions" integer DEFAULT 0,
	"avg_session_duration" integer,
	"peak_concurrent_users" integer DEFAULT 0,
	"new_users" integer DEFAULT 0,
	"returning_users" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "usage_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"session_token" text NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp,
	"last_heartbeat" timestamp DEFAULT now(),
	"duration_seconds" integer,
	"user_agent" text,
	"ip_address" text,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "usage_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "user_video_views" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"video_id" varchar NOT NULL,
	"viewed_at" timestamp DEFAULT now(),
	"playback_position" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"nickname" text,
	"vehicle_type" "vehicle_type" NOT NULL,
	"fuel_type" "fuel_type" NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer,
	"trim" text,
	"vin" text,
	"notes" text,
	"is_primary" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "video_comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" varchar NOT NULL,
	"content" text NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "user_city" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_type" "avatar_type" DEFAULT 'color';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_color" text DEFAULT '#3b82f6';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "square_customer_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "square_payment_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_online" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "is_deleted" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_unique" UNIQUE("phone");