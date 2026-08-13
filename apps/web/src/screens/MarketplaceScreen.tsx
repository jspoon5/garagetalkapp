import { HeartIcon, PlusIcon } from "../icons";
import { FilterRail, images } from "./shared";

const products = [
  { type: "Cars", title: "OBD-II diagnostic starter kit", seller: "Cadiyoss Garage", price: "$149", image: images.engine },
  { type: "Trucks", title: "Heavy-duty recovery gear set", seller: "Truck Bay Supply", price: "$289", image: images.truck },
  { type: "Motorcycles", title: "Rider tool roll & torque set", seller: "MotoMia", price: "$84", image: images.motorcycle },
];

export function MarketplaceScreen({ filter, setFilter }: { filter: string; setFilter: (value: string) => void }) {
  const visible = filter === "All" ? products : products.filter((product) => product.type === filter);
  return (
    <>
      <div className="market-hero">
        <img src={images.race} alt="Performance car representing the Garage Talk marketplace" decoding="async" />
        <div>
          <span>GEARHEAD MARKETPLACE</span>
          <h1>Parts, tools & trusted local help.</h1>
        </div>
      </div>
      <FilterRail value={filter} onChange={setFilter} />
      <div className="market-grid">
        {visible.map((product) => (
          <article className="product-card" key={product.title}>
            <div className="product-image">
              <img src={product.image} alt={product.title} loading="lazy" decoding="async" />
              <button type="button" aria-label="Save listing">
                <HeartIcon />
              </button>
            </div>
            <div className="product-copy">
              <span>{product.type}</span>
              <strong>{product.title}</strong>
              <small>{product.seller}</small>
              <b>{product.price}</b>
            </div>
          </article>
        ))}
      </div>
      <button type="button" className="sell-button">
        <PlusIcon /> List an item or service
      </button>
    </>
  );
}
