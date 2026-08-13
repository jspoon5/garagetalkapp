import { useEffect, useMemo, useRef, useState } from "react";
import { BellIcon, ChatBubbleIcon, ChevronLeftIcon, GearIcon, HomeIcon, MagnifyingGlassIcon, PersonIcon } from "./icons";
import { apiGet, apiSend, type ChatRoom, type FeedPost, type LiveSession, type User } from "./api";
import { preferredRoom, roomImage, roomLane, type Lane } from "./bays";
import { BayScreen } from "./screens/BayScreen";
import { GearHeadScreen } from "./screens/GearHeadScreen";
import { GarageScreen } from "./screens/GarageScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { MarketplaceScreen } from "./screens/MarketplaceScreen";
import { RoomsScreen } from "./screens/RoomsScreen";

export type Screen = "home" | "rooms" | "gearhead" | "market" | "profile";

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

export function App() {
  const appRef = useRef<HTMLDivElement>(null);
  const [layoutClasses, setLayoutClasses] = useState("phone-compact");
  const [screen, setScreen] = useState<Screen>("home");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [pendingRoom, setPendingRoom] = useState<{ id: string; from: Screen } | null>(null);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState("All");
  const [liked, setLiked] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [lives, setLives] = useState<LiveSession[]>([]);
  const [liveNote, setLiveNote] = useState<string | null>(null);

  const activeRoom = rooms.find((room) => room.id === roomId) ?? null;

  const title = useMemo(() => {
    if (activeRoom) return activeRoom.title;
    return {
      home: "Garage Talk",
      rooms: "Garage Rooms",
      gearhead: "GearHead AI",
      market: "Marketplace",
      profile: "My Garage",
    }[screen];
  }, [activeRoom, screen]);

  const navigate = (next: Screen) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setRoomId(null);
    setNoticesOpen(false);
    setPendingRoom(null);
    if (next === "rooms" || next === "market") setVehicleFilter("All");
    setScreen(next);
  };

  const goSignIn = (returnRoom?: string | null) => {
    if (returnRoom) setPendingRoom({ id: returnRoom, from: screen });
    setRoomId(null);
    setNoticesOpen(false);
    setScreen("profile");
  };

  const enterRoom = (id: string) => {
    setNoticesOpen(false);
    setRoomId(id);
  };

  const enterLane = (lane: Lane) => {
    const room = preferredRoom(rooms, lane);
    if (room) enterRoom(room.id);
    else navigate("rooms");
  };

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
  }, []);

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

  async function likePost(postId?: string) {
    if (!postId) {
      setLiked((value) => !value);
      return;
    }
    if (!user) {
      goSignIn();
      return;
    }
    await apiSend(`/feed/posts/${postId}/reactions`, "POST", { kind: "like" });
  }

  async function composePost(body: string) {
    if (!user) {
      goSignIn();
      return;
    }
    const text = body.trim() || window.prompt("What’s in the garage?")?.trim();
    if (!text) return;
    await apiSend("/feed/posts", "POST", { body: text });
    await refresh();
  }

  async function createRoom() {
    if (!user) {
      goSignIn();
      return;
    }
    const title = window.prompt("Name this bay");
    if (!title?.trim()) return;
    const data = await apiSend<{ room: ChatRoom }>("/rooms", "POST", { title: title.trim(), kind: "topic" });
    await refresh();
    enterRoom(data.room.id);
  }

  async function goLive() {
    if (!user) {
      goSignIn();
      return;
    }
    const roomName = `bay_${user.username.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "live"}`;
    const data = await apiSend<{ session: LiveSession; rtmp: { url: string; key: string } }>("/live/sessions", "POST", {
      roomName,
      title: `${user.username} live`,
      kind: "stream",
    });
    setLiveNote(`OBS ingest: ${data.rtmp.url} key ${data.rtmp.key}`);
    await refresh();
    enterLane("Motorcycles");
  }

  const notices = [
    ...lives.slice(0, 3).map((session) => ({
      id: session.id,
      title: session.title ?? session.roomName,
      body: `${session.kind} is on the board.`,
      onClick: () => enterLane(roomLane(session.title ?? session.roomName)),
    })),
    ...rooms.slice(0, 2).map((room) => ({
      id: room.id,
      title: room.title,
      body: "Bay is open — tap to walk in.",
      onClick: () => enterRoom(room.id),
    })),
  ];

  return (
    <div ref={appRef} className={`gt-app ${layoutClasses}`} data-layout={layoutClasses}>
      <nav className="gt-nav" aria-label="Garage Talk navigation">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = screen === tab.id;
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
        {roomId ? (
          <button type="button" className="icon-button" aria-label="Back" onClick={() => setRoomId(null)}>
            <ChevronLeftIcon />
          </button>
        ) : (
          <div className="brand-mark" aria-hidden="true">
            <GearIcon />
          </div>
        )}
        <div className="brand-copy">
          <span>{title}</span>
          <small>{roomId ? "Live bay · back returns you where you came from" : "Built for every gearhead"}</small>
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

      <div key={roomId ?? screen} className="gt-scroll">
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
              liked={liked}
              onLike={(postId) => void likePost(postId)}
              onEnterRoom={enterRoom}
              onOpenRooms={() => navigate("rooms")}
              onOpenGearHead={() => navigate("gearhead")}
              onOpenLive={() => enterLane("Motorcycles")}
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
            />
          ) : (
            <GarageScreen
              user={user}
              setUser={setUser}
              onOpenVehicleBay={(type) => enterLane(roomLane(type))}
              onGoLive={() => void goLive()}
            />
          )}
        </main>
      </div>
    </div>
  );
}
