import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { MemoryEmailClient } from "@garagetalk/email";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

describe("auth email flows", () => {
  let client: Awaited<ReturnType<typeof createTestDb>>["client"];
  let app: Awaited<ReturnType<typeof buildApp>>;
  let emailClient: MemoryEmailClient;
  let cookie: string;

  beforeAll(async () => {
    emailClient = new MemoryEmailClient();
    const ctx = await createTestDb();
    client = ctx.client;
    app = await buildApp({
      db: ctx.db,
      trustedOrigins: ["http://localhost:5173"],
      emailClient,
      appBaseUrl: "http://localhost:5173",
    });

    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "emailflow@example.com",
        username: "emailuser",
        password: "correct-horse-battery",
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    const setCookie = reg.headers["set-cookie"];
    cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it("requestEmailVerification sends HTML with token link", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/verify-email/request",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(emailClient.sent).toHaveLength(1);
    const mail = emailClient.sent[0]!;
    expect(mail.to).toBe("emailflow@example.com");
    expect(mail.html).toContain("Verify your Garage Talk email");
    expect(mail.html).toContain("/verify-email?token=");
  });

  it("confirmEmailVerification marks email verified", async () => {
    const tokenMatch = emailClient.sent[0]!.html.match(/token=([^"&]+)/);
    expect(tokenMatch?.[1]).toBeTruthy();
    const token = tokenMatch![1]!;

    const res = await app.inject({
      method: "POST",
      url: "/auth/verify-email/confirm",
      payload: { token },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.emailVerifiedAt).toBeTruthy();
  });

  it("password reset request and confirm", async () => {
    emailClient.sent.length = 0;

    const reqRes = await app.inject({
      method: "POST",
      url: "/auth/password-reset/request",
      payload: { email: "emailflow@example.com" },
    });
    expect(reqRes.statusCode).toBe(200);
    expect(emailClient.sent).toHaveLength(1);
    expect(emailClient.sent[0]!.html).toContain("Reset your Garage Talk password");
    expect(emailClient.sent[0]!.html).toContain("/reset-password?token=");

    const tokenMatch = emailClient.sent[0]!.html.match(/token=([^"&]+)/);
    const token = tokenMatch![1]!;

    const confirmRes = await app.inject({
      method: "POST",
      url: "/auth/password-reset/confirm",
      payload: { token, password: "new-horse-battery-staple" },
    });
    expect(confirmRes.statusCode).toBe(200);

    const loginOld = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "emailuser", password: "correct-horse-battery" },
    });
    expect(loginOld.statusCode).toBe(401);

    const loginNew = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "emailuser", password: "new-horse-battery-staple" },
    });
    expect(loginNew.statusCode).toBe(200);
  });
});
