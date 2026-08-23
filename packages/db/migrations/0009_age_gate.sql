ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birth_year" integer;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age_verified_at" timestamptz;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "privacy_policy_accepted_at" timestamptz;
