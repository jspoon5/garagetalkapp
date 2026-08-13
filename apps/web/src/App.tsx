import { useEffect, useMemo, useRef, useState } from "react";
import { BellIcon, ChatBubbleIcon, GearIcon, HomeIcon, MagnifyingGlassIcon, PersonIcon } from "./icons";
import { GearHeadScreen } from "./screens/GearHeadScreen";
import { GarageScreen, type User } from "./screens/GarageScreen";
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
  const [vehicleFilter, setVehicleFilter] = useState("All");
  const [liked, setLiked] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const title = useMemo(
    () =>
      ({
        home: "Garage Talk",
        rooms: "Garage Rooms",
        gearhead: "GearHead AI",
        market: "Marketplace",
        profile: "My Garage",
      })[screen],
    [screen],
  );

  const submitQuestion = () => {
    if (!question.trim()) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setAnswer(true);
  };

  const navigate = (next: Screen) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (next === "rooms" || next === "market") setVehicleFilter("All");
    setScreen(next);
  };

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
        <div className="brand-mark" aria-hidden="true">
          <GearIcon />
        </div>
        <div className="brand-copy">
          <span>{title}</span>
          <small>Built for every gearhead</small>
        </div>
        <button type="button" className="icon-button" aria-label="Notifications">
          <BellIcon />
        </button>
      </header>

      <div key={screen} className="gt-scroll">
        <main className="gt-content">
          {screen === "home" ? (
            <HomeScreen
              liked={liked}
              onLike={() => setLiked((value) => !value)}
              onOpenRooms={() => navigate("rooms")}
              onOpenGearHead={() => navigate("gearhead")}
            />
          ) : null}
          {screen === "rooms" ? <RoomsScreen filter={vehicleFilter} setFilter={setVehicleFilter} /> : null}
          {screen === "gearhead" ? (
            <GearHeadScreen
              question={question}
              setQuestion={setQuestion}
              answer={answer}
              setAnswer={setAnswer}
              submitQuestion={submitQuestion}
            />
          ) : null}
          {screen === "market" ? <MarketplaceScreen filter={vehicleFilter} setFilter={setVehicleFilter} /> : null}
          {screen === "profile" ? <GarageScreen user={user} setUser={setUser} /> : null}
        </main>
      </div>
    </div>
  );
}
