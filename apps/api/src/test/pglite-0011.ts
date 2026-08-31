export const PGlite_0011_SQL = `
  ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING';
  ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS creator_tier_at_tx text;
  ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS share_bps integer;
  ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS available_at timestamptz;
  ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS stripe_transfer_id text;
  ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS tip_side_fee_cents integer NOT NULL DEFAULT 0;

  CREATE TABLE IF NOT EXISTS revenue_share_rules (
    id uuid PRIMARY KEY,
    tier text NOT NULL,
    share_bps integer NOT NULL,
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_until timestamptz,
    revenue_type text NOT NULL DEFAULT 'live_gift',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS shares (
    id uuid PRIMARY KEY,
    sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_type text NOT NULL,
    object_id uuid NOT NULL,
    share_type text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS shares_sender_idx ON shares(sender_user_id);
  CREATE INDEX IF NOT EXISTS shares_object_idx ON shares(object_type, object_id);

  CREATE TABLE IF NOT EXISTS share_recipients (
    id uuid PRIMARY KEY,
    share_id uuid NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS gearhead_threads (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
    title text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS gearhead_threads_user_idx ON gearhead_threads(user_id);

  CREATE TABLE IF NOT EXISTS gearhead_messages (
    id uuid PRIMARY KEY,
    thread_id uuid NOT NULL REFERENCES gearhead_threads(id) ON DELETE CASCADE,
    role text NOT NULL,
    content jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS gearhead_messages_thread_idx ON gearhead_messages(thread_id);

  ALTER TABLE gift_catalog ADD COLUMN IF NOT EXISTS active text NOT NULL DEFAULT 'true';
`;
