import { describe, expect, it } from "vitest";
import { isValidUsername, suggestUsernameFromEmail } from "./username.js";

describe("username helpers", () => {
  it("rejects email-shaped usernames", () => {
    expect(isValidUsername("garagegroupholdings@outlook.com")).toBe(false);
    expect(isValidUsername("valid_user123")).toBe(true);
  });

  it("suggests a username from email", () => {
    expect(suggestUsernameFromEmail("garagegroupholdings@outlook.com")).toBe("garagegroupholdings");
    expect(suggestUsernameFromEmail("a@b.com")).toBe("auser");
  });
});
