import { describe, expect, it } from "vitest";
import en from "./locales/en.json";

describe("i18n seed", () => {
  it("has canonical english keys", () => {
    expect(en.home.title).toBeTruthy();
    expect(en.auth.deleteAccount).toBeTruthy();
  });
});
