import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Database } from "@garagetalk/db";
import * as schema from "@garagetalk/db";
import { AuthService } from "./services/auth-service.js";

describe("AuthService", () => {
  let client: PGlite;
  let auth: AuthService;

  beforeAll(async () => {
    client = new PGlite();
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
    `);
    auth = new AuthService(db);
  });

  afterAll(async () => {
    await client.close();
  });

  it("register login session profile delete", async () => {
    const { user, sessionToken } = await auth.register({
      email: "a@example.com",
      username: "alpha",
      password: "correct-horse-battery",
    });
    expect(user.username).toBe("alpha");
    expect(sessionToken.length).toBeGreaterThan(10);

    const me = await auth.getUserBySession(sessionToken);
    expect(me?.username).toBe("alpha");

    const updated = await auth.updateProfile(user.id, { cityText: "Austin" });
    expect(updated?.cityText).toBe("Austin");

    const login = await auth.login({ username: "alpha", password: "correct-horse-battery" });
    expect(login?.user.username).toBe("alpha");

    await auth.softDeleteAccount(user.id);
    const after = await auth.getUserBySession(sessionToken);
    expect(after).toBeNull();
  });

  it("ensureAmateurTester creates then resets a broken password without admin", async () => {
    const created = await auth.ensureAmateurTester({
      email: "tester@garagetalk.app",
      username: "tester",
      password: "GarageTalkTest1",
    });
    expect(created.username).toBe("tester");
    expect(created.tier).toBe("amateur");
    expect(created.email).toBe("tester@garagetalk.app");

    await auth.register({
      email: "tester2@garagetalk.app",
      username: "tester2",
      password: "old-password-that-is-long",
    });
    const repaired = await auth.ensureAmateurTester({
      email: "tester2@garagetalk.app",
      username: "tester2",
      password: "GarageTalkTest1",
    });
    expect(repaired.tier).toBe("amateur");

    const login = await auth.login({ username: "tester2", password: "GarageTalkTest1" });
    expect(login?.user.username).toBe("tester2");
    expect(login?.user.tier).toBe("amateur");

    const again = await auth.ensureAmateurTester({
      email: "tester@garagetalk.app",
      username: "tester",
      password: "GarageTalkTest1",
    });
    expect(again.id).toBe(created.id);
    const firstLogin = await auth.login({ username: "tester", password: "GarageTalkTest1" });
    expect(firstLogin?.user.id).toBe(created.id);
  });
});
