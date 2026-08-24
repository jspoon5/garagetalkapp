import { useEffect, useMemo, useState } from "react";
import {
  apiGet,
  apiSend,
  checkoutUrl,
  formatUsd,
  TIER_LABELS,
  type ChatRoom,
  type FeedPost,
  type FeedComment,
  type Listing,
  type PaidTier,
  type User,
  type VideoItem,
} from "../api";
import { images } from "./shared";

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
