import { useEffect, useState } from "react";
import {
  apiGet,
  apiSend,
  formatUsd,
  type PodcastEpisode,
  type Shop,
  type ShopService,
  type User,
  type Vehicle,
} from "../api";

export { VideosScreen } from "./VideosScreen";
export { SearchScreen, BillingScreen, PostThreadScreen } from "./SearchAndBilling";

export function PodcastsScreen() {
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<PodcastEpisode | null>(null);

  useEffect(() => {
    void apiGet<{ episodes: PodcastEpisode[] }>("/podcasts/episodes")
      .then((data) => setEpisodes(data.episodes))
      .catch(() => setError("Could not load podcasts."));
  }, []);

  return (
    <>
      <div className="screen-intro">
        <span>PODCASTS</span>
        <h1>Listen in the shop.</h1>
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      {episodes.map((episode) => (
        <article className="feed-card" key={episode.id}>
          <strong>{episode.title}</strong>
          <p>{episode.description ?? episode.status}</p>
          <button type="button" onClick={() => setPlaying(episode)} disabled={!episode.audioUrl}>
            {episode.audioUrl ? "Play" : "Processing"}
          </button>
        </article>
      ))}
      {episodes.length === 0 ? <p className="empty-state">No episodes on the shelf yet.</p> : null}
      {playing?.audioUrl ? (
        <div className="auth-card">
          <span>NOW PLAYING</span>
          <strong>{playing.title}</strong>
          <audio controls src={playing.audioUrl} autoPlay />
        </div>
      ) : null}
    </>
  );
}

export function ShopsScreen({
  user,
  onNeedAccount,
}: {
  user: User | null;
  onNeedAccount: () => void;
}) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [open, setOpen] = useState<Shop | null>(null);
  const [services, setServices] = useState<ShopService[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [when, setWhen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void apiGet<{ shops: Shop[] }>("/shops")
      .then((data) => setShops(data.shops))
      .catch(() => setError("Could not load shops."));
    if (user) {
      void apiGet<{ vehicles: Vehicle[] }>("/garage/vehicles")
        .then((data) => setVehicles(data.vehicles))
        .catch(() => undefined);
    }
  }, [user]);

  async function openShop(shop: Shop) {
    setOpen(shop);
    const data = await apiGet<{ services: ShopService[] }>(`/shops/${shop.id}/services`);
    setServices(data.services);
    setServiceId(data.services[0]?.id ?? "");
  }

  async function book() {
    if (!user) {
      onNeedAccount();
      return;
    }
    if (!open || !serviceId || !when) {
      setError("Pick a service and a time.");
      return;
    }
    await apiSend("/shops/bookings", "POST", {
      shopId: open.id,
      serviceId,
      vehicleId: vehicles[0]?.id ?? null,
      scheduledAt: new Date(when).toISOString(),
    });
    setNotice("Appointment requested.");
    setOpen(null);
  }

  return (
    <>
      <div className="screen-intro">
        <span>LOCAL SHOPS</span>
        <h1>Book a real bay.</h1>
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="empty-state">{notice}</p> : null}
      {shops.map((shop) => (
        <article className="feed-card" key={shop.id}>
          <strong>{shop.name}</strong>
          <p>
            {shop.serviceArea ?? shop.about ?? "Independent shop"}
            {shop.unverified ? " · unverified" : ""}
          </p>
          <button type="button" onClick={() => void openShop(shop)}>
            View & book
          </button>
        </article>
      ))}
      {shops.length === 0 ? <p className="empty-state">No shops listed yet.</p> : null}
      {open ? (
        <div className="sheet-scrim" role="presentation" onClick={() => setOpen(null)}>
          <form
            className="sheet"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void book().catch(() => setError("Could not book that slot."));
            }}
          >
            <span>{open.slug}</span>
            <h2>{open.name}</h2>
            <p>{open.about ?? "No shop write-up yet."}</p>
            <label>
              Service
              <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                    {service.priceBandLowCents != null ? ` · ${formatUsd(service.priceBandLowCents)}+` : ""}
                  </option>
                ))}
              </select>
            </label>
            {services.length === 0 ? <p className="empty-state">This shop has not published services yet.</p> : null}
            <label>
              When
              <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required />
            </label>
            <button type="submit" className="sell-button sheet-cta" disabled={services.length === 0}>
              Request appointment
            </button>
            <button type="button" className="sheet-close" onClick={() => setOpen(null)}>
              Close
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}

