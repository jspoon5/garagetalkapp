import { describe, expect, it } from "vitest";
import { maxBirthYearForMinAge, meetsMinimumAge } from "./age-gate.js";

describe("age gate", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");

  it("accepts users who are at least 13 by birth year", () => {
    expect(meetsMinimumAge(2013, 13, now)).toBe(true);
    expect(meetsMinimumAge(2012, 13, now)).toBe(true);
  });

  it("rejects users under 13", () => {
    expect(meetsMinimumAge(2014, 13, now)).toBe(false);
  });

  it("computes the latest allowed birth year", () => {
    expect(maxBirthYearForMinAge(13, now)).toBe(2013);
  });
});
