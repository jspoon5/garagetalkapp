import { LEGAL_ENTITY, MIN_AGE_LABEL } from "../legal/documents";

export function SiteFooter({
  onOpenPrivacy,
  onOpenTerms,
}: {
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="site-legal-footer" aria-label="Legal">
      <div className="site-legal-links">
        <button type="button" className="inline-link" onClick={onOpenPrivacy}>
          Privacy Policy
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" className="inline-link" onClick={onOpenTerms}>
          Terms of Use
        </button>
        <span aria-hidden="true">·</span>
        <span>{MIN_AGE_LABEL}+ only</span>
      </div>
      <p>
        © {year} {LEGAL_ENTITY} All rights reserved. Not directed to children under {MIN_AGE_LABEL}.
      </p>
    </footer>
  );
}
