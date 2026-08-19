import type { ReactNode } from "react";
import { Carousel } from "../components/Carousel";
import { images } from "../images";

export const vehicleFilters = ["All", "Cars", "Trucks", "Motorcycles"] as const;

export function VehicleTile({
  image,
  title,
  subtitle,
  onClick,
}: {
  image: string;
  title: string;
  subtitle: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="vehicle-tile" onClick={onClick}>
      <img src={image} alt={`${title} community`} loading="lazy" decoding="async" />
      <div className="tile-shade" />
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </button>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  action: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-heading">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <button type="button" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

export function FilterRail({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Carousel ariaLabel="Vehicle filters" className="filter-carousel" contentClassName="filter-carousel-track">
      {vehicleFilters.map((filter) => (
        <button
          key={filter}
          type="button"
          className={value === filter ? "active" : ""}
          onClick={() => onChange(filter)}
        >
          {filter}
        </button>
      ))}
    </Carousel>
  );
}

export function ComposeSheet({
  eyebrow,
  title,
  label,
  placeholder,
  submitLabel,
  value,
  onChange,
  onClose,
  onSubmit,
  extra,
}: {
  eyebrow: string;
  title: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="sheet-scrim" role="presentation" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-labelledby="compose-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <span>{eyebrow}</span>
        <h2 id="compose-title">{title}</h2>
        <label>
          {label}
          <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required />
        </label>
        {extra}
        <button type="submit" className="sell-button sheet-cta">
          {submitLabel}
        </button>
        <button type="button" className="sheet-close" onClick={onClose}>
          Close
        </button>
      </form>
    </div>
  );
}

export { images };
