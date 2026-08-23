/**
 * Passkey unit/integration hybrid tests.
 * Crypto verification is stubbed (see stubVerifyRegistration/stubVerifyAuthentication) so we
 * exercise @simplewebauthn option shapes, Zod payload validation, DB credential storage,
 * and session creation without browser WebAuthn APIs.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { passkeys } from "@garagetalk/db";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";
import { stubVerifyAuthentication, stubVerifyRegistration } from "./services/passkey-service.js";

const FIXTURE = {
  credentialId: "test-cred-id-base64url",
  publicKey: Buffer.from("test-public-key-bytes").toString("base64url"),
};

function clientDataJSON(challenge: string, type: "webauthn.create" | "webauthn.get"): string {
  return Buffer.from(
    JSON.stringify({ type, challenge, origin: "http://localhost:5173" }),
    "utf8",
  ).toString("base64url");
}

describe("passkeys", () => {
  let client: Awaited<ReturnType<typeof createTestDb>>["client"];
  let db: Database;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie: string;
  let userId: string;

  beforeAll(async () => {
    const ctx = await createTestDb();
    client = ctx.client;
    db = ctx.db;
    app = await buildApp({
      db: ctx.db,
      trustedOrigins: ["http://localhost:5173"],
      passkeyVerifyHooks: {
        verifyRegistration: stubVerifyRegistration(FIXTURE),
        verifyAuthentication: stubVerifyAuthentication(2),
      },
    });

    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "passkey@example.com",
        username: "passkeyuser",
        password: "correct-horse-battery",
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    const setCookie = reg.headers["set-cookie"];
    cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
    userId = reg.json().user.id as string;
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it("register stores credential in DB", async () => {
    const optionsRes = await app.inject({
      method: "POST",
      url: "/auth/passkey/register/options",
      headers: { cookie },
    });
    expect(optionsRes.statusCode).toBe(200);
    const options = optionsRes.json().options as { challenge: string };
    expect(options.challenge).toBeTruthy();

    const verifyRes = await app.inject({
      method: "POST",
      url: "/auth/passkey/register/verify",
      headers: { cookie },
      payload: {
        id: FIXTURE.credentialId,
        rawId: FIXTURE.credentialId,
        type: "public-key",
        response: {
          clientDataJSON: clientDataJSON(options.challenge, "webauthn.create"),
          attestationObject: "stub-attestation",
          transports: ["internal"],
        },
      },
    });
    expect(verifyRes.statusCode).toBe(200);

    const rows = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.credentialId, FIXTURE.credentialId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.credentialId).toBe(FIXTURE.credentialId);
    expect(rows[0]?.userId).toBe(userId);
    expect(rows[0]?.publicKey).toBe(FIXTURE.publicKey);
  });

  it("login creates session cookie", async () => {
    const optionsRes = await app.inject({
      method: "POST",
      url: "/auth/passkey/login/options",
    });
    expect(optionsRes.statusCode).toBe(200);
    const loginChallenge = (optionsRes.json().options as { challenge: string }).challenge;

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/passkey/login/verify",
      payload: {
        id: FIXTURE.credentialId,
        rawId: FIXTURE.credentialId,
        type: "public-key",
        response: {
          clientDataJSON: clientDataJSON(loginChallenge, "webauthn.get"),
          authenticatorData: "stub-auth-data",
          signature: "stub-signature",
        },
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const setCookie = loginRes.headers["set-cookie"];
    expect(setCookie).toBeTruthy();
    const sessionCookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie);
    expect(sessionCookie).toContain("gt_session=");

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: sessionCookie.split(";")[0]! },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe("passkeyuser");
  });
});
