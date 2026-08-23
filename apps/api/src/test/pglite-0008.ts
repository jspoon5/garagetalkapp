export const PGlite_0008_SQL = `
  DO $$ BEGIN
    CREATE TYPE entitlement_provider AS ENUM ('stripe', 'google_play', 'apple', 'manual');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;

  DO $$ BEGIN
    CREATE TYPE guest_request_status AS ENUM ('pending', 'approved', 'declined', 'expired');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;

  ALTER TYPE live_role ADD VALUE IF NOT EXISTS 'guest';

  CREATE TABLE IF NOT EXISTS entitlements (
    id uuid PRIMARY KEY,
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
  CREATE UNIQUE INDEX IF NOT EXISTS entitlements_provider_sub_uidx
    ON entitlements(provider, provider_subscription_id)
    WHERE provider_subscription_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS coin_wallets (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance_coins integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS coin_ledger (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta_coins integer NOT NULL,
    balance_after integer NOT NULL,
    entry_type text NOT NULL,
    reference_type text,
    reference_id uuid,
    idempotency_key text UNIQUE,
    stripe_payment_intent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS gift_catalog (
    id uuid PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    coin_cost integer NOT NULL,
    animation_key text NOT NULL DEFAULT 'default',
    sort_order integer NOT NULL DEFAULT 0,
    active text NOT NULL DEFAULT 'true',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO gift_catalog (id, slug, name, coin_cost, animation_key, sort_order)
  VALUES
    ('01900000-0000-7000-8000-000000000001', 'wrench', 'Wrench', 10, 'wrench', 1),
    ('01900000-0000-7000-8000-000000000002', 'oil_can', 'Oil Can', 50, 'oil_can', 2)
  ON CONFLICT (slug) DO NOTHING;

  CREATE TABLE IF NOT EXISTS live_gifts (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gift_id uuid NOT NULL REFERENCES gift_catalog(id) ON DELETE RESTRICT,
    coin_cost integer NOT NULL,
    creator_share_cents integer NOT NULL,
    idempotency_key text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS creator_earnings (
    id uuid PRIMARY KEY,
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

  CREATE TABLE IF NOT EXISTS creator_payout_accounts (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_connect_account_id text,
    charges_enabled text NOT NULL DEFAULT 'false',
    payouts_enabled text NOT NULL DEFAULT 'false',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS live_guest_requests (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message text,
    status guest_request_status NOT NULL DEFAULT 'pending',
    decided_at timestamptz,
    decided_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(session_id, user_id)
  );
`;
