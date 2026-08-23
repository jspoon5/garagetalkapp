import { eq } from "drizzle-orm";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { entitlements, users } from "@garagetalk/db";
import { AuthService } from "./services/auth-service.js";
import { EntitlementService } from "./services/entitlement-service.js";
import {
  HARDCODED_AMATEUR_TESTERS,
  TESTER_PRO_EMAIL,
  seedHardcodedAmateurTesters,
  seedTesterProGrant,
} from "./seed-testers.js";
import { createTestDb } from "./test/pglite.js";

describe("tester seed", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let auth: AuthService;
  let entitlementsService: EntitlementService;

  beforeAll(async () => {
    ctx = await createTestDb();
    auth = new AuthService(ctx.db);
    entitlementsService = new EntitlementService(ctx.db);
  });

  afterAll(async () => {
    await ctx.client.close();
  });

  it("creates testers and grants Pro once to the primary tester", async () => {
    const usernames = await seedHardcodedAmateurTesters(auth);
    expect(usernames).toEqual(HARDCODED_AMATEUR_TESTERS.map((tester) => tester.username));

    const first = await seedTesterProGrant(ctx.db, entitlementsService);
    expect(first).toEqual({ username: "tester", granted: true });

    const [tester] = await ctx.db.select().from(users).where(eq(users.email, TESTER_PRO_EMAIL));
    expect(tester?.tier).toBe("pro");
    const resolved = await entitlementsService.resolveForUser(tester!.id);
    expect(resolved?.effectiveTier).toBe("pro");

    const second = await seedTesterProGrant(ctx.db, entitlementsService);
    expect(second).toEqual({ username: "tester", granted: false });

    await entitlementsService.grantManualTier(tester!.id, "amateur", "canceled");
    const afterRevoke = await seedTesterProGrant(ctx.db, entitlementsService);
    expect(afterRevoke).toEqual({ username: "tester", granted: false });
    const stillRevoked = await entitlementsService.resolveForUser(tester!.id);
    expect(stillRevoked?.effectiveTier).toBe("amateur");

    const [tester2] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.email, "tester2@garagetalk.app"));
    expect(tester2?.tier).toBe("amateur");
    const [manual] = await ctx.db.select().from(entitlements).where(eq(entitlements.userId, tester2!.id));
    expect(manual).toBeUndefined();
  });
});
