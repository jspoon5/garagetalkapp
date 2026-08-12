-- Track D phases D1-D11: campus learning, live classes, proof, avatars, earnings.

ALTER TABLE "qualified_views" ADD COLUMN IF NOT EXISTS "creator_user_id" uuid REFERENCES "users"("id") ON DELETE set null;
ALTER TABLE "qualified_views" ADD COLUMN IF NOT EXISTS "view_date" text DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') NOT NULL;
ALTER TABLE "qualified_views" ADD COLUMN IF NOT EXISTS "watch_seconds" integer DEFAULT 0 NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "qualified_views_user_asset_day_uidx"
  ON "qualified_views" USING btree ("viewer_id","media_id","view_date");

CREATE UNIQUE INDEX IF NOT EXISTS "lesson_progress_user_lesson_uidx"
  ON "lesson_progress" USING btree ("user_id","lesson_id");
CREATE UNIQUE INDEX IF NOT EXISTS "path_progress_user_path_uidx"
  ON "path_progress" USING btree ("user_id","path_id");
CREATE UNIQUE INDEX IF NOT EXISTS "skill_badges_user_path_uidx"
  ON "skill_badges" USING btree ("user_id","path_id");
CREATE UNIQUE INDEX IF NOT EXISTS "skill_badges_user_quest_uidx"
  ON "skill_badges" USING btree ("user_id","quest_id");

CREATE TABLE IF NOT EXISTS "learning_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "source_type" text NOT NULL,
  "source_id" uuid,
  "context" text DEFAULT 'learning' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "learning_events_context_chk" CHECK ("context" = 'learning')
);
CREATE INDEX IF NOT EXISTS "learning_events_user_idx" ON "learning_events" USING btree ("user_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'avatar_unlocks_learning_event_fk') THEN
    ALTER TABLE "avatar_unlocks"
      ADD CONSTRAINT "avatar_unlocks_learning_event_fk"
      FOREIGN KEY ("source_event_id") REFERENCES "learning_events"("id") ON DELETE restrict NOT VALID;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "avatar_unlocks_user_item_uidx"
  ON "avatar_unlocks" USING btree ("user_id","item_id");

CREATE TABLE IF NOT EXISTS "course_purchases" (
  "id" uuid PRIMARY KEY NOT NULL,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "amount_cents" integer NOT NULL,
  "status" text DEFAULT 'paid' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "course_purchases_user_course_uidx"
  ON "course_purchases" USING btree ("user_id","course_id");

CREATE TABLE IF NOT EXISTS "school_memberships" (
  "id" uuid PRIMARY KEY NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "status" text DEFAULT 'active' NOT NULL,
  "current_period_end" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "school_memberships_user_school_uidx"
  ON "school_memberships" USING btree ("user_id","school_id");

CREATE TABLE IF NOT EXISTS "crew_members" (
  "id" uuid PRIMARY KEY NOT NULL,
  "crew_id" uuid NOT NULL REFERENCES "pit_crews"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role" text DEFAULT 'member' NOT NULL,
  "daily_streak" integer DEFAULT 0 NOT NULL,
  "last_learning_day" text,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "crew_members_crew_user_uidx"
  ON "crew_members" USING btree ("crew_id","user_id");

CREATE TABLE IF NOT EXISTS "approved_corpus" (
  "id" uuid PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "source_type" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "published" boolean DEFAULT false NOT NULL,
  "hazard_class" "hazard_class" DEFAULT 'none' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "approved_corpus_slug_uidx" ON "approved_corpus" USING btree ("slug");

CREATE TABLE IF NOT EXISTS "public_badge_shares" (
  "id" uuid PRIMARY KEY NOT NULL,
  "badge_id" uuid NOT NULL REFERENCES "skill_badges"("id") ON DELETE cascade,
  "slug" text NOT NULL UNIQUE,
  "disclaimer" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "content_presence_rooms" (
  "id" uuid PRIMARY KEY NOT NULL,
  "content_type" text NOT NULL,
  "content_id" uuid NOT NULL,
  "room_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "content_presence_rooms_subject_uidx"
  ON "content_presence_rooms" USING btree ("content_type","content_id");

INSERT INTO "skill_paths" ("id","slug","title","description")
VALUES
  ('0198a000-0000-7000-8000-000000000d31','maintenance_basics','Maintenance Basics','Foundational owner maintenance path.'),
  ('0198a000-0000-7000-8000-000000000d32','brakes','Brakes','Brake inspection and service fundamentals.'),
  ('0198a000-0000-7000-8000-000000000d33','electrical_diagnostics','Electrical Diagnostics','Safe electrical diagnostic workflow.'),
  ('0198a000-0000-7000-8000-000000000d34','welding','Welding','Educational welding theory and demos.'),
  ('0198a000-0000-7000-8000-000000000d35','detailing','Detailing','Interior and exterior detailing skills.'),
  ('0198a000-0000-7000-8000-000000000d36','restoration','Restoration','Restoration planning and documentation.'),
  ('0198a000-0000-7000-8000-000000000d37','shop_management','Shop Management','Garage operations and customer workflow.')
ON CONFLICT ("slug") DO NOTHING;

CREATE OR REPLACE FUNCTION prevent_creator_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'creator_ledgers are append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS creator_ledgers_no_update ON "creator_ledgers";
DROP TRIGGER IF EXISTS creator_ledgers_no_delete ON "creator_ledgers";
CREATE TRIGGER creator_ledgers_no_update BEFORE UPDATE ON "creator_ledgers"
  FOR EACH ROW EXECUTE FUNCTION prevent_creator_ledger_mutation();
CREATE TRIGGER creator_ledgers_no_delete BEFORE DELETE ON "creator_ledgers"
  FOR EACH ROW EXECUTE FUNCTION prevent_creator_ledger_mutation();
