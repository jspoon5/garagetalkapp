CREATE TYPE "public"."subscription_status" AS ENUM('active', 'canceled', 'past_due', 'trialing');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('amateur', 'gearhead', 'racing_pro', 'pro');--> statement-breakpoint
CREATE TABLE "chat_rooms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "chat_rooms_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "earnings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"profit_sharing" numeric(10, 2) DEFAULT '0.00',
	"ad_revenue" numeric(10, 2) DEFAULT '0.00',
	"viewer_profits" numeric(10, 2) DEFAULT '0.00',
	"product_commissions" numeric(10, 2) DEFAULT '0.00',
	"last_updated" timestamp DEFAULT now(),
	CONSTRAINT "earnings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "live_streams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"streamer_id" varchar NOT NULL,
	"streamer_name" text NOT NULL,
	"category" text NOT NULL,
	"is_live" boolean DEFAULT true,
	"viewer_count" integer DEFAULT 0,
	"stream_key" text,
	"thumbnail" text,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"content" text NOT NULL,
	"is_system" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"query" text NOT NULL,
	"is_ai_search" integer DEFAULT 0,
	"response" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"subscription_tier" "subscription_tier" DEFAULT 'amateur' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" "subscription_status" DEFAULT 'active',
	"ai_search_count" integer DEFAULT 0,
	"ai_search_reset_date" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[],
	"uploader_id" varchar NOT NULL,
	"uploader_name" text NOT NULL,
	"views" integer DEFAULT 0,
	"likes" integer DEFAULT 0,
	"duration" text,
	"thumbnail" text,
	"created_at" timestamp DEFAULT now()
);
