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
      photos text[] NOT NULL DEFAULT '{}',
      privacy text NOT NULL DEFAULT 'private',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
  `);
  return { client, db };
}
