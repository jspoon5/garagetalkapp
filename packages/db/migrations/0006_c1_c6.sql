-- C1-C6: VIN recalls, diagnostics v2, OBD, repair briefs, outcomes, attestations

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "vin_decoded" jsonb;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "application_fee_cents" integer DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "subject_type" text,
  "subject_id" uuid,
  "read_at" timestamp with time zone,
  "payload" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" USING btree ("user_id");

CREATE TABLE IF NOT EXISTS "recalls" (
  "id" uuid PRIMARY KEY NOT NULL,
  "campaign_id" text NOT NULL UNIQUE,
  "make" text,
  "model" text,
  "year" integer,
  "summary" text,
  "raw" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "recall_checks" (
  "id" uuid PRIMARY KEY NOT NULL,
  "vehicle_id" uuid NOT NULL REFERENCES "vehicles"("id") ON DELETE cascade,
  "checked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "campaign_ids" text[] DEFAULT '{}' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "recall_checks_vehicle_idx" ON "recall_checks" USING btree ("vehicle_id");

CREATE TABLE IF NOT EXISTS "recall_alerts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "vehicle_id" uuid NOT NULL REFERENCES "vehicles"("id") ON DELETE cascade,
  "recall_id" uuid REFERENCES "recalls"("id") ON DELETE set null,
  "campaign_id" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "notified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "recall_alerts_vehicle_idx" ON "recall_alerts" USING btree ("vehicle_id");

CREATE TABLE IF NOT EXISTS "diagnostic_sessions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "vehicle_id" uuid NOT NULL REFERENCES "vehicles"("id") ON DELETE cascade,
  "status" text DEFAULT 'open' NOT NULL,
  "symptom_text" text,
  "photos" text[] DEFAULT '{}' NOT NULL,
  "audio_clips" jsonb DEFAULT '[]',
  "dtc_codes" text[] DEFAULT '{}' NOT NULL,
  "inputs" jsonb DEFAULT '{}',
  "context_snapshot" jsonb DEFAULT '{}',
  "hypotheses" jsonb DEFAULT '[]',
  "follow_up_questions" text[] DEFAULT '{}' NOT NULL,
  "safety_flags" text[] DEFAULT '{}' NOT NULL,
  "model_meta" jsonb DEFAULT '{}',
  "cost_cents" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "diagnostic_sessions_user_idx" ON "diagnostic_sessions" USING btree ("user_id");

ALTER TABLE "diagnostic_sessions" ADD COLUMN IF NOT EXISTS "symptom_text" text;
ALTER TABLE "diagnostic_sessions" ADD COLUMN IF NOT EXISTS "photos" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "diagnostic_sessions" ADD COLUMN IF NOT EXISTS "audio_clips" jsonb DEFAULT '[]';
ALTER TABLE "diagnostic_sessions" ADD COLUMN IF NOT EXISTS "dtc_codes" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "diagnostic_sessions" ADD COLUMN IF NOT EXISTS "context_snapshot" jsonb DEFAULT '{}';
ALTER TABLE "diagnostic_sessions" ADD COLUMN IF NOT EXISTS "follow_up_questions" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "diagnostic_sessions" ADD COLUMN IF NOT EXISTS "cost_cents" integer DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "diagnostic_cost_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "diagnostic_sessions"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "cents" integer NOT NULL,
  "meta" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "repair_briefs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "diagnostic_sessions"("id") ON DELETE cascade,
  "snapshot" jsonb NOT NULL,
  "share_token" text NOT NULL UNIQUE,
  "pdf_media" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "quote_requests" (
  "id" uuid PRIMARY KEY NOT NULL,
  "brief_id" uuid NOT NULL REFERENCES "repair_briefs"("id") ON DELETE cascade,
  "city_area" text NOT NULL,
  "radius_miles" integer DEFAULT 25 NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "quotes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "request_id" uuid NOT NULL REFERENCES "quote_requests"("id") ON DELETE cascade,
  "shop_id" uuid NOT NULL REFERENCES "shops"("id") ON DELETE cascade,
  "low_cents" integer NOT NULL,
  "high_cents" integer NOT NULL,
  "notes" text,
  "expires_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'offered' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fault_outcomes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "diagnostic_sessions"("id") ON DELETE cascade,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE set null,
  "shop_id" uuid REFERENCES "shops"("id") ON DELETE set null,
  "verified_fix" text NOT NULL,
  "parts" jsonb DEFAULT '[]',
  "input_snapshot" jsonb DEFAULT '{}',
  "attestation" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "fault_outcomes" ADD COLUMN IF NOT EXISTS "input_snapshot" jsonb DEFAULT '{}';

CREATE TABLE IF NOT EXISTS "obd_devices" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "fingerprint" text NOT NULL,
  "protocol" text,
  "last_connected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "obd_snapshots" (
  "id" uuid PRIMARY KEY NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "diagnostic_sessions"("id") ON DELETE cascade,
  "device_id" uuid REFERENCES "obd_devices"("id") ON DELETE set null,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "obd_snapshots_session_idx" ON "obd_snapshots" USING btree ("session_id");
