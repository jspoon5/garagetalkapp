import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DotsHorizontalIcon, PersonIcon, VideoIcon } from "../icons";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { AndroidInstallPrompt, IosAddToHomeScreenInstructions } from "../components/PwaInstallPrompt";
import { Carousel } from "../components/Carousel";
import { apiGet, apiSend, type User, type Vehicle } from "../api";
import { roomImage } from "../bays";
import { images, SectionHeading, VehicleTile } from "./shared";

export type { User };

export function GarageScreen({
  user,
  setUser,
  onOpenVehicleBay,
  onGoLive,
}: {
  user: User | null;
  setUser: (user: User | null) => void;
  onOpenVehicleBay: (type: string) => void;
  onGoLive: () => void;
}) {
  return user ? (
    <SignedInGarage user={user} setUser={setUser} onOpenVehicleBay={onOpenVehicleBay} onGoLive={onGoLive} />
  ) : (
    <SignedOutGarage setUser={setUser} />
  );
}

function SignedOutGarage({ setUser }: { setUser: (user: User) => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function register() {
    setError(null);
    try {
      const data = await apiSend<{ user: User }>("/auth/register", "POST", { email, username, password });
      setUser(data.user);
    } catch {
      setError(t("auth.registerFailed"));
    }
  }

  async function login() {
    setError(null);
    try {
      const data = await apiSend<{ user: User }>("/auth/login", "POST", { username, password });
      setUser(data.user);
    } catch {
      setError(t("auth.loginFailed"));
    }
  }

  return (
    <>
      <section className="profile-hero">
        <img src={images.truck} alt="Truck in a virtual garage" decoding="async" />
        <div className="profile-shade" />
        <div className="profile-identity">
          <div className="profile-avatar">
            <PersonIcon />
          </div>
          <div>
            <span>YOUR GARAGE</span>
            <h1>{mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}</h1>
            <p>{mode === "login" ? t("auth.loginSubtitle") : t("auth.registerSubtitle")}</p>
          </div>
        </div>
      </section>
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === "login") void login();
          else void register();
        }}
      >
        {mode === "register" ? (
          <label>
            {t("auth.email")}
            <input
              data-testid="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
        ) : null}
        <label>
          {t("auth.username")}
          <input
            data-testid="auth-username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            minLength={3}
          />
        </label>
        <label>
          {t("auth.password")}
          <input
            data-testid="auth-password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={mode === "register" ? 10 : 1}
          />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <div className="auth-actions">
          {mode === "login" ? (
            <button type="submit" data-testid="auth-login">
              {t("auth.login")}
            </button>
          ) : (
            <button type="submit" data-testid="auth-register">
              {t("auth.register")}
            </button>
          )}
        </div>
        <p className="auth-switch">
          {mode === "login" ? (
            <>
              {t("auth.needAccount")}{" "}
              <button
                type="button"
                data-testid="auth-switch-register"
                onClick={() => {
                  setError(null);
                  setMode("register");
                }}
              >
                {t("auth.register")}
              </button>
            </>
          ) : (
            <>
              {t("auth.haveAccount")}{" "}
              <button
                type="button"
                data-testid="auth-switch-login"
                onClick={() => {
                  setError(null);
                  setMode("login");
                }}
              >
                {t("auth.login")}
              </button>
            </>
          )}
        </p>
        <LanguageSwitcher />
      </form>
      <div className="pwa-stack">
        <AndroidInstallPrompt />
        <IosAddToHomeScreenInstructions />
      </div>
    </>
  );
}

function SignedInGarage({
  user,
  setUser,
  onOpenVehicleBay,
  onGoLive,
}: {
  user: User;
  setUser: (user: User | null) => void;
  onOpenVehicleBay: (type: string) => void;
  onGoLive: () => void;
}) {
  const { t } = useTranslation();
  const [bio, setBio] = useState(user.bio ?? "");
  const [cityText, setCityText] = useState(user.cityText ?? "");
  const [exportData, setExportData] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(`${new Date().getFullYear()}`);
  const [type, setType] = useState("car");
  const [fuelType, setFuelType] = useState("gas");
  const [nickname, setNickname] = useState("");
  const [vehicleError, setVehicleError] = useState<string | null>(null);

  async function loadVehicles() {
    const data = await apiGet<{ vehicles: Vehicle[] }>("/garage/vehicles");
    setVehicles(data.vehicles);
  }

  useEffect(() => {
    void loadVehicles().catch(() => undefined);
  }, []);

  async function saveProfile() {
    const data = await apiSend<{ user: User }>("/auth/profile", "PATCH", {
      bio: bio || null,
      cityText: cityText || null,
    });
    setUser(data.user);
  }

  async function exportAccount() {
    const data = await apiGet<unknown>("/auth/export");
    setExportData(JSON.stringify(data));
  }

  async function deleteAccount() {
    await apiSend("/auth/delete-account", "POST");
    setUser(null);
    setExportData(null);
  }

  async function addVehicle() {
    const parsedYear = Number(year);
    if (!make.trim() || !model.trim() || !Number.isFinite(parsedYear)) {
      setVehicleError("Add make, model, and year.");
      return;
    }
    setVehicleError(null);
    await apiSend("/garage/vehicles", "POST", {
      type,
      fuelType,
      make: make.trim(),
      model: model.trim(),
      year: parsedYear,
      nickname: nickname.trim() || null,
      isPrimary: vehicles.length === 0,
    });
    setMake("");
    setModel("");
    setNickname("");
    await loadVehicles();
  }

  async function removeVehicle(id: string) {
    await apiSend(`/garage/vehicles/${id}`, "DELETE");
    await loadVehicles();
  }

  return (
    <>
      <section className="profile-hero">
        <img src={images.truck} alt={`${user.username}'s virtual garage`} decoding="async" />
        <div className="profile-shade" />
        <button
          type="button"
          className="profile-menu"
          aria-label="Edit garage"
          onClick={() => document.querySelector<HTMLInputElement>("[data-testid=profile-bio]")?.focus()}
        >
          <DotsHorizontalIcon />
        </button>
        <div className="profile-identity">
          <div className="profile-avatar">
            <PersonIcon />
          </div>
          <div>
            <span>MY GARAGE</span>
            <h1>{user.username}’s Garage</h1>
            <p>{t("home.signedIn", { name: user.username })}</p>
          </div>
        </div>
      </section>
      <div className="profile-stats">
        <div>
          <strong>{vehicles.length}</strong>
          <span>Builds</span>
        </div>
        <div>
          <strong>{vehicles.filter((vehicle) => vehicle.isPrimary).length}</strong>
          <span>Primary</span>
        </div>
        <div>
          <strong>{user.cityText ? "Pinned" : "—"}</strong>
          <span>City</span>
        </div>
      </div>
      <div className="profile-actions">
        <button type="button" onClick={() => document.querySelector<HTMLInputElement>("[data-testid=profile-bio]")?.focus()}>
          Edit garage
        </button>
        <button type="button" onClick={onGoLive}>
          <VideoIcon /> Go live
        </button>
      </div>
      <SectionHeading eyebrow="My machines" title="Vehicles & projects" action="Add" onAction={() => document.getElementById("add-vehicle")?.scrollIntoView()} />
      <Carousel ariaLabel="Vehicles and projects" className="garage-carousel" contentClassName="garage-carousel-track">
        {vehicles.map((vehicle) => (
          <VehicleTile
            key={vehicle.id}
            image={vehicle.photos[0] ?? roomImage(vehicle.type)}
            title={vehicle.nickname || `${vehicle.year} ${vehicle.make}`}
            subtitle={`${vehicle.model} · tap to open bay`}
            onClick={() => onOpenVehicleBay(vehicle.type)}
          />
        ))}
      </Carousel>
      {vehicles.length === 0 ? <p className="empty-state">Add a vehicle to unlock GearHead context and fitment badges.</p> : null}
      {vehicles.map((vehicle) => (
        <button key={`${vehicle.id}-del`} type="button" className="sheet-close" onClick={() => void removeVehicle(vehicle.id)}>
          Remove {vehicle.nickname || vehicle.model}
        </button>
      ))}
      <form
        id="add-vehicle"
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void addVehicle();
        }}
      >
        <span>ADD A MACHINE</span>
        <label>
          Type
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="car">Car</option>
            <option value="truck">Truck</option>
            <option value="motorcycle">Motorcycle</option>
          </select>
        </label>
        <label>
          Fuel
          <select value={fuelType} onChange={(event) => setFuelType(event.target.value)}>
            <option value="gas">Gas</option>
            <option value="diesel">Diesel</option>
            <option value="hybrid">Hybrid</option>
            <option value="electric">Electric</option>
          </select>
        </label>
        <label>
          Year
          <input value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" required />
        </label>
        <label>
          Make
          <input value={make} onChange={(event) => setMake(event.target.value)} required />
        </label>
        <label>
          Model
          <input value={model} onChange={(event) => setModel(event.target.value)} required />
        </label>
        <label>
          Nickname
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} />
        </label>
        {vehicleError ? <p className="auth-error">{vehicleError}</p> : null}
        <button type="submit">Save vehicle</button>
      </form>
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void saveProfile();
        }}
      >
        <p className="auth-email">{user.email}</p>
        <label>
          {t("auth.bio")}
          <input data-testid="profile-bio" value={bio} onChange={(event) => setBio(event.target.value)} />
        </label>
        <label>
          {t("auth.city")}
          <input data-testid="profile-city" value={cityText} onChange={(event) => setCityText(event.target.value)} />
        </label>
        <div className="auth-actions">
          <button type="submit" data-testid="profile-save">
            {t("auth.saveProfile")}
          </button>
          <button type="button" data-testid="export-data" onClick={() => void exportAccount()}>
            {t("auth.exportData")}
          </button>
          <button type="button" className="danger" data-testid="delete-account" onClick={() => void deleteAccount()}>
            {t("auth.deleteAccount")}
          </button>
          <button
            type="button"
            onClick={() => {
              void apiSend("/auth/logout", "POST");
              setUser(null);
            }}
          >
            {t("auth.signOut")}
          </button>
        </div>
        {exportData ? (
          <pre data-testid="export-output" className="export-output">
            {exportData}
          </pre>
        ) : null}
        <LanguageSwitcher />
      </form>
      <div className="pwa-stack">
        <AndroidInstallPrompt />
        <IosAddToHomeScreenInstructions />
      </div>
    </>
  );
}
