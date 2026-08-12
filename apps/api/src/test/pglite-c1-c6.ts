export const C1_C6_TEST_SQL = `
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS application_fee_cents integer NOT NULL DEFAULT 0;

  CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL,
    actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
    subject_type text,
    subject_id uuid,
    read_at timestamptz,
    payload jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id);

  CREATE TABLE IF NOT EXISTS recalls (
    id uuid PRIMARY KEY,
    campaign_id text NOT NULL UNIQUE,
    make text,
    model text,
    year integer,
    summary text,
    raw jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS recall_checks (
    id uuid PRIMARY KEY,
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    checked_at timestamptz NOT NULL DEFAULT now(),
    campaign_ids text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS recall_checks_vehicle_idx ON recall_checks(vehicle_id);

  CREATE TABLE IF NOT EXISTS recall_alerts (
    id uuid PRIMARY KEY,
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    recall_id uuid REFERENCES recalls(id) ON DELETE SET NULL,
    campaign_id text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    notified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS recall_alerts_vehicle_idx ON recall_alerts(vehicle_id);

  CREATE TABLE IF NOT EXISTS diagnostic_sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'open',
    symptom_text text,
    photos text[] NOT NULL DEFAULT '{}',
    audio_clips jsonb DEFAULT '[]',
    dtc_codes text[] NOT NULL DEFAULT '{}',
    inputs jsonb DEFAULT '{}',
    context_snapshot jsonb DEFAULT '{}',
    hypotheses jsonb DEFAULT '[]',
    follow_up_questions text[] NOT NULL DEFAULT '{}',
    safety_flags text[] NOT NULL DEFAULT '{}',
    model_meta jsonb DEFAULT '{}',
    cost_cents integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS diagnostic_sessions_user_idx ON diagnostic_sessions(user_id);

  CREATE TABLE IF NOT EXISTS diagnostic_cost_events (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
    provider text NOT NULL,
    cents integer NOT NULL,
    meta jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS repair_briefs (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
    snapshot jsonb NOT NULL,
    share_token text NOT NULL UNIQUE,
    pdf_media text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS quote_requests (
    id uuid PRIMARY KEY,
    brief_id uuid NOT NULL REFERENCES repair_briefs(id) ON DELETE CASCADE,
    city_area text NOT NULL,
    radius_miles integer NOT NULL DEFAULT 25,
    status text NOT NULL DEFAULT 'open',
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id uuid PRIMARY KEY,
    request_id uuid NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    low_cents integer NOT NULL,
    high_cents integer NOT NULL,
    notes text,
    expires_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'offered',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS fault_outcomes (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
    booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
    shop_id uuid REFERENCES shops(id) ON DELETE SET NULL,
    verified_fix text NOT NULL,
    parts jsonb DEFAULT '[]',
    input_snapshot jsonb DEFAULT '{}',
    attestation jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS obd_devices (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fingerprint text NOT NULL,
    protocol text,
    last_connected_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS obd_snapshots (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
    device_id uuid REFERENCES obd_devices(id) ON DELETE SET NULL,
    snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS obd_snapshots_session_idx ON obd_snapshots(session_id);
`;
