import { describe, expect, it } from "vitest";
import { detectInitialLanguage, LANGUAGE_STORAGE_KEY, persistLanguage } from "./i18n";
import en from "./locales/en.json";
import es from "./locales/es.json";

describe("i18n seed", () => {
  it("has canonical english keys", () => {
    expect(en.home.title).toBeTruthy();
    expect(en.auth.deleteAccount).toBeTruthy();
  });

  it("scaffolds spanish with the same top-level namespaces", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it("detects browser language and persists switcher changes", () => {
    const stored = new Map<string, string>();
    const host = {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
      navigator: { languages: ["es-MX", "en-US"], language: "en-US" },
    };
    expect(detectInitialLanguage(host)).toBe("es");
    persistLanguage("en-US", host);
    expect(stored.get(LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(detectInitialLanguage(host)).toBe("en");
  });
});
