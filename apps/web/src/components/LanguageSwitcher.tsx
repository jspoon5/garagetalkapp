import { useTranslation } from "react-i18next";
import { canonicalLanguage, supportedLanguages, type SupportedLanguage } from "../i18n";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = canonicalLanguage(i18n.resolvedLanguage ?? i18n.language) ?? "en";

  return (
    <label className="mt-3 flex flex-col gap-1 text-sm text-slate-300">
      <span>{t("i18n.languageLabel")}</span>
      <select
        className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
        value={current}
        onChange={(event) => void i18n.changeLanguage(event.target.value as SupportedLanguage)}
      >
        {supportedLanguages.map((language) => (
          <option key={language} value={language}>
            {t(language === "en" ? "i18n.english" : "i18n.spanish")}
          </option>
        ))}
      </select>
    </label>
  );
}
