import { useTranslation } from "react-i18next";
import { canonicalLanguage, supportedLanguages, type SupportedLanguage } from "../i18n";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = canonicalLanguage(i18n.resolvedLanguage ?? i18n.language) ?? "en";

  return (
    <label className="language-switcher">
      <span>{t("i18n.languageLabel")}</span>
      <select
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
