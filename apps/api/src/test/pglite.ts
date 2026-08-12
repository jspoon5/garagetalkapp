import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Database } from "@garagetalk/db";
import * as schema from "@garagetalk/db";

export async function createTestDb(): Promise<{ client: PGlite; db: Database }> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;
  await client.exec(`
    CREATE TYPE subscription_tier AS ENUM ('amateur','gearhead','racing_pro','pro');
    CREATE TYPE subscription_status AS ENUM ('active','canceled','past_due','trialing');
    CREATE TYPE avatar_type AS ENUM ('color','image','animated');
    CREATE TYPE auth_token_type AS ENUM ('verify_email','password_reset','stream_webhook');

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
      roles text[] NOT NULL DEFAULT '{}',
      tier subscription_tier NOT NULL DEFAULT 'amateur',
      tier_status subscription_status NOT NULL DEFAULT 'active',
      stripe_customer_id text,
      ai_month_usage integer NOT NULL DEFAULT 0,
      ai_month_reset_at timestamptz DEFAULT now(),
      email_verified_at timestamptz,
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

    CREATE TABLE videos (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text,
      category text NOT NULL,
      tags text[] NOT NULL DEFAULT '{}',
      stream_asset_id text,
      status text NOT NULL DEFAULT 'processing',
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
  return { client, db };
}
