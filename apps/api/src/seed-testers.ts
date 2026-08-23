import { eq } from "drizzle-orm";
import { users, type Database } from "@garagetalk/db";
import type { AuthService } from "./services/auth-service.js";
import type { EntitlementService } from "./services/entitlement-service.js";

/** Hardcoded testers for live QA. Kept off the web bundle. */
export const HARDCODED_AMATEUR_TESTERS = [
  { username: "tester", email: "tester@garagetalk.app", password: "GarageTalkTest1" },
  { username: "tester2", email: "tester2@garagetalk.app", password: "GarageTalkTest1" },
] as const;

/** Existing tester Joe uses for paid-feature QA. Granted Pro once via manual entitlement. */
export const TESTER_PRO_EMAIL = "tester@garagetalk.app";

export async function seedHardcodedAmateurTesters(auth: AuthService): Promise<string[]> {
  const usernames: string[] = [];
  for (const tester of HARDCODED_AMATEUR_TESTERS) {
    const user = await auth.ensureAmateurTester(tester);
    usernames.push(user.username);
  }
  return usernames;
}

/**
 * One-time Pro grant for the primary tester. If a manual entitlement already
 * exists (including a later admin revoke), leave it alone so boot cannot
 * fight the dashboard.
 */
export async function seedTesterProGrant(
  db: Database,
  entitlements: EntitlementService,
): Promise<{ username: string; granted: boolean } | null> {
  const [tester] = await db.select().from(users).where(eq(users.email, TESTER_PRO_EMAIL)).limit(1);
  if (!tester) return null;
  const existing = await entitlements.findManualEntitlement(tester.id);
  if (existing) return { username: tester.username, granted: false };
  await entitlements.grantManualTier(tester.id, "pro", "active");
  return { username: tester.username, granted: true };
}
