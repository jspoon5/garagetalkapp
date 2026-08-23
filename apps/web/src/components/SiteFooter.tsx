import { useTranslation } from "react-i18next";
import { LEGAL_ENTITY, MIN_AGE_LABEL } from "../legal/documents";

export function SiteFooter({
  onOpenPrivacy,
  onOpenTerms,
}: {
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
}) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  return (
    <footer className="site-legal-footer" aria-label={t("legal.footerLabel")}>
      <div className="site-legal-links">
        <button type="button" className="inline-link" onClick={onOpenPrivacy}>
          {t("legal.privacyPolicy")}
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" className="inline-link" onClick={onOpenTerms}>
          {t("legal.termsOfUse")}
        </button>
        <span aria-hidden="true">·</span>
        <span>{t("legal.ageOnly", { age: MIN_AGE_LABEL })}</span>
      </div>
      <p>{t("legal.copyright", { year, entity: LEGAL_ENTITY, age: MIN_AGE_LABEL })}</p>
    </footer>
  );
}
