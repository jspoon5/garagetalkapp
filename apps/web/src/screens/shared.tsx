import { Carousel } from "../components/Carousel";
import { images } from "../images";

export const vehicleFilters = ["All", "Cars", "Trucks", "Motorcycles"] as const;

export function VehicleTile({ image, title, subtitle }: { image: string; title: string; subtitle: string }) {
  return (
    <button type="button" className="vehicle-tile">
      <img src={image} alt={`${title} community`} loading="lazy" decoding="async" />
      <div className="tile-shade" />
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </button>
  );
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action: string }) {
  return (
    <div className="section-heading">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <button type="button">{action}</button>
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

export { images };
