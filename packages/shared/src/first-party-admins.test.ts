import { describe, expect, it } from "vitest";
import {
  FIRST_PARTY_ADMIN_EMAILS,
  isFirstPartyAdmin,
  isFirstPartyAdminEmail,
  parseAdminEmailAllowlist,
} from "./first-party-admins.js";

describe("first-party admin allowlist", () => {
  it("always includes Jeremy Spoon by email", () => {
    expect(FIRST_PARTY_ADMIN_EMAILS).toContain("spoon.jeremy@gmail.com");
    expect(isFirstPartyAdminEmail("Spoon.Jeremy@gmail.com", {})).toBe(true);
    expect(parseAdminEmailAllowlist({})).toContain("spoon.jeremy@gmail.com");
  });

  it("admits Joe and Jeremy by username", () => {
    expect(isFirstPartyAdmin({ username: "Joe" }, {})).toBe(true);
    expect(isFirstPartyAdmin({ username: "josephbeaver" }, {})).toBe(true);
    expect(isFirstPartyAdmin({ username: "jeremy" }, {})).toBe(true);
    expect(isFirstPartyAdmin({ username: "stranger" }, {})).toBe(false);
  });

  it("merges ADMIN_EMAIL and ADMIN_EMAILS without placeholders", () => {
    const emails = parseAdminEmailAllowlist({
      ADMIN_EMAIL: "joe@example.com",
      ADMIN_EMAILS: "ops@garagetalk.app, change-me@example.com",
    });
    expect(emails).toEqual(
      expect.arrayContaining(["spoon.jeremy@gmail.com", "joe@example.com", "ops@garagetalk.app"]),
    );
    expect(emails).not.toContain("change-me@example.com");
    expect(isFirstPartyAdmin({ email: "joe@example.com" }, { ADMIN_EMAIL: "joe@example.com" })).toBe(true);
    expect(isFirstPartyAdmin({ email: "stranger@example.com" }, {})).toBe(false);
  });
});
