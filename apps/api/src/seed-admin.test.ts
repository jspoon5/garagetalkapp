import { describe, expect, it, afterEach } from "vitest";
import { AuthService } from "./services/auth-service.js";
import { seedAdminFromEnv, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_USERNAME } from "./seed-admin.js";
import { createTestDb } from "./test/pglite.js";

describe("admin seed", () => {
  const previous = {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    username: process.env.ADMIN_USERNAME,
  };

  afterEach(() => {
    restore("ADMIN_EMAIL", previous.email);
    restore("ADMIN_PASSWORD", previous.password);
    restore("ADMIN_USERNAME", previous.username);
  });

  it("creates Joe as the standard operator when only ADMIN_PASSWORD is set", async () => {
    const ctx = await createTestDb();
    const auth = new AuthService(ctx.db);
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_USERNAME;
    process.env.ADMIN_PASSWORD = "JoeOperatorPassword1";

    const username = await seedAdminFromEnv(auth);
    expect(username).toBe(DEFAULT_ADMIN_USERNAME);

    const login = await auth.login({
      username: DEFAULT_ADMIN_USERNAME,
      password: "JoeOperatorPassword1",
    });
    expect(login?.user.email).toBe(DEFAULT_ADMIN_EMAIL);
    expect(login?.user.roles).toContain("admin");
    await ctx.client.close();
  });

  it("does nothing without a usable ADMIN_PASSWORD", async () => {
    const ctx = await createTestDb();
    const auth = new AuthService(ctx.db);
    process.env.ADMIN_EMAIL = "joe@garagetalk.app";
    process.env.ADMIN_USERNAME = "joe";
    delete process.env.ADMIN_PASSWORD;

    expect(await seedAdminFromEnv(auth)).toBeNull();
    expect(await auth.login({ username: "joe", password: "anything-long" })).toBeNull();
    await ctx.client.close();
  });
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
