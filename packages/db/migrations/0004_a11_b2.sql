-- Phase A11-B2: i18n/PWA support metadata plus feed and marketplace completion.

ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "media_type" text DEFAULT 'text' NOT NULL;
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "shared_post_id" uuid;
ALTER TABLE "post_comments" ADD COLUMN IF NOT EXISTS "parent_id" uuid;

CREATE INDEX IF NOT EXISTS "posts_vehicle_idx" ON "posts" USING btree ("vehicle_id");
CREATE INDEX IF NOT EXISTS "posts_created_idx" ON "posts" USING btree ("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "reactions_user_subject_uidx"
  ON "reactions" USING btree ("user_id","subject_type","subject_id");

ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "provenance" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "seller_id" uuid;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "seller_net_cents" integer DEFAULT 0 NOT NULL;

UPDATE "orders"
SET "seller_id" = "listings"."seller_id"
FROM "listings"
WHERE "orders"."listing_id" = "listings"."id" AND "orders"."seller_id" IS NULL;

ALTER TABLE "orders" ALTER COLUMN "seller_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_seller_id_users_id_fk'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_seller_id_users_id_fk"
      FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "listings_kind_idx" ON "listings" USING btree ("kind");
CREATE INDEX IF NOT EXISTS "listings_status_idx" ON "listings" USING btree ("status");
CREATE INDEX IF NOT EXISTS "orders_seller_idx" ON "orders" USING btree ("seller_id");
