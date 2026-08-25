import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiGet,
  apiSend,
  ApiError,
  formatUsd,
  uploadImageFile,
  type PodcastEpisode,
  type Shop,
  type ShopService,
  type User,
  type Vehicle,
} from "../api";

export { VideosScreen } from "./VideosScreen";
export { SearchScreen, BillingScreen, PostThreadScreen } from "./SearchAndBilling";

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

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

type ShopFormState = {
  name: string;
  slug: string;
  about: string;
  city: string;
  serviceArea: string;
  specialties: string;
  photos: string[];
};

const emptyShopForm = (): ShopFormState => ({
  name: "",
  slug: "",
  about: "",
  city: "",
  serviceArea: "",
  specialties: "",
  photos: [],
});

function formFromShop(shop: Shop): ShopFormState {
  return {
    name: shop.name,
    slug: shop.slug,
    about: shop.about ?? "",
    city: shop.address?.city ?? "",
    serviceArea: shop.serviceArea ?? "",
    specialties: shop.specialties.join(", "),
    photos: shop.photos.slice(0, 10),
  };
}

function shopLocationLabel(shop: Shop): string {
  const city = shop.address?.city?.trim();
  if (city && shop.serviceArea) return `${city} · ${shop.serviceArea}`;
  return city ?? shop.serviceArea ?? shop.about ?? "Independent shop";
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
  const [busy, setBusy] = useState(false);

  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<Shop | null>(null);
  const [form, setForm] = useState<ShopFormState>(emptyShopForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [serviceMinutes, setServiceMinutes] = useState("60");
  const [servicePrice, setServicePrice] = useState("");
  const [ownerServices, setOwnerServices] = useState<ShopService[]>([]);
  const [shopsLoaded, setShopsLoaded] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const autoOpenedRef = useRef(false);

  const myShops = useMemo(
    () => (user ? shops.filter((shop) => shop.ownerUserId === user.id) : []),
    [shops, user],
  );

  async function refreshShops() {
    const data = await apiGet<{ shops: Shop[] }>("/shops");
    setShops(data.shops);
    setShopsLoaded(true);
    return data.shops;
  }

  useEffect(() => {
    void refreshShops().catch(() => setError("Could not load shops."));
    if (user) {
      void apiGet<{ vehicles: Vehicle[] }>("/garage/vehicles")
        .then((data) => setVehicles(data.vehicles))
        .catch(() => undefined);
    }
  }, [user]);

  useEffect(() => {
    if (!user || !shopsLoaded || autoOpenedRef.current) return;
    if (myShops.length === 0) {
      autoOpenedRef.current = true;
      startCreate();
    }
  }, [user, shopsLoaded, myShops.length]);

  async function openShop(shop: Shop) {
    setOpen(shop);
    setError(null);
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

  function startCreate() {
    if (!user) {
      onNeedAccount();
      return;
    }
    setManaging(true);
    setEditing(null);
    setForm(emptyShopForm());
    setSlugTouched(false);
    setOwnerServices([]);
    setServiceName("");
    setServiceMinutes("60");
    setServicePrice("");
    setError(null);
    setNotice(null);
  }

  async function startEdit(shop: Shop) {
    if (!user) {
      onNeedAccount();
      return;
    }
    setManaging(true);
    setEditing(shop);
    setForm(formFromShop(shop));
    setSlugTouched(true);
    setError(null);
    setNotice(null);
    const data = await apiGet<{ services: ShopService[] }>(`/shops/${shop.id}/services`);
    setOwnerServices(data.services);
  }

  function updateName(name: string) {
    setForm((current) => ({
      ...current,
      name,
      slug: slugTouched ? current.slug : slugify(name),
    }));
  }

  async function saveShop() {
    if (!user) {
      onNeedAccount();
      return;
    }
    const name = form.name.trim();
    const slug = (form.slug.trim() || slugify(name)).slice(0, 120);
    const city = form.city.trim();
    if (name.length < 1 || slug.length < 3) {
      setError("Add a shop name (slug needs at least 3 characters).");
      return;
    }
    if (!city) {
      setError("Add the city where your shop is located.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const specialties = form.specialties
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 30);
      const payload = {
        name,
        slug,
        about: form.about.trim() || null,
        address: { city },
        serviceArea: form.serviceArea.trim() || null,
        specialties,
        photos: form.photos.slice(0, 10),
      };
      const data = editing
        ? await apiSend<{ shop: Shop }>(`/shops/${editing.id}`, "PATCH", payload)
        : await apiSend<{ shop: Shop }>("/shops", "POST", payload);
      const latest = await refreshShops();
      const saved = latest.find((shop) => shop.id === data.shop.id) ?? data.shop;
      setEditing(saved);
      setForm(formFromShop(saved));
      setSlugTouched(true);
      setNotice(editing ? "Business info saved." : "Shop listed — add a service customers can book.");
      const listed = await apiGet<{ services: ShopService[] }>(`/shops/${saved.id}/services`);
      setOwnerServices(listed.services);
    } catch (err) {
      if (err instanceof ApiError && /unique|duplicate|slug/i.test(err.code + JSON.stringify(err.details ?? {}))) {
        setError("That shop URL slug is taken. Pick another.");
      } else {
        setError("Could not save business info. Check the fields and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    if (!user) {
      onNeedAccount();
      return;
    }
    setUploadingPhotos(true);
    setError(null);
    try {
      const next = [...form.photos];
      for (const file of Array.from(files)) {
        if (next.length >= 10) break;
        const url = await uploadImageFile(file);
        next.push(url);
      }
      setForm((current) => ({ ...current, photos: next }));
      setNotice("Photos uploaded.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "upload_storage_unconfigured") {
        setError("Photo storage is not configured on the server yet.");
      } else if (err instanceof ApiError && err.code === "file_too_large") {
        setError("Each shop photo must be 20 MB or smaller.");
      } else {
        setError("Could not upload that photo. Use JPG, PNG, or WebP.");
      }
    } finally {
      setUploadingPhotos(false);
    }
  }

  function removePhoto(index: number) {
    setForm((current) => ({
      ...current,
      photos: current.photos.filter((_, photoIndex) => photoIndex !== index),
    }));
  }

  async function addService() {
    if (!editing) {
      setError("Save the shop first, then add services.");
      return;
    }
    const name = serviceName.trim();
    const durationMin = Number(serviceMinutes);
    if (!name || !Number.isInteger(durationMin) || durationMin < 15) {
      setError("Service needs a name and duration of at least 15 minutes.");
      return;
    }
    const dollars = servicePrice.trim() === "" ? null : Number(servicePrice);
    if (dollars !== null && (!Number.isFinite(dollars) || dollars < 0)) {
      setError("Price must be a number (or leave blank).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/shops/${editing.id}/services`, "POST", {
        name,
        durationMin,
        priceBandLowCents: dollars === null ? null : Math.round(dollars * 100),
        priceBandHighCents: null,
      });
      const listed = await apiGet<{ services: ShopService[] }>(`/shops/${editing.id}/services`);
      setOwnerServices(listed.services);
      setServiceName("");
      setServicePrice("");
      setNotice("Service added.");
    } catch {
      setError("Could not add that service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="screen-intro">
        <span>LOCAL SHOPS</span>
        <h1>Book a real bay.</h1>
        <p>List your shop below — city, specialties, and photos of your location.</p>
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="empty-state">{notice}</p> : null}

      {!user ? (
        <div className="auth-card">
          <span>LIST YOUR SHOP</span>
          <strong>Sign in to add your business</strong>
          <p className="empty-state">
            Enter your shop name, city, specialties, and upload photos of your bay so customers can find you.
          </p>
          <button type="button" className="sell-button" onClick={onNeedAccount}>
            Sign in to list a shop
          </button>
        </div>
      ) : null}

      {user && !managing ? (
        <div className="profile-actions">
          <button
            type="button"
            className="sell-button"
            onClick={() => {
              if (myShops[0]) void startEdit(myShops[0]);
              else startCreate();
            }}
          >
            {myShops.length > 0 ? "Manage my business" : "List my shop"}
          </button>
        </div>
      ) : null}

      {user && managing ? (
        <form
          className="auth-card"
          onSubmit={(event) => {
            event.preventDefault();
            void saveShop();
          }}
        >
          <span>BUSINESS CENTER</span>
          <strong>{editing ? "Edit shop listing" : "Create your shop listing"}</strong>
          <p className="empty-state">
            Add your business details, city, specialties, and location photos. Save first, then add bookable services.
          </p>
          <label>
            Shop name
            <input
              value={form.name}
              onChange={(event) => updateName(event.target.value)}
              required
              maxLength={160}
              disabled={busy}
            />
          </label>
          <label>
            URL slug
            <input
              value={form.slug}
              onChange={(event) => {
                setSlugTouched(true);
                setForm((current) => ({ ...current, slug: slugify(event.target.value) || event.target.value }));
              }}
              required
              minLength={3}
              maxLength={120}
              pattern="[a-z0-9-]+"
              disabled={busy || Boolean(editing)}
              title="Lowercase letters, numbers, and hyphens"
            />
          </label>
          <label>
            About the business
            <textarea
              value={form.about}
              onChange={(event) => setForm((current) => ({ ...current, about: event.target.value }))}
              rows={4}
              maxLength={4000}
              disabled={busy}
              placeholder="What you fix, who you serve, what makes the bay yours."
            />
          </label>
          <label>
            City
            <input
              value={form.city}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
              maxLength={120}
              disabled={busy}
              placeholder="e.g. Detroit"
              required
            />
          </label>
          <label>
            Service area
            <input
              value={form.serviceArea}
              onChange={(event) => setForm((current) => ({ ...current, serviceArea: event.target.value }))}
              maxLength={500}
              disabled={busy}
              placeholder="e.g. Metro area · mobile within 25 mi"
            />
          </label>
          <label>
            Specialties
            <input
              value={form.specialties}
              onChange={(event) => setForm((current) => ({ ...current, specialties: event.target.value }))}
              disabled={busy}
              placeholder="Brakes, diagnostics, restorations (comma-separated)"
            />
          </label>
          <label>
            Location photos
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy || uploadingPhotos || form.photos.length >= 10}
              onChange={(event) => {
                void addPhotos(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          {uploadingPhotos ? <p className="empty-state">Uploading photos…</p> : null}
          {form.photos.length > 0 ? (
            <div className="profile-actions" style={{ flexWrap: "wrap" }}>
              {form.photos.map((photo, index) => (
                <figure key={`${photo}-${index}`} style={{ margin: 0, width: "7rem" }}>
                  <img src={photo} alt="" style={{ width: "100%", borderRadius: "0.5rem" }} />
                  <button type="button" disabled={busy || uploadingPhotos} onClick={() => removePhoto(index)}>
                    Remove
                  </button>
                </figure>
              ))}
            </div>
          ) : (
            <p className="empty-state">Upload photos of your shop, bay, or storefront (up to 10).</p>
          )}
          <div className="profile-actions">
            <button type="submit" className="sell-button" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save business info" : "Create shop listing"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setManaging(false);
                setEditing(null);
              }}
            >
              Done
            </button>
          </div>

          {editing ? (
            <>
              <span>SERVICES</span>
              {ownerServices.length === 0 ? (
                <p className="empty-state">No services yet — add at least one so customers can book.</p>
              ) : (
                ownerServices.map((service) => (
                  <article className="feed-card" key={service.id}>
                    <strong>{service.name}</strong>
                    <p>
                      {service.durationMin} min
                      {service.priceBandLowCents != null ? ` · from ${formatUsd(service.priceBandLowCents)}` : ""}
                    </p>
                  </article>
                ))
              )}
              <label>
                Service name
                <input
                  value={serviceName}
                  onChange={(event) => setServiceName(event.target.value)}
                  disabled={busy}
                  placeholder="e.g. Brake inspection"
                />
              </label>
              <label>
                Duration (minutes)
                <input
                  type="number"
                  min={15}
                  max={1440}
                  step={15}
                  value={serviceMinutes}
                  onChange={(event) => setServiceMinutes(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Starting price (USD, optional)
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={servicePrice}
                  onChange={(event) => setServicePrice(event.target.value)}
                  disabled={busy}
                  placeholder="89"
                />
              </label>
              <button type="button" disabled={busy} onClick={() => void addService()}>
                Add service
              </button>
            </>
          ) : null}

          {myShops.length > 1 ? (
            <>
              <span>YOUR OTHER LISTINGS</span>
              {myShops.map((shop) => (
                <button key={shop.id} type="button" disabled={busy} onClick={() => void startEdit(shop)}>
                  Edit {shop.name}
                </button>
              ))}
            </>
          ) : null}
        </form>
      ) : null}

      {shops.map((shop) => (
        <article className="feed-card" key={shop.id}>
          <strong>{shop.name}</strong>
          <p>
            {shopLocationLabel(shop)}
            {shop.unverified ? " · unverified" : ""}
            {user && shop.ownerUserId === user.id ? " · yours" : ""}
          </p>
          {shop.photos[0] ? (
            <img src={shop.photos[0]} alt="" style={{ width: "100%", borderRadius: "0.5rem" }} />
          ) : null}
          <div className="profile-actions">
            <button type="button" onClick={() => void openShop(shop)}>
              View & book
            </button>
            {user && shop.ownerUserId === user.id ? (
              <button type="button" onClick={() => void startEdit(shop)}>
                Edit listing
              </button>
            ) : null}
          </div>
        </article>
      ))}
      {shops.length === 0 && user ? (
        <p className="empty-state">No other shops listed yet. Finish your listing above to be the first bay on the board.</p>
      ) : null}
      {shops.length === 0 && !user ? (
        <p className="empty-state">No shops listed yet. Sign in above to add yours.</p>
      ) : null}

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
            {open.address?.city ? <p>{open.address.city}</p> : null}
            {open.serviceArea ? <p>{open.serviceArea}</p> : null}
            {open.specialties.length > 0 ? <p>{open.specialties.join(" · ")}</p> : null}
            {open.photos[0] ? (
              <img src={open.photos[0]} alt="" style={{ width: "100%", borderRadius: "0.5rem" }} />
            ) : null}
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
