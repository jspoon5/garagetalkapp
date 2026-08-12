import { useState } from "react";
import { useTranslation } from "react-i18next";

const API = "";

type User = {
  id: string;
  email: string;
  username: string;
  bio: string | null;
  cityText: string | null;
};

export function App() {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [bio, setBio] = useState("");
  const [cityText, setCityText] = useState("");
  const [exportData, setExportData] = useState<string | null>(null);
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
    setBio(data.user.bio ?? "");
    setCityText(data.user.cityText ?? "");
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
    setBio(data.user.bio ?? "");
    setCityText(data.user.cityText ?? "");
  }

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
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-amber-400">Garage Talk</p>
        <h1 className="mt-2 text-3xl font-semibold">{t("home.title")}</h1>
        <p className="mt-2 text-slate-300">{t("home.subtitle")}</p>
        <button
          type="button"
          className="mt-3 text-sm text-slate-400 underline"
          onClick={() => i18n.changeLanguage(i18n.language === "en" ? "es" : "en")}
        >
          {t("home.language")}
        </button>
      </header>

      {user ? (
        <section className="rounded-xl bg-slate-900/80 p-5" aria-live="polite">
          <h2 className="text-xl">{t("home.signedIn", { name: user.username })}</h2>
          <p className="mt-2 text-slate-300">{user.email}</p>
          <label className="mt-4 flex flex-col gap-1 text-sm">
            {t("auth.bio")}
            <input
              data-testid="profile-bio"
              className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </label>
          <label className="mt-2 flex flex-col gap-1 text-sm">
            {t("auth.city")}
            <input
              data-testid="profile-city"
              className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={cityText}
              onChange={(e) => setCityText(e.target.value)}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="profile-save"
              className="rounded bg-amber-500 px-4 py-2 font-medium text-slate-950"
              onClick={() => void saveProfile()}
            >
              {t("auth.saveProfile")}
            </button>
            <button
              type="button"
              data-testid="export-data"
              className="rounded border border-slate-600 px-4 py-2"
              onClick={() => void exportAccount()}
            >
              {t("auth.exportData")}
            </button>
            <button
              type="button"
              data-testid="delete-account"
              className="rounded bg-red-700 px-4 py-2"
              onClick={() => void deleteAccount()}
            >
              {t("auth.deleteAccount")}
            </button>
          </div>
          {exportData ? (
            <pre
              data-testid="export-output"
              className="mt-4 max-h-40 overflow-auto rounded bg-slate-950 p-3 text-xs"
            >
              {exportData}
            </pre>
          ) : null}
        </section>
      ) : (
        <form
          className="flex flex-col gap-3 rounded-xl bg-slate-900/80 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void register();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            {t("auth.email")}
            <input
              data-testid="auth-email"
              className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("auth.username")}
            <input
              data-testid="auth-username"
              className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("auth.password")}
            <input
              data-testid="auth-password"
              className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
            />
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              data-testid="auth-register"
              className="rounded bg-amber-500 px-4 py-2 font-medium text-slate-950"
            >
              {t("auth.register")}
            </button>
            <button
              type="button"
              data-testid="auth-login"
              className="rounded border border-slate-600 px-4 py-2"
              onClick={() => void login()}
            >
              {t("auth.login")}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
