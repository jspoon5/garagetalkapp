import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DotsHorizontalIcon, PersonIcon, VideoIcon } from "../icons";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { AndroidInstallPrompt, IosAddToHomeScreenInstructions } from "../components/PwaInstallPrompt";
import { Carousel } from "../components/Carousel";
import { images, SectionHeading, VehicleTile } from "./shared";

export type User = {
  id: string;
  email: string;
  username: string;
  bio: string | null;
  cityText: string | null;
};

const API = "";

export function GarageScreen({ user, setUser }: { user: User | null; setUser: (user: User | null) => void }) {
  return user ? (
    <SignedInGarage user={user} setUser={setUser} />
  ) : (
    <SignedOutGarage setUser={setUser} />
  );
}

function SignedOutGarage({ setUser }: { setUser: (user: User) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function register() {
    setError(null);
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    });
    if (!res.ok) {
      setError(t("auth.registerFailed"));
      return;
    }
    const data = (await res.json()) as { user: User };
    setUser(data.user);
  }

  async function login() {
    setError(null);
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setError(t("auth.loginFailed"));
      return;
    }
    const data = (await res.json()) as { user: User };
    setUser(data.user);
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
            <h1>Pull in and sign on.</h1>
            <p>Create an account to save builds, rooms, and live sessions.</p>
          </div>
        </div>
      </section>
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void register();
        }}
      >
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
        <label>
          {t("auth.username")}
          <input
            data-testid="auth-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label>
          {t("auth.password")}
          <input
            data-testid="auth-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={10}
          />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <div className="auth-actions">
          <button type="submit" data-testid="auth-register">
            {t("auth.register")}
          </button>
          <button type="button" data-testid="auth-login" onClick={() => void login()}>
            {t("auth.login")}
          </button>
        </div>
        <LanguageSwitcher />
      </form>
      <div className="pwa-stack">
        <AndroidInstallPrompt />
        <IosAddToHomeScreenInstructions />
      </div>
    </>
  );
}

function SignedInGarage({ user, setUser }: { user: User; setUser: (user: User | null) => void }) {
  const { t } = useTranslation();
  const [bio, setBio] = useState(user.bio ?? "");
  const [cityText, setCityText] = useState(user.cityText ?? "");
  const [exportData, setExportData] = useState<string | null>(null);

  async function saveProfile() {
    const res = await fetch(`${API}/auth/profile`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bio: bio || null, cityText: cityText || null }),
    });
    if (res.ok) {
      const data = (await res.json()) as { user: User };
      setUser(data.user);
    }
  }

  async function exportAccount() {
    const res = await fetch(`${API}/auth/export`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setExportData(JSON.stringify(data));
    }
  }

  async function deleteAccount() {
    await fetch(`${API}/auth/delete-account`, { method: "POST", credentials: "include" });
    setUser(null);
    setExportData(null);
  }

  return (
    <>
      <section className="profile-hero">
        <img src={images.truck} alt={`${user.username}'s virtual garage`} decoding="async" />
        <div className="profile-shade" />
        <button type="button" className="profile-menu" aria-label="Profile menu">
          <DotsHorizontalIcon />
        </button>
        <div className="profile-identity">
          <div className="profile-avatar">
            <PersonIcon />
          </div>
          <div>
            <span>FOUNDER GARAGE</span>
            <h1>{user.username}’s Garage</h1>
            <p>{t("home.signedIn", { name: user.username })}</p>
          </div>
        </div>
      </section>
      <div className="profile-stats">
        <div>
          <strong>14</strong>
          <span>Builds</span>
        </div>
        <div>
          <strong>2.4K</strong>
          <span>Followers</span>
        </div>
        <div>
          <strong>8</strong>
          <span>Rooms</span>
        </div>
      </div>
      <div className="profile-actions">
        <button type="button">Edit garage</button>
        <button type="button">
          <VideoIcon /> Go live
        </button>
      </div>
      <SectionHeading eyebrow="My machines" title="Vehicles & projects" action="Manage" />
      <Carousel ariaLabel="Vehicles and projects" className="garage-carousel" contentClassName="garage-carousel-track">
        <VehicleTile image={images.truck} title="Daily Driver" subtitle="Maintenance log" />
        <VehicleTile image={images.car} title="Garage Talk Build" subtitle="Project showcase" />
        <VehicleTile image={images.motorcycle} title="Bike Bench" subtitle="Saved project" />
      </Carousel>
      <section className="skills-card">
        <span>SKILLS & INTERESTS</span>
        <div>
          {["Automotive", "Right to Repair", "Smart Garage", "Creator Live"].map((skill) => (
            <b key={skill}>{skill}</b>
          ))}
        </div>
      </section>
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
