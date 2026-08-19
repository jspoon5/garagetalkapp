import { useEffect, useMemo, useState } from "react";
import {
  apiGet,
  apiSend,
  checkoutUrl,
  formatUsd,
  TIER_LABELS,
  type ChatRoom,
  type FeedComment,
  type FeedPost,
  type Listing,
  type PaidTier,
  type PodcastEpisode,
  type Shop,
  type ShopService,
  type User,
  type Vehicle,
  type VideoItem,
} from "../api";
import { images } from "./shared";

export function VideosScreen({
  signedIn,
  onNeedAccount,
}: {
  signedIn: boolean;
  onNeedAccount: () => void;
}) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [open, setOpen] = useState<VideoItem | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("repair");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiGet<{ videos: VideoItem[] }>("/videos")
      .then((data) => setVideos(data.videos))
      .catch(() => setError("Could not load videos."));
  }, []);

  async function upload() {
    if (!signedIn) {
      onNeedAccount();
      return;
    }
    if (!title.trim()) return;
    const session = await apiSend<{ upload: { uploadUrl: string; provider: string } }>("/videos/upload-session", "POST", {
      title: title.trim(),
      category,
    });
    setTitle("");
    setNotice(
      `Upload session ready (${session.upload.provider}). HLS ingest is environment-limited — drop the file at ${session.upload.uploadUrl} when Stream is wired.`,
    );
  }

  return (
    <>
      <div className="screen-intro">
        <span>VIDEO BAY</span>
        <h1>Watch and upload.</h1>
        <p>Catalog from the Garage Talk API. Playback uses HLS when a rendition is ready.</p>
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="empty-state">{notice}</p> : null}
      {videos.map((video) => (
        <article className="feed-card" key={video.id}>
          <strong>{video.title}</strong>
          <p>
            {video.category} · {video.status}
            {video.likeCount ? ` · ${video.likeCount} likes` : ""}
          </p>
          <button type="button" onClick={() => setOpen(video)}>
            {video.hlsUrl ? "Watch" : "Open"}
          </button>
        </article>
      ))}
      {videos.length === 0 ? <p className="empty-state">No ready videos yet. Start an upload below.</p> : null}
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void upload().catch(() => setError("Could not start an upload session."));
        }}
      >
        <span>UPLOAD</span>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="repair">Repair</option>
            <option value="restoration">Restoration</option>
            <option value="review">Review</option>
            <option value="racing">Racing</option>
            <option value="diy">DIY</option>
            <option value="other">Other</option>
          </select>
        </label>
        <button type="submit">{signedIn ? "Create upload session" : "Sign in to upload"}</button>
      </form>
      {open ? (
        <div className="sheet-scrim" role="presentation" onClick={() => setOpen(null)}>
          <div className="sheet" role="dialog" onClick={(event) => event.stopPropagation()}>
            <h2>{open.title}</h2>
            <p>{open.description ?? "No description yet."}</p>
            {open.hlsUrl ? (
              <video controls playsInline src={open.hlsUrl} poster={open.thumbUrl ?? undefined} />
            ) : (
              <p className="empty-state">HLS is environment-limited until Stream/R2 is configured.</p>
            )}
            <button type="button" className="sheet-close" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
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

export function SearchScreen({
  rooms,
  onEnterRoom,
  onOpenListing,
  onOpenPost,
}: {
  rooms: ChatRoom[];
  onEnterRoom: (id: string) => void;
  onOpenListing: (id: string) => void;
  onOpenPost: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [spatial, setSpatial] = useState<ChatRoom[]>([]);

  const roomHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms.slice(0, 6);
    return rooms.filter((room) => room.title.toLowerCase().includes(q));
  }, [rooms, query]);

  async function run() {
    const q = query.trim();
    const [market, feed, vids, pins] = await Promise.all([
      apiGet<{ listings: Listing[] }>(`/marketplace/listings${q ? `?q=${encodeURIComponent(q)}` : ""}`).catch(() => ({
        listings: [] as Listing[],
      })),
      apiGet<{ posts: FeedPost[] }>("/feed").catch(() => ({ posts: [] as FeedPost[] })),
      apiGet<{ videos: VideoItem[] }>("/videos").catch(() => ({ videos: [] as VideoItem[] })),
      apiGet<{ rooms: ChatRoom[] }>("/spatial/rooms").catch(() => ({ rooms: [] as ChatRoom[] })),
    ]);
    const needle = q.toLowerCase();
    setListings(market.listings);
    setPosts(
      needle ? feed.posts.filter((post) => post.body.toLowerCase().includes(needle)) : feed.posts.slice(0, 8),
    );
    setVideos(
      needle ? vids.videos.filter((video) => video.title.toLowerCase().includes(needle)) : vids.videos.slice(0, 6),
    );
    setSpatial(pins.rooms);
  }

  useEffect(() => {
    void run().catch(() => undefined);
  }, []);

  return (
    <>
      <div className="screen-intro">
        <span>SEARCH</span>
        <h1>Find a bay, a part, or a post.</h1>
      </div>
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <label>
          Query
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Civic brakes, Truck Bay…" />
        </label>
        <button type="submit">Search</button>
      </form>
      <h2 className="stack-heading">Bays</h2>
      {roomHits.map((room) => (
        <button key={room.id} type="button" className="notice-card" onClick={() => onEnterRoom(room.id)}>
          <strong>{room.title}</strong>
          <span>{room.kind}</span>
        </button>
      ))}
      <h2 className="stack-heading">Market</h2>
      {listings.map((listing) => (
        <button key={listing.id} type="button" className="notice-card" onClick={() => onOpenListing(listing.id)}>
          <strong>{listing.title}</strong>
          <span>{formatUsd(listing.priceCents)}</span>
        </button>
      ))}
      <h2 className="stack-heading">Feed</h2>
      {posts.map((post) => (
        <button key={post.id} type="button" className="notice-card" onClick={() => onOpenPost(post.id)}>
          <strong>{post.authorUsername ?? "gearhead"}</strong>
          <span>{post.body}</span>
        </button>
      ))}
      <h2 className="stack-heading">Videos</h2>
      {videos.map((video) => (
        <article className="feed-card" key={video.id}>
          <strong>{video.title}</strong>
          <p>{video.category}</p>
        </article>
      ))}
      <h2 className="stack-heading">Map pins</h2>
      {spatial.map((room) => (
        <button key={room.id} type="button" className="notice-card" onClick={() => onEnterRoom(room.id)}>
          <strong>{room.title}</strong>
          <span>{room.mapPoint?.label ?? "Spatial bay"}</span>
        </button>
      ))}
      {spatial.length === 0 ? <p className="empty-state">No spatial pins yet — a list is enough until the map layer is back.</p> : null}
    </>
  );
}

export function BillingScreen({
  user,
  onNeedAccount,
}: {
  user: User | null;
  onNeedAccount: () => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("500");
  const [toUserId, setToUserId] = useState("");

  async function subscribe(tier: PaidTier) {
    if (!user) {
      onNeedAccount();
      return;
    }
    const data = await apiSend<{ checkout: { url: string; mode: string } }>("/billing/checkout", "POST", { tier });
    if (data.checkout.mode === "stripe" && data.checkout.url) {
      window.location.assign(data.checkout.url);
      return;
    }
    setNotice(`Checkout is stubbed until STRIPE_SECRET_KEY is set on the server. Tier: ${tier}.`);
  }

  async function portal() {
    if (!user) {
      onNeedAccount();
      return;
    }
    const data = await apiGet<{ portal: { url: string; mode: string } }>("/billing/portal");
    if (data.portal.mode === "stripe" && data.portal.url) {
      window.location.assign(data.portal.url);
      return;
    }
    setNotice("Customer portal is stubbed until a Stripe customer exists.");
  }

  async function tip() {
    if (!user) {
      onNeedAccount();
      return;
    }
    const cents = Number(amount);
    if (!toUserId || !Number.isFinite(cents) || cents < 100) {
      setError("Need a recipient user id and at least $1.");
      return;
    }
    const data = await apiSend<{ checkout?: { url?: string | null; mode?: string } | null }>("/billing/tips", "POST", {
      toUserId,
      amountCents: Math.round(cents),
    });
    const url = checkoutUrl(data);
    if (data.checkout?.mode === "stripe" && url) {
      window.location.assign(url);
      return;
    }
    setNotice("Tip recorded. Stripe Checkout runs when live keys are present.");
  }

  return (
    <>
      <div className="screen-intro">
        <span>SUBSCRIBE</span>
        <h1>Keep the lights on in the bay.</h1>
        <p>Current tier: {user?.tier ?? "signed out"}.</p>
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="empty-state">{notice}</p> : null}
      <div className="profile-actions">
        {(Object.keys(TIER_LABELS) as PaidTier[]).map((tier) => (
          <button key={tier} type="button" onClick={() => void subscribe(tier).catch(() => setError("Checkout failed."))}>
            {TIER_LABELS[tier]}
          </button>
        ))}
      </div>
      <button type="button" className="sell-button" onClick={() => void portal().catch(() => setError("Portal failed."))}>
        Open billing portal
      </button>
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void tip();
        }}
      >
        <span>TIP A CREATOR</span>
        <label>
          Recipient user id
          <input value={toUserId} onChange={(event) => setToUserId(event.target.value)} required />
        </label>
        <label>
          Amount (cents)
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" required />
        </label>
        <button type="submit">Send tip</button>
      </form>
      <img className="stack-foot" src={images.race} alt="" />
    </>
  );
}

export function PostThreadScreen({
  post,
  signedIn,
  onNeedAccount,
  onLike,
}: {
  post: FeedPost;
  signedIn: boolean;
  onNeedAccount: () => void;
  onLike: (postId: string) => void;
}) {
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [body, setBody] = useState("");

  useEffect(() => {
    void apiGet<{ comments: FeedComment[] }>(`/feed/posts/${post.id}/comments`).then((data) => setComments(data.comments));
  }, [post.id]);

  async function comment() {
    if (!signedIn) {
      onNeedAccount();
      return;
    }
    const text = body.trim();
    if (!text) return;
    const data = await apiSend<{ comment: FeedComment }>(`/feed/posts/${post.id}/comments`, "POST", { body: text });
    setComments((current) => [data.comment, ...current]);
    setBody("");
  }

  return (
    <>
      <article className="feed-card">
        <strong>{post.authorUsername ?? "gearhead"}</strong>
        <p>{post.body}</p>
        <button type="button" onClick={() => onLike(post.id)}>
          {post.likedByMe ? "Unlike" : "Like"}
          {post.likeCount ? ` · ${post.likeCount}` : ""}
        </button>
      </article>
      {comments.map((item) => (
        <article className="feed-card" key={item.id}>
          <strong>{item.authorUsername ?? "gearhead"}</strong>
          <p>{item.body}</p>
        </article>
      ))}
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void comment();
        }}
      >
        <label>
          Comment
          <input value={body} onChange={(event) => setBody(event.target.value)} required />
        </label>
        <button type="submit">Reply</button>
      </form>
    </>
  );
}
