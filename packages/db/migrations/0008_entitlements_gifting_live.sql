-- Entitlements, virtual gifting, guest live (Joe/Jeremy v3 major update)

DO $$ BEGIN
  CREATE TYPE entitlement_provider AS ENUM ('stripe', 'google_play', 'apple', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE live_role ADD VALUE IF NOT EXISTS 'guest';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE guest_request_status AS ENUM ('pending', 'approved', 'declined', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS entitlements (
  id uuid PRIMARY KEY NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider entitlement_provider NOT NULL,
  provider_subscription_id text,
  tier subscription_tier NOT NULL,
  status subscription_status NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  ai_monthly_allowance integer NOT NULL,
  feature_flags jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_provider_sub_uidx
  ON entitlements(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS coin_wallets (
  id uuid PRIMARY KEY NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_coins integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS coin_wallets_user_uidx ON coin_wallets(user_id);

CREATE TABLE IF NOT EXISTS coin_ledger (
  id uuid PRIMARY KEY NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta_coins integer NOT NULL,
  balance_after integer NOT NULL,
  entry_type text NOT NULL,
  reference_type text,
  reference_id uuid,
  idempotency_key text,
  stripe_payment_intent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coin_ledger_user_idx ON coin_ledger(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS coin_ledger_idempotency_uidx
  ON coin_ledger(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS gift_catalog (
  id uuid PRIMARY KEY NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  coin_cost integer NOT NULL,
  animation_key text NOT NULL DEFAULT 'default',
  sort_order integer NOT NULL DEFAULT 0,
  active text NOT NULL DEFAULT 'true',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gift_catalog_slug_uidx ON gift_catalog(slug);

CREATE TABLE IF NOT EXISTS live_gifts (
  id uuid PRIMARY KEY NOT NULL,
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gift_id uuid NOT NULL REFERENCES gift_catalog(id) ON DELETE RESTRICT,
  coin_cost integer NOT NULL,
  creator_share_cents integer NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_gifts_session_idx ON live_gifts(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS live_gifts_idempotency_uidx ON live_gifts(idempotency_key);

CREATE TABLE IF NOT EXISTS creator_earnings (
  id uuid PRIMARY KEY NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid,
  gross_cents integer NOT NULL,
  platform_fee_cents integer NOT NULL DEFAULT 0,
  net_cents integer NOT NULL,
  balance_after_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_earnings_user_idx ON creator_earnings(user_id);

CREATE TABLE IF NOT EXISTS creator_payout_accounts (
  id uuid PRIMARY KEY NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_connect_account_id text,
  charges_enabled text NOT NULL DEFAULT 'false',
  payouts_enabled text NOT NULL DEFAULT 'false',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS creator_payout_accounts_user_uidx ON creator_payout_accounts(user_id);

CREATE TABLE IF NOT EXISTS creator_payouts (
  id uuid PRIMARY KEY NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  stripe_transfer_id text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_payouts_user_idx ON creator_payouts(user_id);

CREATE TABLE IF NOT EXISTS live_guest_requests (
  id uuid PRIMARY KEY NOT NULL,
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text,
  status guest_request_status NOT NULL DEFAULT 'pending',
  decided_at timestamptz,
  decided_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_guest_requests_session_idx ON live_guest_requests(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS live_guest_requests_session_user_uidx
  ON live_guest_requests(session_id, user_id);

-- Seed gift catalog (Joe spec)
INSERT INTO gift_catalog (id, slug, name, coin_cost, animation_key, sort_order)
VALUES
  ('01900000-0000-7000-8000-000000000001', 'wrench', 'Wrench', 10, 'wrench', 1),
  ('01900000-0000-7000-8000-000000000002', 'oil_can', 'Oil Can', 50, 'oil_can', 2),
  ('01900000-0000-7000-8000-000000000003', 'turbo', 'Turbo', 250, 'turbo', 3),
  ('01900000-0000-7000-8000-000000000004', 'engine', 'Engine', 1000, 'engine', 4),
  ('01900000-0000-7000-8000-000000000005', 'garage_legend', 'Garage Legend', 5000, 'legend', 5)
ON CONFLICT (slug) DO NOTHING;
