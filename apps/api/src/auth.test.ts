import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Database } from "@garagetalk/db";
import * as schema from "@garagetalk/db";
import { buildApp } from "./app.js";
import { getRouteManifest } from "./routes-manifest.js";
import { registerBody } from "./test/register-body.js";

describe("auth HTTP loop", () => {
  let client: PGlite;
  let app: Awaited<ReturnType<typeof buildApp>>;

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
    `);
    app = await buildApp({
      db,
      trustedOrigins: ["http://localhost:5173"],
    });
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it("signup → profile → export → deletion", async () => {
    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: registerBody({
        email: "founder@example.com",
        username: "founder",
      }),
    });
    expect(reg.statusCode).toBe(200);
    const setCookie = reg.headers["set-cookie"];
    expect(setCookie).toBeTruthy();
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0]! : String(setCookie);
    // pass only name=value portion
    const pair = cookieHeader.split(";")[0]!;
    expect(pair.startsWith("gt_session=")).toBe(true);

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: pair },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe("founder");

    const profile = await app.inject({
      method: "PATCH",
      url: "/auth/profile",
      headers: { cookie: pair },
      payload: { bio: "wrench life", cityText: "Detroit" },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().user.cityText).toBe("Detroit");

    const exported = await app.inject({
      method: "GET",
      url: "/auth/export",
      headers: { cookie: pair },
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().user.email).toBe("founder@example.com");

    const del = await app.inject({
      method: "POST",
      url: "/auth/delete-account",
      headers: { cookie: pair },
    });
    expect(del.statusCode).toBe(200);

    const meAfter = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: pair },
    });
    expect(meAfter.statusCode).toBe(401);

    const routes = getRouteManifest();
    expect(routes.some((r) => r.url === "/auth/register")).toBe(true);
  });

  it("rejects registration for users under 13", async () => {
    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "child@example.com",
        username: "childuser",
        password: "correct-horse-battery",
        birthYear: new Date().getUTCFullYear() - 10,
        ageConfirmed: true,
      },
    });
    expect(reg.statusCode).toBe(400);
    expect(reg.json().error).toBe("underage");
  });

  it("health endpoints", async () => {
    const hz = await app.inject({ method: "GET", url: "/healthz" });
    expect(hz.statusCode).toBe(200);
    const rz = await app.inject({ method: "GET", url: "/readyz" });
    expect(rz.statusCode).toBe(200);
  });
});
