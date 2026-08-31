-- Stripe Connect SCT ledger: revenue share rules, earnings status, gift ladder, shares, gearhead threads

CREATE TABLE IF NOT EXISTS revenue_share_rules (
  id uuid PRIMARY KEY NOT NULL,
  tier text NOT NULL,
  share_bps integer NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  revenue_type text NOT NULL DEFAULT 'live_gift',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS revenue_share_rules_tier_type_idx
  ON revenue_share_rules(tier, revenue_type, effective_from);

ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING';
ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS creator_tier_at_tx text;
ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS share_bps integer;
ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS available_at timestamptz;
ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS stripe_transfer_id text;
ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS tip_side_fee_cents integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS creator_earnings_status_idx ON creator_earnings(user_id, status);
CREATE INDEX IF NOT EXISTS creator_earnings_available_at_idx ON creator_earnings(status, available_at);

-- Joe gift ladder (upsert by slug); soft-deactivate legacy catalog items
INSERT INTO gift_catalog (id, slug, name, coin_cost, animation_key, sort_order, active)
VALUES
  ('01900000-0000-7000-8000-000000000011', 'lug_nut', 'Lug Nut', 1, 'lug_nut', 1, 'true'),
  ('01900000-0000-7000-8000-000000000012', 'wrench', 'Wrench', 10, 'wrench', 2, 'true'),
  ('01900000-0000-7000-8000-000000000013', 'burnout', 'Burnout', 50, 'burnout', 3, 'true'),
  ('01900000-0000-7000-8000-000000000014', 'fuel_up', 'Fuel Up', 100, 'fuel_up', 4, 'true'),
  ('01900000-0000-7000-8000-000000000015', 'checkered_flag', 'Checkered Flag', 250, 'checkered_flag', 5, 'true'),
  ('01900000-0000-7000-8000-000000000016', 'rev_it', 'Rev It', 500, 'rev_it', 6, 'true'),
  ('01900000-0000-7000-8000-000000000017', 'hot_lap', 'Hot Lap', 1000, 'hot_lap', 7, 'true'),
  ('01900000-0000-7000-8000-000000000018', 'green_light', 'Green Light', 2500, 'green_light', 8, 'true'),
  ('01900000-0000-7000-8000-000000000019', 'podium', 'Podium', 5000, 'podium', 9, 'true'),
  ('01900000-0000-7000-8000-00000000001a', 'supercar', 'Supercar', 10000, 'supercar', 10, 'true'),
  ('01900000-0000-7000-8000-00000000001b', 'track_day', 'Track Day', 20000, 'track_day', 11, 'true'),
  ('01900000-0000-7000-8000-00000000001c', 'garage_legend', 'Garage Legend', 30000, 'garage_legend', 12, 'true'),
  ('01900000-0000-7000-8000-00000000001d', 'king_of_the_garage', 'King of the Garage', 45000, 'king_of_the_garage', 13, 'true')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  coin_cost = EXCLUDED.coin_cost,
  animation_key = EXCLUDED.animation_key,
  sort_order = EXCLUDED.sort_order,
  active = 'true',
  updated_at = now();

UPDATE gift_catalog
SET active = 'false', updated_at = now()
WHERE slug IN ('oil_can', 'turbo', 'engine') AND active = 'true';

INSERT INTO revenue_share_rules (id, tier, share_bps, effective_from, revenue_type)
VALUES
  ('01900000-0000-7000-8000-000000000021', 'amateur', 1000, '2020-01-01T00:00:00Z', 'live_gift'),
  ('01900000-0000-7000-8000-000000000022', 'gearhead', 1500, '2020-01-01T00:00:00Z', 'live_gift'),
  ('01900000-0000-7000-8000-000000000023', 'racing_pro', 2000, '2020-01-01T00:00:00Z', 'live_gift'),
  ('01900000-0000-7000-8000-000000000024', 'pro', 3000, '2020-01-01T00:00:00Z', 'live_gift')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS shares (
  id uuid PRIMARY KEY NOT NULL,
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  share_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shares_sender_idx ON shares(sender_user_id);
CREATE INDEX IF NOT EXISTS shares_object_idx ON shares(object_type, object_id);

CREATE TABLE IF NOT EXISTS share_recipients (
  id uuid PRIMARY KEY NOT NULL,
  share_id uuid NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS share_recipients_share_idx ON share_recipients(share_id);
CREATE INDEX IF NOT EXISTS share_recipients_user_idx ON share_recipients(recipient_user_id);

CREATE TABLE IF NOT EXISTS gearhead_threads (
  id uuid PRIMARY KEY NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gearhead_threads_user_idx ON gearhead_threads(user_id);

CREATE TABLE IF NOT EXISTS gearhead_messages (
  id uuid PRIMARY KEY NOT NULL,
  thread_id uuid NOT NULL REFERENCES gearhead_threads(id) ON DELETE CASCADE,
  role text NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gearhead_messages_thread_idx ON gearhead_messages(thread_id);
