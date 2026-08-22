import { useEffect, useState } from "react";
import { HeartFilledIcon, HeartIcon, PlusIcon } from "../icons";
import { apiGet, apiSend, checkoutUrl, formatUsd, type Listing } from "../api";
import { images } from "../images";
import { FilterRail } from "./shared";

const kinds: Record<string, string> = {
  All: "",
  Cars: "vehicle",
  Trucks: "part",
  Motorcycles: "tool",
};

export function MarketplaceScreen({
  filter,
  setFilter,
  onNeedAccount,
  signedIn,
  userId,
}: {
  filter: string;
  setFilter: (value: string) => void;
  onNeedAccount: () => void;
  signedIn: boolean;
  userId: string | null;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [kind, setKind] = useState("part");
  const [condition, setCondition] = useState("used");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const kindQuery = kinds[filter] ?? "";
  const visible = kindQuery ? listings.filter((item) => item.kind === kindQuery) : listings;
  const open = listings.find((item) => item.id === openId) ?? null;

  useEffect(() => {
    const query = kinds[filter] ?? "";
    void apiGet<{ listings: Listing[] }>(`/marketplace/listings${query ? `?kind=${query}` : ""}`)
      .then((data) => {
        setListings(data.listings);
        setSaved(data.listings.filter((item) => item.saved).map((item) => item.id));
      })
      .catch(() => setError("Could not load the market."));
  }, [filter]);

  async function createListing() {
    if (!signedIn) {
      onNeedAccount();
      return;
    }
    const dollars = Number(price);
    if (!title.trim() || !Number.isFinite(dollars) || dollars < 1) {
      setError("Add a title and a price of at least $1.");
      return;
    }
    setError(null);
    await apiSend("/marketplace/listings", "POST", {
      kind,
      title: title.trim(),
      description: description.trim() || null,
      priceCents: Math.round(dollars * 100),
      condition,
      photos: [],
      fitment: { years: [], makes: [], models: [], vinPatterns: [] },
    });
    setSellOpen(false);
    setTitle("");
    setPrice("");
    setDescription("");
    const data = await apiGet<{ listings: Listing[] }>("/marketplace/listings");
    setListings(data.listings);
  }

  async function toggleSave(listing: Listing) {
    if (!signedIn) {
      onNeedAccount();
      return;
    }
    try {
      const result = await apiSend<{ liked: boolean }>(`/marketplace/listings/${listing.id}/favorite`, "POST");
      setSaved((current) =>
        result.liked ? [...current.filter((id) => id !== listing.id), listing.id] : current.filter((id) => id !== listing.id),
      );
    } catch {
      setError("Could not save that listing.");
    }
  }

  async function buy(listing: Listing) {
    if (!signedIn) {
      onNeedAccount();
      return;
    }
    setError(null);
    try {
      const result = await apiSend<{
        checkout?: { url?: string | null; mode?: string } | null;
        payment?: { url?: string | null; mode?: string } | null;
      }>(`/marketplace/listings/${listing.id}/purchase`, "POST", { shipping: {} });
      const url = checkoutUrl(result);
      if (result.checkout?.mode === "stripe" && url) {
        window.location.assign(url);
        return;
      }
      setNotice(`Order placed for ${listing.title}.`);
      setOpenId(null);
    } catch {
      setError("Could not complete that purchase.");
    }
  }

  async function removeListing(listing: Listing) {
    if (!signedIn || !userId || listing.sellerId !== userId) {
      onNeedAccount();
      return;
    }
    if (!window.confirm(`Delete “${listing.title}”?`)) return;
    setError(null);
    try {
      await apiSend(`/marketplace/listings/${listing.id}`, "DELETE");
      setListings((current) => current.filter((item) => item.id !== listing.id));
      setOpenId(null);
      setNotice("Listing deleted.");
    } catch {
      setError("Could not delete that listing.");
    }
  }

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
      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="empty-state">{notice}</p> : null}
      <div className="market-grid">
        {visible.map((product) => (
          <article className="product-card" key={product.id}>
            <button type="button" className="product-hit" onClick={() => setOpenId(product.id)}>
              <div className="product-image">
                <img src={product.photos[0] ?? images.engine} alt={product.title} loading="lazy" decoding="async" />
              </div>
              <div className="product-copy">
                <span>{product.kind}</span>
                <strong>{product.title}</strong>
                <small>{product.condition}</small>
                <b>{formatUsd(product.priceCents)}</b>
              </div>
            </button>
            <button
              type="button"
              className="save-listing"
              aria-label="Save listing"
              onClick={() => void toggleSave(product)}
            >
              {saved.includes(product.id) ? <HeartFilledIcon /> : <HeartIcon />}
            </button>
          </article>
        ))}
      </div>
      {visible.length === 0 ? <p className="empty-state">No listings in this lane yet. Be the first to post one.</p> : null}
      <button type="button" className="sell-button" onClick={() => (signedIn ? setSellOpen(true) : onNeedAccount())}>
        <PlusIcon /> {signedIn ? "List an item or service" : "Sign in to list an item"}
      </button>

      {open ? (
        <div className="sheet-scrim" role="presentation" onClick={() => setOpenId(null)}>
          <div className="sheet" role="dialog" aria-labelledby="listing-title" onClick={(event) => event.stopPropagation()}>
            <img src={open.photos[0] ?? images.engine} alt="" />
            <span>{open.kind}</span>
            <h2 id="listing-title">{open.title}</h2>
            <p>{open.description ?? "No description yet."}</p>
            <small>
              {open.condition} · {formatUsd(open.priceCents)}
              {open.fitsYourVehicle ? " · fits your garage" : ""}
            </small>
            <button type="button" className="sell-button sheet-cta" onClick={() => void buy(open)}>
              Buy now
            </button>
            {userId && open.sellerId === userId ? (
              <button type="button" className="sheet-close" onClick={() => void removeListing(open)}>
                Delete listing
              </button>
            ) : null}
            <button type="button" className="sheet-close" onClick={() => setOpenId(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {sellOpen ? (
        <div className="sheet-scrim" role="presentation" onClick={() => setSellOpen(false)}>
          <form
            className="sheet"
            role="dialog"
            aria-labelledby="sell-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void createListing();
            }}
          >
            <span>SELL IN THE BAY</span>
            <h2 id="sell-title">List it where the wrenchers are.</h2>
            <label>
              Title
              <input value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label>
              Kind
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="part">Part</option>
                <option value="tool">Tool</option>
                <option value="accessory">Accessory</option>
                <option value="vehicle">Vehicle</option>
                <option value="service">Service</option>
              </select>
            </label>
            <label>
              Condition
              <input value={condition} onChange={(event) => setCondition(event.target.value)} required />
            </label>
            <label>
              Price (USD)
              <input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" required />
            </label>
            <label>
              Description
              <input value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <button type="submit" className="sell-button sheet-cta">
              Publish listing
            </button>
            <button type="button" className="sheet-close" onClick={() => setSellOpen(false)}>
              Close
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
