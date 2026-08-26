-- Video visibility: draft (owner only), public, private (owner only)

ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'draft';

-- Existing ready uploads were effectively public in the old feed; keep them visible.
UPDATE "videos" SET "visibility" = 'public' WHERE "status" = 'ready' AND "visibility" = 'draft';

CREATE INDEX IF NOT EXISTS "videos_visibility_idx" ON "videos" ("visibility");
