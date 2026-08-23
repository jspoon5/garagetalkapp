import { LEGAL_EFFECTIVE_DATE, LEGAL_ENTITY, type LegalSection } from "../legal/documents";

export function LegalDocumentScreen({
  title,
  sections,
  onClose,
}: {
  title: string;
  sections: LegalSection[];
  onClose: () => void;
}) {
  return (
    <article className="legal-document">
      <header className="legal-document-header">
        <span>{LEGAL_ENTITY}</span>
        <h1>{title}</h1>
        <p>Effective {LEGAL_EFFECTIVE_DATE}</p>
      </header>
      {sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </section>
      ))}
      <button type="button" className="sell-button" onClick={onClose}>
        Close
      </button>
    </article>
  );
}
