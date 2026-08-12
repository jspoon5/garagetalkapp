-- Phases A4-A7: podcasts, chat/presence, spatial pins, GearHead metering

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location_lat" numeric(9,6);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location_lng" numeric(9,6);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location_consent_at" timestamp with time zone;

ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'processing' NOT NULL;
ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "audio_url" text;
ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "artwork_url" text;
ALTER TABLE "podcast_comments" ADD COLUMN IF NOT EXISTS "parent_id" uuid;

CREATE UNIQUE INDEX IF NOT EXISTS "room_members_room_user_uidx"
  ON "room_members" USING btree ("room_id","user_id");
