import { useCallback, useEffect, useState } from "react";
import { HeartFilledIcon, HeartIcon } from "../icons";
import { GiftOverlay, type GiftOverlayEvent } from "../components/GiftOverlay";
import { ShareSheet } from "../components/ShareSheet";
import { LiveKitSession, liveSessionSocketUrl } from "../components/LiveKitSession";
import { apiGet, apiSend, checkoutUrl, ApiError, formatUsd, type GiftCatalogItem, type LiveSession, type User } from "../api";
import { images } from "./shared";

type GiftEvent = GiftOverlayEvent & { type: "live_gift" };

export function LiveSessionScreen({
  sessionId,
  user,
  canHostLive,
  onNeedAccount,
  onUpgradeRequired,
  onJoinBay,
  onTip,
  onLeaveLive,
}: {
  sessionId: string;
  user: User | null;
  canHostLive: boolean;
  onNeedAccount: () => void;
  onUpgradeRequired: () => void;
  onJoinBay: (roomName: string) => void;
  onTip: (hostId: string) => void;
  onLeaveLive: () => void;
}) {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [rtmp, setRtmp] = useState<{ url: string | null; key: string | null } | null>(null);
  const [gifts, setGifts] = useState<GiftCatalogItem[]>([]);
  const [walletCoins, setWalletCoins] = useState<number | null>(null);
  const [giftFlash, setGiftFlash] = useState<GiftEvent | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [guestRequests, setGuestRequests] = useState<
    Array<{ id: string; username: string; message: string | null }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCoins, setShowCoins] = useState(false);
  const [tokenNonce, setTokenNonce] = useState(0);
  const [liveRole, setLiveRole] = useState<string | null>(null);
  const [guestPollUntil, setGuestPollUntil] = useState<number | null>(null);
  const clearGift = useCallback(() => setGiftFlash(null), []);

  async function load() {
    const data = await apiGet<{ session: LiveSession; livekitUrl?: string | null }>(
      `/live/sessions/${sessionId}`,
    );
    setSession(data.session);
    if (user && user.id === data.session.hostId) {
      const ingest = await apiGet<{ rtmp: { url: string | null; key: string | null } }>(
        `/live/sessions/${sessionId}/rtmp`,
      ).catch(() => null);
      if (ingest) setRtmp(ingest.rtmp);
      const pending = await apiGet<{ requests: typeof guestRequests }>(
        `/live/sessions/${sessionId}/guest-requests`,
      ).catch(() => null);
      if (pending) setGuestRequests(pending.requests);
    }
  }

  useEffect(() => {
    void load().catch(() => setError("Could not load this live session."));
    void apiGet<{ gifts: GiftCatalogItem[] }>("/gifts/catalog")
      .then((data) => setGifts(data.gifts))
      .catch(() => undefined);
  }, [sessionId, user?.id]);

  // Host: keep guest request list fresh even if a WS frame is missed.
  useEffect(() => {
    if (!user || !session || user.id !== session.hostId) return;
    const timer = window.setInterval(() => {
      void apiGet<{ requests: typeof guestRequests }>(`/live/sessions/${sessionId}/guest-requests`)
        .then((pending) => setGuestRequests(pending.requests))
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [sessionId, user?.id, session?.hostId]);

  // Guest: after requesting a spot, re-fetch LiveKit token until role upgrades or timeout.
  useEffect(() => {
    if (!guestPollUntil || !user) return;
    if (liveRole === "guest" || liveRole === "mod") {
      setGuestPollUntil(null);
      return;
    }
    if (Date.now() > guestPollUntil) {
      setGuestPollUntil(null);
      setNotice("Still waiting on host approval — tap Refresh live access after they approve.");
      return;
    }
    const timer = window.setInterval(() => {
      setTokenNonce((n) => n + 1);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [guestPollUntil, liveRole, user?.id]);

  useEffect(() => {
    if (!user) return;
    void apiGet<{ balanceCoins: number }>("/wallet")
      .then((data) => setWalletCoins(data.balanceCoins))
      .catch(() => undefined);

    const params = new URLSearchParams(window.location.search);
    if (params.get("coins") === "success") {
      setNotice("Coin purchase received — refreshing your balance…");
      setShowCoins(true);
      let baseline: number | null = null;
      let reconciled = false;
      let cancelled = false;

      const poll = async (isLast: boolean) => {
        if (cancelled) return;
        try {
          const wallet = await apiGet<{ balanceCoins: number }>("/wallet");
          if (baseline === null) baseline = wallet.balanceCoins;
          setWalletCoins(wallet.balanceCoins);
          if (wallet.balanceCoins > baseline) {
            setNotice(`Balance updated: ${wallet.balanceCoins} coins.`);
            return;
          }
          if (isLast && !reconciled && (wallet.balanceCoins === 0 || wallet.balanceCoins === baseline)) {
            reconciled = true;
            const result = await apiSend<{ balanceCoins: number; creditedCoins: number }>(
              "/coins/reconcile",
              "POST",
            );
            setWalletCoins(result.balanceCoins);
            setNotice(
              result.creditedCoins > 0
                ? `Balance updated: ${result.balanceCoins} coins.`
                : "Payment received — if coins don't appear, refresh in a moment.",
            );
          }
        } catch {
          // ignore transient wallet errors during Stripe lag
        }
      };

      const delays = [1500, 4000, 8000];
      const timers = delays.map((ms, index) =>
        window.setTimeout(() => {
          void poll(index === delays.length - 1);
        }, ms),
      );
      return () => {
        cancelled = true;
        timers.forEach((id) => window.clearTimeout(id));
      };
    }
    return undefined;
  }, [user?.id, showCoins]);

  useEffect(() => {
    if (!user) return;
    const socket = new WebSocket(liveSessionSocketUrl(sessionId));
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as {
          type: string;
          gift?: GiftEvent["gift"];
          sender?: GiftEvent["sender"];
          userId?: string;
          approve?: boolean;
        };
        if (payload.type === "live_gift" && payload.gift && payload.sender) {
          setGiftFlash({ type: "live_gift", gift: payload.gift, sender: payload.sender });
        }
        if (payload.type === "guest_request" && user.id === session?.hostId) {
          void load().catch(() => undefined);
        }
        if (payload.type === "guest_decision" && payload.userId === user.id) {
          if (payload.approve) {
            setNotice("Host approved your guest spot — pick a camera/mic and go live.");
            setGuestPollUntil(null);
            setTokenNonce((n) => n + 1);
          } else {
            setGuestPollUntil(null);
            setNotice("Guest request declined.");
          }
        }
      } catch {
        // ignore malformed frames
      }
    };
    return () => socket.close();
  }, [sessionId, user?.id, session?.hostId]);

  async function like() {
    if (!user) {
      onNeedAccount();
      return;
    }
    const result = await apiSend<{ liked: boolean; likeCount: number }>(`/live/sessions/${sessionId}/like`, "POST");
    setSession((current) =>
      current ? { ...current, likedByMe: result.liked, likeCount: result.likeCount } : current,
    );
  }

  async function sendGift(slug: string) {
    if (!user) {
      onNeedAccount();
      return;
    }
    const idempotencyKey = `gift_${sessionId}_${user.id}_${slug}_${Date.now()}`;
    try {
      await apiSend(`/live/sessions/${sessionId}/gifts`, "POST", { giftSlug: slug, idempotencyKey });
      const wallet = await apiGet<{ balanceCoins: number }>("/wallet");
      setWalletCoins(wallet.balanceCoins);
      setNotice("Gift sent!");
    } catch {
      setNotice("Not enough coins — buy a pack to keep cheering.");
      setShowCoins(true);
    }
  }

  async function buyCoins(packId: "pack_99" | "pack_499") {
    const result = await apiSend<{ checkout: { url?: string | null } }>("/coins/checkout", "POST", { packId });
    const url = checkoutUrl(result);
    if (url) window.location.href = url;
  }

  async function decideGuest(requestId: string, approve: boolean) {
    await apiSend(`/live/sessions/${sessionId}/guest-requests/decide`, "POST", { requestId, approve });
    setGuestRequests((current) => current.filter((row) => row.id !== requestId));
    setNotice(approve ? "Guest approved — they can publish now." : "Guest request declined.");
  }

  async function requestGuestSpot() {
    if (!user) {
      onNeedAccount();
      return;
    }
    await apiSend(`/live/sessions/${sessionId}/guest-requests`, "POST", { message: "Ready to join on cam" });
    setNotice("Guest request sent — waiting for host approval…");
    setGuestPollUntil(Date.now() + 90_000);
    setTokenNonce((n) => n + 1);
  }

  function refreshLiveAccess() {
    setNotice("Refreshing live access…");
    setTokenNonce((n) => n + 1);
  }

  async function goLive() {
    if (!user || !session) return;
    if (!canHostLive) {
      onUpgradeRequired();
      return;
    }
    try {
      await apiSend(`/live/sessions/${sessionId}/start`, "POST");
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        onUpgradeRequired();
        return;
      }
      setError("Could not start this live session.");
    }
  }

  if (!session) return <p className="empty-state">{error ?? "Loading the bay…"}</p>;

  const live = Boolean(session.startedAt) && !session.endedAt;
  const isHost = user?.id === session.hostId;

  return (
    <>
      <article className="live-card">
        <div className="live-thumb">
          <img src={images.motorcycle} alt="" decoding="async" />
          <span className="live-badge">{live ? "LIVE" : session.recordingState === "ready" ? "REPLAY" : "STANDBY"}</span>
        </div>
        <div className="live-card-body">
          <div className="live-copy">
            <strong>{session.title ?? session.roomName}</strong>
            <span>
              {session.kind} · {session.likeCount ?? 0} hearts
            </span>
            {walletCoins !== null ? (
              <strong data-testid="live-coin-balance">Your coins: {walletCoins}</strong>
            ) : null}
          </div>
          <button type="button" className="heart-button" onClick={() => void like()} aria-label="Like live session">
            {session.likedByMe ? <HeartFilledIcon /> : <HeartIcon />}
          </button>
        </div>
      </article>

      <GiftOverlay event={giftFlash} onDone={clearGift} />
      {giftFlash ? (
        <div className="gift-flash" data-animation={giftFlash.gift.animationKey}>
          {giftFlash.sender.username} sent {giftFlash.gift.name} ({giftFlash.gift.coinCost} coins)
        </div>
      ) : null}

      {live ? (
        <LiveKitSession
          sessionId={sessionId}
          userId={user?.id ?? null}
          isHost={isHost}
          canHostLive={canHostLive}
          tokenNonce={tokenNonce}
          onUpgradeRequired={onUpgradeRequired}
          onLeave={onLeaveLive}
          onRole={setLiveRole}
        />
      ) : (
        <p className="empty-state">Waiting for the host to go live.</p>
      )}

      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="empty-state">{notice}</p> : null}

      {isHost && !live && canHostLive ? (
        <button type="button" className="sell-button" onClick={() => void goLive()}>
          Go live in app
        </button>
      ) : null}

      {isHost && !canHostLive ? (
        <p className="empty-state">Live hosting requires GearHead or higher. Free accounts can watch only.</p>
      ) : null}

      {user && gifts.length > 0 ? (
        <div className="auth-card">
          <span>SEND A GIFT</span>
          <div className="gift-grid">
            {gifts.map((gift) => (
              <button key={gift.slug} type="button" onClick={() => void sendGift(gift.slug)}>
                {gift.name} · {gift.coinCost}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setShowCoins((value) => !value)}>
            Buy coins
          </button>
          {showCoins ? (
            <div className="profile-actions">
              <button type="button" onClick={() => void buyCoins("pack_99")}>
                100 coins · {formatUsd(99)}
              </button>
              <button type="button" onClick={() => void buyCoins("pack_499")}>
                500 coins · {formatUsd(499)}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isHost && guestRequests.length > 0 ? (
        <div className="auth-card">
          <span>GUEST REQUESTS</span>
          {guestRequests.map((request) => (
            <div key={request.id} className="profile-actions">
              <span>
                {request.username}
                {request.message ? ` — ${request.message}` : ""}
              </span>
              <button type="button" onClick={() => void decideGuest(request.id, true)}>
                Approve
              </button>
              <button type="button" onClick={() => void decideGuest(request.id, false)}>
                Decline
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {user && !isHost && live ? (
        liveRole === "guest" || liveRole === "mod" ? (
          <p className="empty-state">Guest spot active — use the camera/mic pickers above to go on air.</p>
        ) : (
          <div className="profile-actions">
            <button type="button" onClick={() => void requestGuestSpot()}>
              Request guest spot
            </button>
            <button type="button" onClick={() => refreshLiveAccess()}>
              Refresh live access
            </button>
          </div>
        )
      ) : null}

      {isHost && rtmp?.url && rtmp.key ? (
        <div className="auth-card">
          <span>HOST INGEST</span>
          <p>OBS / RTMP ingest for this session (LiveKit Ingress).</p>
          <label>
            URL
            <input readOnly value={rtmp.url} />
          </label>
          <label>
            Stream key
            <input readOnly value={rtmp.key} />
          </label>
        </div>
      ) : null}

      {session.recordingReplayUrl ? (
        <a className="sell-button" href={session.recordingReplayUrl}>
          Open replay
        </a>
      ) : null}

      <div className="profile-actions">
        <button type="button" onClick={() => onJoinBay(session.roomName)}>
          Join the bay
        </button>
        <button
          type="button"
          onClick={() => {
            if (!user) onNeedAccount();
            else onTip(session.hostId);
          }}
        >
          Tip the host
        </button>
        <button type="button" onClick={() => setShareOpen(true)}>
          Share
        </button>
      </div>

      {shareOpen ? (
        <ShareSheet
          objectType="live"
          objectId={sessionId}
          title={session.title ?? session.roomName}
          signedIn={Boolean(user)}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </>
  );
}
