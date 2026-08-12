import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";

export const LANGUAGE_STORAGE_KEY = "garagetalk.language";
export const supportedLanguages = ["en", "es"] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

type LanguageHost = {
  localStorage?: Pick<Storage, "getItem" | "setItem">;
  navigator?: { language?: string; languages?: readonly string[] };
};

const resources = {
  en: { translation: en },
  es: { translation: es },
};

export function canonicalLanguage(language: string | null | undefined): SupportedLanguage | null {
  const base = language?.toLowerCase().split("-")[0];
  return supportedLanguages.find((supported) => supported === base) ?? null;
}

export function detectInitialLanguage(host: LanguageHost | undefined = browserHost()): SupportedLanguage {
  const stored = readStoredLanguage(host);
  if (stored) return stored;
  const browserLanguages = host?.navigator?.languages ?? [];
  for (const language of [...browserLanguages, host?.navigator?.language]) {
    const canonical = canonicalLanguage(language);
    if (canonical) return canonical;
  }
  return "en";
}

export function persistLanguage(language: string, host: LanguageHost | undefined = browserHost()): void {
  const canonical = canonicalLanguage(language);
  if (!canonical) return;
  try {
    host?.localStorage?.setItem(LANGUAGE_STORAGE_KEY, canonical);
  } catch {
    // Storage can be unavailable in private browsing or server-side tests.
  }
}

export function initI18n() {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources,
      lng: detectInitialLanguage(),
      fallbackLng: "en",
      supportedLngs: supportedLanguages,
      interpolation: { escapeValue: false },
    });
    i18n.on("languageChanged", (language) => persistLanguage(language));
  }
  return i18n;
}

function readStoredLanguage(host: LanguageHost | undefined) {
  try {
    return canonicalLanguage(host?.localStorage?.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function browserHost(): LanguageHost | undefined {
  return typeof window === "undefined" ? undefined : window;
}

export default i18n;
