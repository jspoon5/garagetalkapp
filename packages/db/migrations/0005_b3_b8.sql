-- B3-B8: shops, reviews, booking, service records, creator monetization, R2R hub

ALTER TYPE "public"."verification_status" ADD VALUE IF NOT EXISTS 'rejected';

ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "photos" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "review_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "rating_sum" integer DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "shop_verification_requests" (
  "id" uuid PRIMARY KEY NOT NULL,
  "shop_id" uuid NOT NULL REFERENCES "shops"("id") ON DELETE cascade,
  "requested_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "document_media" text[] DEFAULT '{}' NOT NULL,
  "status" "verification_status" DEFAULT 'pending' NOT NULL,
  "reviewer_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "decision_notes" text,
  "appeal_of_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "shop_verification_requests_status_idx"
  ON "shop_verification_requests" USING btree ("status");

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "reminder_24h_sent_at" timestamp with time zone;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "reminder_2h_sent_at" timestamp with time zone;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "no_show_at" timestamp with time zone;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "calendar_uid" text;

ALTER TABLE "shop_reviews" ALTER COLUMN "booking_id" DROP NOT NULL;
ALTER TABLE "shop_reviews" ADD COLUMN IF NOT EXISTS "order_id" uuid REFERENCES "orders"("id") ON DELETE cascade;
ALTER TABLE "shop_reviews" ADD COLUMN IF NOT EXISTS "report_status" text DEFAULT 'none' NOT NULL;
ALTER TABLE "shop_reviews" ADD COLUMN IF NOT EXISTS "appeal_status" text DEFAULT 'none' NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "shop_reviews_order_uidx" ON "shop_reviews" USING btree ("order_id");

ALTER TABLE "service_records" ADD COLUMN IF NOT EXISTS "work" text;
ALTER TABLE "service_records" ADD COLUMN IF NOT EXISTS "shared_fields" text[] DEFAULT '{}' NOT NULL;

CREATE TABLE IF NOT EXISTS "supporter_badges" (
  "id" uuid PRIMARY KEY NOT NULL,
  "supporter_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "creator_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "total_cents" integer DEFAULT 0 NOT NULL,
  "level" text DEFAULT 'supporter' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "supporter_badges_pair_uidx"
  ON "supporter_badges" USING btree ("supporter_user_id","creator_user_id");
CREATE INDEX IF NOT EXISTS "supporter_badges_creator_idx"
  ON "supporter_badges" USING btree ("creator_user_id");

CREATE TABLE IF NOT EXISTS "r2r_articles" (
  "id" uuid PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "summary" text,
  "body_md" text NOT NULL,
  "tags" text[] DEFAULT '{}' NOT NULL,
  "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "published" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "r2r_articles_slug_uidx" ON "r2r_articles" USING btree ("slug");
CREATE INDEX IF NOT EXISTS "r2r_articles_category_idx" ON "r2r_articles" USING btree ("category");
