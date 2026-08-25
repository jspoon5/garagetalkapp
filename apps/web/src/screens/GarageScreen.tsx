import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DotsHorizontalIcon, PersonIcon, VideoIcon } from "../icons";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { PlatformInstallGuidance } from "../components/PwaInstallPrompt";
import { Carousel } from "../components/Carousel";
import { apiGet, apiSend, ApiError, type User, type Vehicle } from "../api";
import { maxBirthYearForMinAge } from "@garagetalk/shared";
import { roomImage } from "../bays";
import { images, SectionHeading, VehicleTile } from "./shared";

export type { User };

export function GarageScreen({
  user,
  setUser,
  canHostLive,
  onOpenVehicle,
  onGoLive,
  onOpenBilling,
  onOpenPrivacy,
}: {
  user: User | null;
  setUser: (user: User | null) => void;
  canHostLive: boolean;
  onOpenVehicle: (id: string) => void;
  onGoLive: () => void;
  onOpenBilling: () => void;
  onOpenPrivacy: () => void;
}) {
  return user ? (
    <SignedInGarage
      user={user}
      setUser={setUser}
      canHostLive={canHostLive}
      onOpenVehicle={onOpenVehicle}
      onGoLive={onGoLive}
      onOpenBilling={onOpenBilling}
    />
  ) : (
    <SignedOutGarage setUser={setUser} onOpenPrivacy={onOpenPrivacy} />
  );
}

function SignedOutGarage({
  setUser,
  onOpenPrivacy,
}: {
  setUser: (user: User) => void;
  onOpenPrivacy: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [birthYear, setBirthYear] = useState(String(maxBirthYearForMinAge() - 10));
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reset = params.get("reset");
    if (reset) {
      setToken(reset);
      setMode("reset");
    }
  }, []);

  async function register() {
    setError(null);
    if (!ageConfirmed) {
      setError(t("auth.ageConfirmRequired"));
      return;
    }
    const parsedBirthYear = Number(birthYear);
    if (!Number.isInteger(parsedBirthYear)) {
      setError(t("auth.birthYearInvalid"));
      return;
    }
    try {
      const data = await apiSend<{ user: User }>("/auth/register", "POST", {
        email,
        username,
        password,
        birthYear: parsedBirthYear,
        ageConfirmed: true,
      });
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError && err.code === "underage") {
        setError(t("auth.underage"));
        return;
      }
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

  async function requestReset() {
    setError(null);
    try {
      await apiSend("/auth/password-reset/request", "POST", { email });
      setNotice(t("auth.resetSent"));
    } catch {
      setError(t("auth.resetFailed"));
    }
  }

  async function confirmReset() {
    setError(null);
    try {
      await apiSend("/auth/password-reset/confirm", "POST", { token, password });
      setNotice(t("auth.resetDone"));
      setMode("login");
    } catch {
      setError(t("auth.resetFailed"));
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
            <h1>
              {mode === "login"
                ? t("auth.loginTitle")
                : mode === "register"
                  ? t("auth.registerTitle")
                  : t("auth.resetTitle")}
            </h1>
            <p>
              {mode === "login"
                ? t("auth.loginSubtitle")
                : mode === "register"
                  ? t("auth.registerSubtitle")
                  : t("auth.resetSubtitle")}
            </p>
          </div>
        </div>
      </section>
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === "login") void login();
          else if (mode === "register") void register();
          else if (mode === "forgot") void requestReset();
          else void confirmReset();
        }}
      >
        {mode === "register" || mode === "forgot" ? (
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
        {mode === "login" || mode === "register" ? (
          <>
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
            {mode === "register" ? (
              <>
                <label>
                  {t("auth.birthYear")}
                  <select
                    data-testid="auth-birth-year"
                    value={birthYear}
                    onChange={(event) => setBirthYear(event.target.value)}
                    required
                  >
                    {Array.from({ length: 88 }, (_, index) => maxBirthYearForMinAge() - index).map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="age-confirm">
                  <input
                    type="checkbox"
                    data-testid="auth-age-confirm"
                    checked={ageConfirmed}
                    onChange={(event) => setAgeConfirmed(event.target.checked)}
                    required
                  />
                  <span>
                    {t("auth.ageConfirmPrefix")}{" "}
                    <button type="button" className="inline-link" onClick={onOpenPrivacy}>
                      {t("auth.privacyPolicy")}
                    </button>
                    {t("auth.ageConfirmSuffix")}
                  </span>
                </label>
              </>
            ) : null}
          </>
        ) : null}
        {mode === "reset" ? (
          <>
            <label>
              {t("auth.resetToken")}
              <input value={token} onChange={(event) => setToken(event.target.value)} required />
            </label>
            <label>
              {t("auth.password")}
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={10}
              />
            </label>
          </>
        ) : null}
        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="empty-state">{notice}</p> : null}
        <div className="auth-actions">
          {mode === "login" ? (
            <button type="submit" data-testid="auth-login">
              {t("auth.login")}
            </button>
          ) : mode === "register" ? (
            <button type="submit" data-testid="auth-register">
              {t("auth.register")}
            </button>
          ) : (
            <button type="submit">{mode === "forgot" ? t("auth.sendReset") : t("auth.confirmReset")}</button>
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
              {" · "}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setNotice(null);
                  setMode("forgot");
                }}
              >
                {t("auth.forgot")}
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
        <PlatformInstallGuidance />
      </div>
    </>
  );
}

function SignedInGarage({
  user,
  setUser,
  canHostLive,
  onOpenVehicle,
  onGoLive,
  onOpenBilling,
}: {
  user: User;
  setUser: (user: User | null) => void;
  canHostLive: boolean;
  onOpenVehicle: (id: string) => void;
  onGoLive: () => void;
  onOpenBilling: () => void;
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
    try {
      const data = await apiSend<{ user: User }>("/auth/profile", "PATCH", {
        bio: bio || null,
        cityText: cityText || null,
      });
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError && err.code === "username_taken") {
        setVehicleError("That username is already taken.");
        return;
      }
      setVehicleError("Could not save your garage profile. Try again.");
    }
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
    try {
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
    } catch (err) {
      if (err instanceof ApiError) {
        setVehicleError(err.details?.message && typeof err.details.message === "string"
          ? err.details.message
          : "Could not save that vehicle. Try again.");
        return;
      }
      setVehicleError("Could not save that vehicle. Try again.");
    }
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
        {canHostLive ? (
          <button type="button" onClick={onGoLive}>
            <VideoIcon /> Go live
          </button>
        ) : (
          <button type="button" onClick={onOpenBilling}>
            <VideoIcon /> Subscribe to go live
          </button>
        )}
        <button type="button" onClick={onOpenBilling}>
          Subscribe
        </button>
      </div>
      <SectionHeading eyebrow="My machines" title="Vehicles & projects" action="Add" onAction={() => document.getElementById("add-vehicle")?.scrollIntoView()} />
      <Carousel ariaLabel="Vehicles and projects" className="garage-carousel" contentClassName="garage-carousel-track">
        {vehicles.map((vehicle) => (
          <VehicleTile
            key={vehicle.id}
            image={vehicle.photos[0] ?? roomImage(vehicle.type)}
            title={vehicle.nickname || `${vehicle.year} ${vehicle.make}`}
            subtitle={`${vehicle.model} · open build`}
            onClick={() => onOpenVehicle(vehicle.id)}
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
        <PlatformInstallGuidance />
      </div>
    </>
  );
}
