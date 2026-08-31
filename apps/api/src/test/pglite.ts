import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Database } from "@garagetalk/db";
import * as schema from "@garagetalk/db";
import { B3_B8_TEST_SQL } from "./pglite-b3-b8.js";
import { C1_C6_TEST_SQL } from "./pglite-c1-c6.js";
import { D1_D11_TEST_SQL } from "./pglite-d1-d11.js";
import { MEDIA_QUALIFIED_TEST_SQL } from "./pglite-media-qualified.js";
import { PGlite_0008_SQL } from "./pglite-0008.js";
import { PGlite_0011_SQL } from "./pglite-0011.js";

export async function createTestDb(): Promise<{ client: PGlite; db: Database }> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;
  await client.exec(`
    CREATE TYPE subscription_tier AS ENUM ('amateur','gearhead','racing_pro','pro');
    CREATE TYPE subscription_status AS ENUM ('active','canceled','past_due','trialing');
    CREATE TYPE avatar_type AS ENUM ('color','image','animated');
    CREATE TYPE auth_token_type AS ENUM ('verify_email','password_reset','stream_webhook');
    CREATE TYPE room_kind AS ENUM ('topic','spatial','pit_crew','class');
    CREATE TYPE live_kind AS ENUM ('stream','class','office_hours');
    CREATE TYPE live_role AS ENUM ('host','mod','viewer');
    CREATE TYPE ledger_entry_type AS ENUM ('tip','membership','course_sale','view_payout','adjustment');
    CREATE TYPE listing_kind AS ENUM ('part','vehicle','tool','accessory','service');
    CREATE TYPE order_state AS ENUM ('pending','paid','shipped','delivered','disputed','refunded');
    CREATE TYPE booking_status AS ENUM ('requested','confirmed','completed','cancelled','no_show');
    CREATE TYPE verification_status AS ENUM ('unclaimed','pending','verified','rejected');

    CREATE TABLE users (
      id uuid PRIMARY KEY,
      email text NOT NULL UNIQUE,
      username text NOT NULL UNIQUE,
      phone text UNIQUE,
      password_hash text,
      legacy_hash text,
      avatar_type avatar_type NOT NULL DEFAULT 'color',
      avatar_value text NOT NULL DEFAULT '#3b82f6',
      bio text,
      city_text text,
      location_lat numeric(9,6),
      location_lng numeric(9,6),
      location_consent_at timestamptz,
      roles text[] NOT NULL DEFAULT '{}',
      tier subscription_tier NOT NULL DEFAULT 'amateur',
      tier_status subscription_status NOT NULL DEFAULT 'active',
      stripe_customer_id text,
      ai_month_usage integer NOT NULL DEFAULT 0,
      ai_month_reset_at timestamptz DEFAULT now(),
      admin_totp_secret text,
      suspended_at timestamptz,
      email_verified_at timestamptz,
      birth_year integer,
      age_verified_at timestamptz,
      privacy_policy_accepted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE TABLE sessions (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      user_agent text,
      ip_hash text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE passkeys (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id text NOT NULL UNIQUE,
      public_key text NOT NULL,
      counter integer NOT NULL DEFAULT 0,
      transports text[] NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE auth_tokens (
      id uuid PRIMARY KEY,
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      type auth_token_type NOT NULL,
      token_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX auth_tokens_user_idx ON auth_tokens(user_id);
    CREATE INDEX auth_tokens_hash_idx ON auth_tokens(token_hash);

    CREATE TABLE follows (
      follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      followee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(follower_id, followee_id)
    );
    CREATE INDEX follows_followee_idx ON follows(followee_id);

    CREATE TABLE vehicles (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type text NOT NULL,
      fuel_type text NOT NULL,
      make text NOT NULL,
      model text NOT NULL,
      year integer NOT NULL,
      trim text,
      vin text,
      vin_decoded jsonb,
      nickname text,
      is_primary boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0,
      photos text[] NOT NULL DEFAULT '{}',
      privacy text NOT NULL DEFAULT 'private',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE TABLE service_records (
      id uuid PRIMARY KEY,
      vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      date timestamptz NOT NULL,
      mileage integer,
      kind text NOT NULL,
      title text NOT NULL,
      notes text,
      parts jsonb NOT NULL DEFAULT '[]',
      cost_cents integer,
      receipt_media text[] NOT NULL DEFAULT '{}',
      attested_by_shop_id uuid,
      attestation jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE INDEX service_records_vehicle_idx ON service_records(vehicle_id);

    CREATE TABLE posts (
      id uuid PRIMARY KEY,
      author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body text NOT NULL,
      media_type text NOT NULL DEFAULT 'text',
      media text[] NOT NULL DEFAULT '{}',
      vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
      shared_post_id uuid,
      visibility text NOT NULL DEFAULT 'public',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE INDEX posts_author_idx ON posts(author_id);
    CREATE INDEX posts_vehicle_idx ON posts(vehicle_id);
    CREATE INDEX posts_created_idx ON posts(created_at);

    CREATE TABLE post_comments (
      id uuid PRIMARY KEY,
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id uuid,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE TABLE reactions (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_type text NOT NULL,
      subject_id uuid NOT NULL,
      kind text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, subject_type, subject_id)
    );
    CREATE INDEX reactions_subject_idx ON reactions(subject_type, subject_id);

    CREATE TABLE videos (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text,
      category text NOT NULL,
      tags text[] NOT NULL DEFAULT '{}',
      stream_asset_id text,
      status text NOT NULL DEFAULT 'processing',
      visibility text NOT NULL DEFAULT 'draft',
      duration_seconds integer,
      thumb_url text,
      custom_thumb text,
      hls_url text,
      view_count integer NOT NULL DEFAULT 0,
      like_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE INDEX videos_owner_idx ON videos(owner_id);
    CREATE INDEX videos_category_idx ON videos(category);

    CREATE TABLE video_likes (
      id uuid PRIMARY KEY,
      video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, video_id)
    );
    CREATE INDEX video_likes_video_idx ON video_likes(video_id);

    CREATE TABLE video_comments (
      id uuid PRIMARY KEY,
      video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id uuid,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE INDEX video_comments_video_idx ON video_comments(video_id);

    CREATE TABLE podcast_shows (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text,
      cover_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE TABLE podcast_episodes (
      id uuid PRIMARY KEY,
      show_id uuid NOT NULL REFERENCES podcast_shows(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text,
      media_asset_id text,
      status text NOT NULL DEFAULT 'processing',
      audio_url text,
      artwork_url text,
      duration_seconds integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE INDEX podcast_episodes_show_idx ON podcast_episodes(show_id);

    CREATE TABLE podcast_comments (
      id uuid PRIMARY KEY,
      episode_id uuid NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id uuid,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE TABLE discussion_threads (
      id uuid PRIMARY KEY,
      episode_id uuid REFERENCES podcast_episodes(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE TABLE view_heartbeats (
      id uuid PRIMARY KEY,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      session_id text NOT NULL,
      media_type text NOT NULL,
      media_id uuid NOT NULL,
      view_date text NOT NULL,
      position_seconds integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, media_id, view_date)
    );
    CREATE INDEX view_heartbeats_media_idx ON view_heartbeats(media_type, media_id);

    CREATE TABLE recently_watched (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      position_seconds integer NOT NULL DEFAULT 0,
      last_watched_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, video_id)
    );
    CREATE INDEX recently_watched_user_idx ON recently_watched(user_id);

    CREATE TABLE media_assets (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind text NOT NULL,
      mime_type text NOT NULL,
      size_bytes integer NOT NULL,
      storage_key text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      public_url text,
      exif_stripped boolean NOT NULL DEFAULT false,
      metadata jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX media_assets_owner_idx ON media_assets(owner_id);

    CREATE TABLE chat_rooms (
      id uuid PRIMARY KEY,
      kind room_kind NOT NULL DEFAULT 'topic',
      title text NOT NULL,
      owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
      map_point jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE INDEX chat_rooms_kind_idx ON chat_rooms(kind);

    CREATE TABLE room_members (
      id uuid PRIMARY KEY,
      room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'member',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(room_id, user_id)
    );
    CREATE INDEX room_members_room_idx ON room_members(room_id);

    CREATE TABLE messages (
      id uuid PRIMARY KEY,
      room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body text NOT NULL,
      media text[] NOT NULL DEFAULT '{}',
      reply_to_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE INDEX messages_room_idx ON messages(room_id);

    CREATE TABLE live_sessions (
      id uuid PRIMARY KEY,
      host_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_name text NOT NULL,
      title text,
      kind live_kind NOT NULL DEFAULT 'stream',
      scheduled_at timestamptz,
      reminder_sent_at timestamptz,
      started_at timestamptz,
      ended_at timestamptz,
      rtmp_enabled text NOT NULL DEFAULT 'false',
      rtmp_ingest_url text,
      rtmp_stream_key text,
      recording_state text NOT NULL DEFAULT 'idle',
      recording_asset_id text,
      recording_replay_url text,
      recording_error text,
      chapter_marks jsonb NOT NULL DEFAULT '[]',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX live_sessions_host_idx ON live_sessions(host_id);

    CREATE TABLE live_roles (
      id uuid PRIMARY KEY,
      session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role live_role NOT NULL DEFAULT 'viewer',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(session_id, user_id)
    );
    CREATE INDEX live_roles_session_idx ON live_roles(session_id);

    CREATE TABLE subscriptions (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier subscription_tier NOT NULL,
      status subscription_status NOT NULL DEFAULT 'active',
      stripe_subscription_id text,
      stripe_price_id text,
      current_period_end timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX subscriptions_user_idx ON subscriptions(user_id);

    CREATE TABLE tips (
      id uuid PRIMARY KEY,
      from_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_type text,
      subject_id uuid,
      amount_cents integer NOT NULL,
      application_fee_cents integer NOT NULL DEFAULT 0,
      stripe_payment_intent text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE creator_ledgers (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_type ledger_entry_type NOT NULL,
      amount_cents integer NOT NULL,
      gross_amount_cents integer,
      application_fee_cents integer NOT NULL DEFAULT 0,
      subject_type text,
      subject_id uuid,
      stripe_payment_intent text,
      balance_after integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX creator_ledgers_user_idx ON creator_ledgers(user_id);

    CREATE TABLE reports (
      id uuid PRIMARY KEY,
      reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_type text NOT NULL,
      subject_id uuid NOT NULL,
      reason text NOT NULL,
      status text NOT NULL DEFAULT 'open',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX reports_status_idx ON reports(status);

    CREATE TABLE moderation_actions (
      id uuid PRIMARY KEY,
      report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action text NOT NULL,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE audit_logs (
      id uuid PRIMARY KEY,
      admin_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action text NOT NULL,
      subject_type text,
      subject_id uuid,
      before jsonb,
      after jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX audit_logs_admin_idx ON audit_logs(admin_id);

    CREATE TABLE feature_flags (
      id uuid PRIMARY KEY,
      key text NOT NULL UNIQUE,
      enabled text NOT NULL DEFAULT 'false',
      meta jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE webhook_events (
      id uuid PRIMARY KEY,
      source text NOT NULL,
      event_id text NOT NULL,
      processed_at timestamptz,
      payload jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(source, event_id)
    );
  `);
  await client.exec(B3_B8_TEST_SQL);
  await client.exec(MEDIA_QUALIFIED_TEST_SQL);
  await client.exec(D1_D11_TEST_SQL);
  await client.exec(C1_C6_TEST_SQL);
  await client.exec(PGlite_0008_SQL);
  await client.exec(PGlite_0011_SQL);
  return { client, db };
}
