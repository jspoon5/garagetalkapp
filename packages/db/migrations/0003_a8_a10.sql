-- Phase A8-A10: live sessions, billing/tips, and admin controls

ALTER TYPE "public"."live_role" ADD VALUE IF NOT EXISTS 'host';

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_totp_secret" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;

ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamp with time zone;
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "rtmp_ingest_url" text;
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "rtmp_stream_key" text;
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "recording_state" text DEFAULT 'idle' NOT NULL;
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "recording_replay_url" text;
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "recording_error" text;

CREATE UNIQUE INDEX IF NOT EXISTS "live_roles_session_user_uidx"
  ON "live_roles" USING btree ("session_id","user_id");

ALTER TABLE "creator_ledgers" ADD COLUMN IF NOT EXISTS "gross_amount_cents" integer;
ALTER TABLE "creator_ledgers" ADD COLUMN IF NOT EXISTS "application_fee_cents" integer DEFAULT 0 NOT NULL;
ALTER TABLE "creator_ledgers" ADD COLUMN IF NOT EXISTS "stripe_payment_intent" text;
