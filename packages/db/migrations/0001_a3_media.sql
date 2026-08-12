-- Phase A3: video platform media extensions

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;

ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "hls_url" text;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "custom_thumb" text;

DO $$ BEGIN
 CREATE TYPE "public"."auth_token_type" AS ENUM('verify_email', 'password_reset', 'stream_webhook');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "public"."auth_token_type" ADD VALUE IF NOT EXISTS 'stream_webhook';

CREATE TABLE IF NOT EXISTS "auth_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"type" "auth_token_type" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "view_heartbeats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"session_id" text NOT NULL,
	"media_type" text NOT NULL,
	"media_id" uuid NOT NULL,
	"view_date" text NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "recently_watched" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"last_watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"public_url" text,
	"exif_stripped" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "view_heartbeats" ADD CONSTRAINT "view_heartbeats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "recently_watched" ADD CONSTRAINT "recently_watched_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "recently_watched" ADD CONSTRAINT "recently_watched_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "auth_tokens_hash_idx" ON "auth_tokens" USING btree ("token_hash");
CREATE INDEX IF NOT EXISTS "auth_tokens_user_idx" ON "auth_tokens" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "view_heartbeats_media_idx" ON "view_heartbeats" USING btree ("media_type","media_id");
CREATE UNIQUE INDEX IF NOT EXISTS "view_heartbeats_dedupe_uidx" ON "view_heartbeats" USING btree ("user_id","media_id","view_date");
CREATE UNIQUE INDEX IF NOT EXISTS "recently_watched_user_video_uidx" ON "recently_watched" USING btree ("user_id","video_id");
CREATE INDEX IF NOT EXISTS "recently_watched_user_idx" ON "recently_watched" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "media_assets_owner_idx" ON "media_assets" USING btree ("owner_id");

CREATE UNIQUE INDEX IF NOT EXISTS "video_likes_user_video_uidx" ON "video_likes" USING btree ("user_id","video_id");

CREATE TABLE IF NOT EXISTS "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "reports_status_idx" ON "reports" USING btree ("status");
