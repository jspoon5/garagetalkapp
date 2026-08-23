import { describe, expect, it } from "vitest";
import { FIRST_PARTY_ADMIN_EMAILS, isFirstPartyAdminEmail, parseAdminEmailAllowlist } from "./first-party-admins.js";

describe("first-party admin allowlist", () => {
  it("always includes Jeremy Spoon", () => {
    expect(FIRST_PARTY_ADMIN_EMAILS).toContain("spoon.jeremy@gmail.com");
    expect(isFirstPartyAdminEmail("Spoon.Jeremy@gmail.com", {})).toBe(true);
    expect(parseAdminEmailAllowlist({})).toContain("spoon.jeremy@gmail.com");
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
    expect(isFirstPartyAdminEmail("joe@example.com", { ADMIN_EMAIL: "joe@example.com" })).toBe(true);
    expect(isFirstPartyAdminEmail("stranger@example.com", {})).toBe(false);
  });
});
