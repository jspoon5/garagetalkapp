import type { AuthService } from "./services/auth-service.js";

/** Hardcoded amateur testers for live QA. Kept off the web bundle. */
export const HARDCODED_AMATEUR_TESTERS = [
  { username: "tester", email: "tester@garagetalk.app", password: "GarageTalkTest1" },
  { username: "tester2", email: "tester2@garagetalk.app", password: "GarageTalkTest1" },
  // Joe's QA account — boot seed repairs password if a prior probe locked the email.
  {
    username: "101_garage",
    email: "garagegroupholdings@outlook.com",
    password: "GarageTalkTest1",
  },
] as const;

export async function seedHardcodedAmateurTesters(auth: AuthService): Promise<string[]> {
  const usernames: string[] = [];
  for (const tester of HARDCODED_AMATEUR_TESTERS) {
    const user = await auth.ensureAmateurTester(tester);
    usernames.push(user.username);
  }
  return usernames;
}
