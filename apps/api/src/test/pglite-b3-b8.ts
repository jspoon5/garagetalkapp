export const B3_B8_TEST_SQL = `
  ALTER TABLE service_records ADD COLUMN IF NOT EXISTS work text;
  ALTER TABLE service_records ADD COLUMN IF NOT EXISTS shared_fields text[] NOT NULL DEFAULT '{}';

  CREATE TABLE IF NOT EXISTS maintenance_reminders (
    id uuid PRIMARY KEY,
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    kind text NOT NULL,
    interval_months integer,
    interval_miles integer,
    next_due_at timestamptz,
    next_due_miles integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS maintenance_reminders_vehicle_idx ON maintenance_reminders(vehicle_id);

  CREATE TABLE IF NOT EXISTS shops (
    id uuid PRIMARY KEY,
    owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    about text,
    address jsonb DEFAULT '{}',
    service_area text,
    specialties text[] NOT NULL DEFAULT '{}',
    photos text[] NOT NULL DEFAULT '{}',
    credentials_media text[] NOT NULL DEFAULT '{}',
    verification_status verification_status NOT NULL DEFAULT 'unclaimed',
    veteran_owned_status verification_status NOT NULL DEFAULT 'unclaimed',
    disabled_owned_status verification_status NOT NULL DEFAULT 'unclaimed',
    review_count integer NOT NULL DEFAULT 0,
    rating_sum integer NOT NULL DEFAULT 0,
    stripe_connect_account_id text,
    charges_enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );

  CREATE TABLE IF NOT EXISTS shop_verification_requests (
    id uuid PRIMARY KEY,
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    requested_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    document_media text[] NOT NULL DEFAULT '{}',
    status verification_status NOT NULL DEFAULT 'pending',
    reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
    decision_notes text,
    appeal_of_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS shop_verification_requests_status_idx ON shop_verification_requests(status);

  CREATE TABLE IF NOT EXISTS listings (
    id uuid PRIMARY KEY,
    seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shop_id uuid REFERENCES shops(id) ON DELETE SET NULL,
    kind listing_kind NOT NULL,
    title text NOT NULL,
    description text,
    price_cents integer NOT NULL,
    condition text,
    photos text[] NOT NULL DEFAULT '{}',
    fitment jsonb DEFAULT '{}',
    provenance jsonb DEFAULT '{}',
    vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );
  CREATE INDEX IF NOT EXISTS listings_seller_idx ON listings(seller_id);
  CREATE INDEX IF NOT EXISTS listings_kind_idx ON listings(kind);
  CREATE INDEX IF NOT EXISTS listings_status_idx ON listings(status);

  CREATE TABLE IF NOT EXISTS orders (
    id uuid PRIMARY KEY,
    listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
    buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents integer NOT NULL,
    fee_cents integer NOT NULL DEFAULT 0,
    seller_net_cents integer NOT NULL DEFAULT 0,
    stripe_payment_intent text,
    state order_state NOT NULL DEFAULT 'pending',
    shipping jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS orders_buyer_idx ON orders(buyer_id);
  CREATE INDEX IF NOT EXISTS orders_seller_idx ON orders(seller_id);

  CREATE TABLE IF NOT EXISTS shop_services (
    id uuid PRIMARY KEY,
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name text NOT NULL,
    duration_min integer NOT NULL,
    price_band_low_cents integer,
    price_band_high_cents integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS availability_rules (
    id uuid PRIMARY KEY,
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    weekday integer NOT NULL,
    open_time text NOT NULL,
    close_time text NOT NULL,
    capacity integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS availability_exceptions (
    id uuid PRIMARY KEY,
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    date timestamptz NOT NULL,
    closed boolean NOT NULL DEFAULT false,
    open_time text,
    close_time text,
    capacity integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id uuid PRIMARY KEY,
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_id uuid REFERENCES shop_services(id) ON DELETE SET NULL,
    quote_id uuid,
    vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
    scheduled_at timestamptz NOT NULL,
    status booking_status NOT NULL DEFAULT 'requested',
    reminder_sent_at timestamptz,
    reminder_24h_sent_at timestamptz,
    reminder_2h_sent_at timestamptz,
    confirmed_at timestamptz,
    cancelled_at timestamptz,
    no_show_at timestamptz,
    completed_at timestamptz,
    calendar_uid text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(shop_id, scheduled_at)
  );
  CREATE INDEX IF NOT EXISTS bookings_shop_idx ON bookings(shop_id);

  CREATE TABLE IF NOT EXISTS shop_reviews (
    id uuid PRIMARY KEY,
    booking_id uuid UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    order_id uuid UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating integer NOT NULL,
    body text,
    owner_response text,
    report_status text NOT NULL DEFAULT 'none',
    appeal_status text NOT NULL DEFAULT 'none',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS supporter_badges (
    id uuid PRIMARY KEY,
    supporter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creator_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_cents integer NOT NULL DEFAULT 0,
    level text NOT NULL DEFAULT 'supporter',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(supporter_user_id, creator_user_id)
  );
  CREATE INDEX IF NOT EXISTS supporter_badges_creator_idx ON supporter_badges(creator_user_id);

  CREATE TABLE IF NOT EXISTS r2r_articles (
    id uuid PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    category text NOT NULL,
    summary text,
    body_md text NOT NULL,
    tags text[] NOT NULL DEFAULT '{}',
    author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    published boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS r2r_articles_category_idx ON r2r_articles(category);
`;
