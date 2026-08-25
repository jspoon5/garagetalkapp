import { describe, expect, it } from "vitest";
import { isValidUsername, suggestUsernameFromEmail } from "./username.js";

describe("username helpers", () => {
  it("allows emails and other free-form usernames", () => {
    expect(isValidUsername("garagegroupholdings@outlook.com")).toBe(true);
    expect(isValidUsername("valid_user123")).toBe(true);
    expect(isValidUsername("Joe's Garage!")).toBe(true);
    expect(isValidUsername("")).toBe(false);
    expect(isValidUsername("   ")).toBe(false);
  });

  it("suggests the email as the username", () => {
    expect(suggestUsernameFromEmail("garagegroupholdings@outlook.com")).toBe(
      "garagegroupholdings@outlook.com",
    );
  });
});
