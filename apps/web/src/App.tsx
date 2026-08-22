import { useEffect, useMemo, useRef, useState } from "react";
import { BellIcon, ChatBubbleIcon, ChevronLeftIcon, GearIcon, HomeIcon, MagnifyingGlassIcon, PersonIcon } from "./icons";
import {
  apiGet,
  apiSend,
  checkoutUrl,
  ApiError,
  type ChatRoom,
  type FeedPost,
  type LiveSession,
  type User,
  type UserEntitlement,
} from "./api";
import { preferredRoom, roomImage, roomLane, type Lane } from "./bays";
import { BayScreen } from "./screens/BayScreen";
import { GearHeadScreen } from "./screens/GearHeadScreen";
import { GarageScreen } from "./screens/GarageScreen";
import { HomeScreen } from "./screens/HomeScreen";
import {
  BillingScreen,
  PodcastsScreen,
  PostThreadScreen,
  SearchScreen,
  ShopsScreen,
  VideosScreen,
} from "./screens/HubScreens";
import { LiveSessionScreen } from "./screens/LiveSessionScreen";
import { MarketplaceScreen } from "./screens/MarketplaceScreen";
import { RoomsScreen } from "./screens/RoomsScreen";
import { ComposeSheet } from "./screens/shared";
import { VehicleScreen } from "./screens/VehicleScreen";

export type Screen = "home" | "rooms" | "gearhead" | "market" | "profile";

type Overlay =
  | { kind: "vehicle"; id: string }
  | { kind: "live"; id: string }
  | { kind: "videos" }
  | { kind: "podcasts" }
  | { kind: "shops" }
  | { kind: "search" }
  | { kind: "billing" }
  | { kind: "post"; id: string }
  | { kind: "compose" }
  | { kind: "createRoom" }
  | { kind: "goLive" }
  | { kind: "tip"; toUserId: string };

type ExtendedNavigator = Navigator & {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
};

const tabs: Array<{ id: Screen; label: string; icon: typeof HomeIcon }> = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "rooms", label: "Rooms", icon: ChatBubbleIcon },
  { id: "gearhead", label: "GearHead", icon: GearIcon },
  { id: "market", label: "Market", icon: MagnifyingGlassIcon },
  { id: "profile", label: "Garage", icon: PersonIcon },
];

const overlayTitles: Record<Overlay["kind"], string> = {
  vehicle: "Vehicle",
  live: "Live session",
  videos: "Videos",
  podcasts: "Podcasts",
  shops: "Shops",
  search: "Search",
  billing: "Subscribe",
  post: "Post",
  compose: "New post",
  createRoom: "New bay",
  goLive: "Go live",
  tip: "Tip",
};

export function App() {
  const appRef = useRef<HTMLDivElement>(null);
  const [layoutClasses, setLayoutClasses] = useState("phone-compact");
  const [screen, setScreen] = useState<Screen>("home");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [pendingRoom, setPendingRoom] = useState<{ id: string; from: Screen } | null>(null);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState("All");
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [lives, setLives] = useState<LiveSession[]>([]);
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<UserEntitlement | null>(null);
  const [draft, setDraft] = useState("");
  const [tipAmount, setTipAmount] = useState("500");

  const activeRoom = rooms.find((room) => room.id === roomId) ?? null;
  const activePost = overlay?.kind === "post" ? (posts.find((post) => post.id === overlay.id) ?? null) : null;

  const title = useMemo(() => {
    if (overlay) return overlayTitles[overlay.kind];
    if (activeRoom) return activeRoom.title;
    return {
      home: "Garage Talk",
      rooms: "Garage Rooms",
      gearhead: "GearHead AI",
      market: "Marketplace",
      profile: "My Garage",
    }[screen];
  }, [activeRoom, overlay, screen]);

  const navigate = (next: Screen) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setRoomId(null);
    setOverlay(null);
    setNoticesOpen(false);
    setPendingRoom(null);
    if (next === "rooms" || next === "market") setVehicleFilter("All");
    setScreen(next);
  };

  const goSignIn = (returnRoom?: string | null) => {
    if (returnRoom) setPendingRoom({ id: returnRoom, from: screen });
    setRoomId(null);
    setOverlay(null);
    setNoticesOpen(false);
    setScreen("profile");
  };

  const enterRoom = (id: string) => {
    setNoticesOpen(false);
    setOverlay(null);
    setRoomId(id);
  };

  const enterLane = (lane: Lane) => {
    const room = preferredRoom(rooms, lane);
    if (room) enterRoom(room.id);
    else navigate("rooms");
  };

  const goBack = () => {
    if (overlay) {
      setOverlay(null);
      return;
    }
    setRoomId(null);
  };

  async function loadEntitlement() {
    if (!user) {
      setEntitlement(null);
      return;
    }
    try {
      const data = await apiGet<{ entitlement: UserEntitlement }>("/billing/entitlement");
      setEntitlement(data.entitlement);
    } catch {
      setEntitlement(null);
    }
  }

  async function refresh() {
    const [roomData, feedData, liveData] = await Promise.all([
      apiGet<{ rooms: ChatRoom[] }>("/rooms"),
      apiGet<{ posts: FeedPost[] }>("/feed").catch(() => ({ posts: [] as FeedPost[] })),
      apiGet<{ sessions: LiveSession[] }>("/live/sessions").catch(() => ({ sessions: [] as LiveSession[] })),
    ]);
    setRooms(roomData.rooms);
    setPosts(feedData.posts);
    setLives(liveData.sessions);
  }

  useEffect(() => {
    void fetch("/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: User } | null) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => undefined);
    void refresh().catch(() => undefined);
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "success" || params.get("tip") === "success" || params.get("market") === "success") {
      setLiveNote("Payment completed — Stripe will reconcile the webhook shortly.");
    }

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, []);

  useEffect(() => {
    void loadEntitlement().catch(() => undefined);
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh().catch(() => undefined);
        void loadEntitlement().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [user?.id]);

  useEffect(() => {
    if (user && pendingRoom) {
      setScreen(pendingRoom.from);
      setRoomId(pendingRoom.id);
      setPendingRoom(null);
    }
  }, [user, pendingRoom]);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;

    const updateLayout = () => {
      const width = app.clientWidth;
      const height = app.clientHeight;
      const deviceNavigator = navigator as ExtendedNavigator;
      const classes: string[] = [];

      if (width <= 359) classes.push("phone-narrow");
      else if (width <= 399) classes.push("phone-compact");
      else classes.push("phone-roomy");

      if (height <= 740) classes.push("phone-short");
      if (width > height) classes.push("phone-landscape");
      if (
        deviceNavigator.connection?.saveData ||
        (deviceNavigator.deviceMemory !== undefined && deviceNavigator.deviceMemory <= 4) ||
        (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4)
      ) {
        classes.push("phone-efficient");
      }

      setLayoutClasses(classes.join(" "));
    };

    updateLayout();
    const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(updateLayout) : null;
    resizeObserver?.observe(app);
    window.addEventListener("resize", updateLayout, { passive: true });

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, []);

  async function likePost(postId: string) {
    if (!user) {
      goSignIn();
      return;
    }
    const result = await apiSend<{ reaction: { liked?: boolean } }>(`/feed/posts/${postId}/reactions`, "POST", {
      kind: "like",
    });
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              likedByMe: result.reaction.liked ?? !post.likedByMe,
              likeCount: Math.max(0, (post.likeCount ?? 0) + (result.reaction.liked === false ? -1 : 1)),
            }
          : post,
      ),
    );
  }

  async function likeLive() {
    const session = lives[0];
    if (!session) {
      navigate("rooms");
      return;
    }
    if (!user) {
      goSignIn();
      return;
    }
    const result = await apiSend<{ liked: boolean; likeCount: number }>(`/live/sessions/${session.id}/like`, "POST");
    setLives((current) =>
      current.map((item) =>
        item.id === session.id ? { ...item, likedByMe: result.liked, likeCount: result.likeCount } : item,
      ),
    );
  }

  async function composePost(body: string) {
    if (!user) {
      goSignIn();
      return;
    }
    const text = body.trim();
    if (!text) {
      setDraft("");
      setOverlay({ kind: "compose" });
      return;
    }
    await apiSend("/feed/posts", "POST", { body: text });
    setOverlay(null);
    setDraft("");
    await refresh();
  }

  async function createRoom() {
    if (!user) {
      goSignIn();
      return;
    }
    const titleText = draft.trim();
    if (!titleText) {
      setDraft("");
      setOverlay({ kind: "createRoom" });
      return;
    }
    const data = await apiSend<{ room: ChatRoom }>("/rooms", "POST", { title: titleText, kind: "topic" });
    setOverlay(null);
    setDraft("");
    await refresh();
    enterRoom(data.room.id);
  }

  async function goLive() {
    if (!user) {
      goSignIn();
      return;
    }
    if (entitlement && !entitlement.canHostLive) {
      setLiveNote("Live hosting is included with GearHead and up. Free accounts can watch only.");
      setOverlay({ kind: "billing" });
      return;
    }
    const titleText = draft.trim() || `${user.username} live`;
    const roomName = `bay_${user.username.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "live"}`;
    try {
      const data = await apiSend<{ session: LiveSession; rtmp: { url: string | null; key: string | null } }>(
        "/live/sessions",
        "POST",
        {
          roomName,
          title: titleText,
          kind: "stream",
        },
      );
      setLiveNote(data.rtmp.url ? `OBS ingest: ${data.rtmp.url}` : "Session created — go live in app when ready.");
      setDraft("");
      await refresh();
      setOverlay({ kind: "live", id: data.session.id });
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setLiveNote("Live hosting requires a paid plan. Free accounts can watch only.");
        setOverlay({ kind: "billing" });
        return;
      }
      setLiveNote("Could not create live session.");
    }
  }

  function openGoLive() {
    if (!user) {
      goSignIn();
      return;
    }
    if (entitlement && !entitlement.canHostLive) {
      setLiveNote("Live hosting is included with GearHead and up. Free accounts can watch only.");
      setOverlay({ kind: "billing" });
      return;
    }
    setDraft("");
    setOverlay({ kind: "goLive" });
  }

  async function sendTip(toUserId: string) {
    if (!user) {
      goSignIn();
      return;
    }
    const cents = Number(tipAmount);
    if (!Number.isFinite(cents) || cents < 100) return;
    const data = await apiSend<{ checkout?: { url?: string | null; mode?: string } | null }>("/billing/tips", "POST", {
      toUserId,
      amountCents: Math.round(cents),
    });
    const url = checkoutUrl(data);
    if (data.checkout?.mode === "stripe" && url) {
      window.location.assign(url);
      return;
    }
    setLiveNote("Tip sent.");
    setOverlay(null);
  }

  const notices = (() => {
    const liveNotices = lives
      .filter((session) => Boolean(session.startedAt) && !session.endedAt)
      .slice(0, 3)
      .map((session) => ({
        id: `live:${session.id}`,
        title: session.title ?? session.roomName,
        body: `${session.kind} is live now.`,
        onClick: () => setOverlay({ kind: "live", id: session.id }),
      }));
    const roomNotices = rooms.slice(0, 2).map((room) => ({
      id: `room:${room.id}`,
      title: room.title,
      body: "Bay is open — tap to walk in.",
      onClick: () => enterRoom(room.id),
    }));
    const byId = new Map<string, (typeof liveNotices)[number]>();
    for (const notice of [...liveNotices, ...roomNotices]) {
      byId.set(notice.id, notice);
    }
    return [...byId.values()];
  })();

  function joinBayFromLive(roomName: string) {
    const match = rooms.find(
      (room) =>
        room.title.toLowerCase() === roomName.toLowerCase() ||
        room.title.toLowerCase().includes(roomName.toLowerCase()) ||
        roomName.toLowerCase().includes(room.title.toLowerCase()),
    );
    if (match) {
      enterRoom(match.id);
      return;
    }
    navigate("rooms");
  }

  return (
    <div ref={appRef} className={`gt-app ${layoutClasses}`} data-layout={layoutClasses}>
      <nav className="gt-nav" aria-label="Garage Talk navigation">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = screen === tab.id && !roomId && !overlay;
          return (
            <button
              key={tab.id}
              type="button"
              className={active ? "active" : ""}
              data-testid={`nav-${tab.id}`}
              onClick={() => navigate(tab.id)}
              aria-current={active ? "page" : undefined}
            >
              <Icon />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <header className="gt-topbar">
        {roomId || overlay ? (
          <button type="button" className="icon-button" aria-label="Back" onClick={goBack}>
            <ChevronLeftIcon />
          </button>
        ) : (
          <div className="brand-mark" aria-hidden="true">
            <GearIcon />
          </div>
        )}
        <div className="brand-copy">
          <span>{title}</span>
          <small>
            {overlay || roomId ? "Live bay · back returns you where you came from" : "Built for every gearhead"}
          </small>
        </div>
        <button
          type="button"
          className={`icon-button ${noticesOpen ? "active-icon" : ""}`}
          aria-label="Notifications"
          onClick={() => setNoticesOpen((open) => !open)}
        >
          <BellIcon />
        </button>
      </header>

      <div
        key={
          overlay && overlay.kind !== "compose" && overlay.kind !== "createRoom" && overlay.kind !== "goLive" && overlay.kind !== "tip"
            ? `${overlay.kind}${"id" in overlay ? overlay.id : ""}`
            : (roomId ?? screen)
        }
        className="gt-scroll"
      >
        <main className="gt-content">
          {liveNote ? <p className="empty-state">{liveNote}</p> : null}
          {noticesOpen ? (
            <section className="notice-list">
              <div className="screen-intro">
                <span>PIT BOARD</span>
                <h1>What’s popping.</h1>
                <p>Live sessions and open bays — tap one to walk in.</p>
              </div>
              {notices.map((notice) => (
                <button key={notice.id} type="button" className="notice-card" onClick={notice.onClick}>
                  <strong>{notice.title}</strong>
                  <span>{notice.body}</span>
                </button>
              ))}
              {notices.length === 0 ? <p className="empty-state">Nothing on the board yet.</p> : null}
            </section>
          ) : overlay?.kind === "vehicle" ? (
            <VehicleScreen vehicleId={overlay.id} onOpenBay={(type) => enterLane(roomLane(type))} />
          ) : overlay?.kind === "live" ? (
            <LiveSessionScreen
              sessionId={overlay.id}
              user={user}
              canHostLive={entitlement?.canHostLive ?? false}
              onNeedAccount={() => goSignIn()}
              onUpgradeRequired={() => {
                setLiveNote("Live hosting requires a paid plan. Free accounts can watch only.");
                setOverlay({ kind: "billing" });
              }}
              onJoinBay={(roomName) => joinBayFromLive(roomName)}
              onTip={(hostId) => setOverlay({ kind: "tip", toUserId: hostId })}
              onLeaveLive={() => setOverlay(null)}
            />
          ) : overlay?.kind === "videos" ? (
            <VideosScreen signedIn={Boolean(user)} onNeedAccount={() => goSignIn()} />
          ) : overlay?.kind === "podcasts" ? (
            <PodcastsScreen />
          ) : overlay?.kind === "shops" ? (
            <ShopsScreen user={user} onNeedAccount={() => goSignIn()} />
          ) : overlay?.kind === "search" ? (
            <SearchScreen
              rooms={rooms}
              onEnterRoom={enterRoom}
              onOpenListing={() => navigate("market")}
              onOpenPost={(id) => setOverlay({ kind: "post", id })}
            />
          ) : overlay?.kind === "billing" ? (
            <BillingScreen user={user} onNeedAccount={() => goSignIn()} />
          ) : overlay?.kind === "post" && activePost ? (
            <PostThreadScreen
              post={activePost}
              signedIn={Boolean(user)}
              onNeedAccount={() => goSignIn()}
              onLike={(id) => void likePost(id)}
            />
          ) : roomId && activeRoom ? (
            <BayScreen
              roomId={activeRoom.id}
              roomTitle={activeRoom.title}
              roomImage={roomImage(activeRoom.title)}
              user={user}
              onNeedAccount={() => goSignIn(activeRoom.id)}
            />
          ) : screen === "home" ? (
            <HomeScreen
              rooms={rooms}
              posts={posts}
              live={lives[0] ?? null}
              onLike={(postId) => void likePost(postId)}
              onLikeLive={() => void likeLive()}
              onEnterRoom={enterRoom}
              onOpenRooms={() => navigate("rooms")}
              onOpenGearHead={() => navigate("gearhead")}
              onOpenLive={() =>
                lives[0] ? setOverlay({ kind: "live", id: lives[0].id }) : navigate("rooms")
              }
              onOpenSearch={() => setOverlay({ kind: "search" })}
              onOpenVideos={() => setOverlay({ kind: "videos" })}
              onOpenPodcasts={() => setOverlay({ kind: "podcasts" })}
              onOpenShops={() => setOverlay({ kind: "shops" })}
              onOpenPost={(id) => setOverlay({ kind: "post", id })}
              onCompose={(body) => void composePost(body)}
              signedIn={Boolean(user)}
            />
          ) : screen === "rooms" ? (
            <RoomsScreen
              rooms={rooms}
              filter={vehicleFilter}
              setFilter={setVehicleFilter}
              onEnterRoom={enterRoom}
              onCreateRoom={() => void createRoom()}
              signedIn={Boolean(user)}
            />
          ) : screen === "gearhead" ? (
            <GearHeadScreen signedIn={Boolean(user)} onNeedAccount={() => goSignIn()} />
          ) : screen === "market" ? (
            <MarketplaceScreen
              filter={vehicleFilter}
              setFilter={setVehicleFilter}
              onNeedAccount={() => goSignIn()}
              signedIn={Boolean(user)}
              userId={user?.id ?? null}
            />
          ) : (
            <GarageScreen
              user={user}
              setUser={setUser}
              canHostLive={entitlement?.canHostLive ?? false}
              onOpenVehicle={(id) => setOverlay({ kind: "vehicle", id })}
              onGoLive={openGoLive}
              onOpenBilling={() => setOverlay({ kind: "billing" })}
            />
          )}
        </main>
      </div>

      {overlay?.kind === "compose" ? (
        <ComposeSheet
          eyebrow="THE LOT"
          title="What’s in the garage?"
          label="Post"
          placeholder="Drop a wrench note"
          submitLabel="Publish"
          value={draft}
          onChange={setDraft}
          onClose={() => setOverlay(null)}
          onSubmit={() => void composePost(draft)}
        />
      ) : null}
      {overlay?.kind === "createRoom" ? (
        <ComposeSheet
          eyebrow="NEW BAY"
          title="Name this bay"
          label="Title"
          placeholder="Car Garage"
          submitLabel="Open bay"
          value={draft}
          onChange={setDraft}
          onClose={() => setOverlay(null)}
          onSubmit={() => void createRoom()}
        />
      ) : null}
      {overlay?.kind === "goLive" ? (
        <ComposeSheet
          eyebrow="GO LIVE"
          title="Name the session"
          label="Title"
          placeholder={`${user?.username ?? "You"} live`}
          submitLabel="Create session"
          value={draft}
          onChange={setDraft}
          onClose={() => setOverlay(null)}
          onSubmit={() => void goLive()}
        />
      ) : null}
      {overlay?.kind === "tip" ? (
        <ComposeSheet
          eyebrow="TIP"
          title="Send a tip"
          label="Amount (cents)"
          placeholder="500"
          submitLabel="Tip"
          value={tipAmount}
          onChange={setTipAmount}
          onClose={() => setOverlay(null)}
          onSubmit={() => void sendTip(overlay.toUserId)}
        />
      ) : null}
    </div>
  );
}
