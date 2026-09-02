import { useEffect, useState, type FormEvent } from "react";
import {
  apiGet,
  apiSend,
  ApiError,
  clearAdminTotp,
  formatUsd,
  setAdminTotp,
  type User,
} from "../api";

type DashboardStats = {
  users: number;
  openReports: number;
  activeSubscriptions: number;
  liveSessions: number;
  giftCount?: number;
  giftVolumeCoins?: number;
  coinPurchases?: number;
  coinsSold?: number;
  creatorPendingCents?: number;
  creatorAvailableCents?: number;
  creatorPaidCents?: number;
  shareCount?: number;
  envHealth?: Record<string, boolean>;
};

type AdminUserRow = {
  id: string;
  email: string;
  username: string;
  roles: string[];
  tier: string;
  tierStatus: string;
  suspendedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

export function AdminScreen({
  user,
  onSignedIn,
  onSignedOut,
}: {
  user: User | null;
  onSignedIn: (user: User) => void;
  onSignedOut: () => void;
}) {
  const isAdmin = Boolean(user?.roles?.includes("admin"));
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadDashboard() {
    const data = await apiGet<{ stats: DashboardStats }>("/admin/dashboard");
    setStats(data.stats);
  }

  async function searchUsers(nextQuery = query) {
    const data = await apiGet<{ users: AdminUserRow[] }>(
      `/admin/users${nextQuery.trim() ? `?query=${encodeURIComponent(nextQuery.trim())}` : ""}`,
    );
    setUsers(data.users);
  }

  useEffect(() => {
    if (!user || !isAdmin) return;
    setBusy(true);
    void Promise.all([loadDashboard(), searchUsers("")])
      .catch((err) => {
        const code = err instanceof ApiError ? err.code : null;
        if (code === "admin_2fa_required") {
          setError("Admin 2FA required — enter your authenticator code and sign in again.");
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load admin dashboard.");
      })
      .finally(() => setBusy(false));
  }, [user?.id, isAdmin]);

  async function adminLogin(event: FormEvent) {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError(null);
    setError(null);
    try {
      if (totp.trim()) setAdminTotp(totp.trim());
      else clearAdminTotp();

      const data = await apiSend<{ user: User }>("/auth/login", "POST", {
        username: identifier.trim(),
        password,
      });
      if (!data.user.roles?.includes("admin")) {
        clearAdminTotp();
        await apiSend("/auth/logout", "POST").catch(() => undefined);
        onSignedOut();
        setLoginError(
          "That account is not an admin. Set ADMIN_EMAIL and ADMIN_PASSWORD on the API (Render), redeploy, then sign in here.",
        );
        return;
      }
      onSignedIn(data.user);
      setPassword("");
    } catch (err) {
      clearAdminTotp();
      setLoginError(
        err instanceof ApiError
          ? err.code === "invalid_credentials"
            ? "Wrong email/username or password."
            : `Sign-in failed (${err.code}).`
          : "Sign-in failed.",
      );
    } finally {
      setLoginBusy(false);
    }
  }

  async function adminLogout() {
    clearAdminTotp();
    await apiSend("/auth/logout", "POST").catch(() => undefined);
    onSignedOut();
    setStats(null);
    setUsers([]);
  }

  async function setTier(row: AdminUserRow, tier: "pro" | "amateur") {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      const result = await apiSend<{ user: AdminUserRow }>(`/admin/users/${row.id}/tier`, "PATCH", {
        tier,
        status: tier === "pro" ? "active" : "canceled",
      });
      setUsers((current) => current.map((item) => (item.id === row.id ? { ...item, ...result.user } : item)));
      setNotice(
        tier === "pro"
          ? `Granted Pro to ${row.email}. No Stripe charge was created.`
          : `Revoked Pro from ${row.email}.`,
      );
      await loadDashboard().catch(() => undefined);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Session expired. Sign in again.");
        return;
      }
      setError(`Could not update ${row.email}.`);
    } finally {
      setBusyId(null);
    }
  }

  if (!user || !isAdmin) {
    return (
      <div className="screen-intro">
        <span>ADMIN</span>
        <h1>Admin login</h1>
        <p>Sign in with Joe’s operator account. Username joe or email joe@garagetalk.app. Same password we issued — Joe does not register himself.</p>
        {user && !isAdmin ? (
          <p className="auth-error">
            Signed in as @{user.username}, but that account is not an admin. Use the operator login below.
          </p>
        ) : null}
        <form className="auth-card" onSubmit={(event) => void adminLogin(event)}>
          <label>
            Email or username
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              required
              disabled={loginBusy}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              disabled={loginBusy}
            />
          </label>
          <label>
            Authenticator code (only if 2FA is enrolled)
            <input
              value={totp}
              onChange={(event) => setTotp(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              disabled={loginBusy}
            />
          </label>
          {loginError ? <p className="auth-error">{loginError}</p> : null}
          <button type="submit" className="sell-button" disabled={loginBusy}>
            {loginBusy ? "Signing in…" : "Sign in to admin"}
          </button>
        </form>
        {user ? (
          <button type="button" className="ghost-button" onClick={() => void adminLogout()}>
            Sign out current session
          </button>
        ) : null}
      </div>
    );
  }

  const health = stats?.envHealth ?? {};

  return (
    <>
      <div className="screen-intro">
        <span>ADMIN</span>
        <h1>Ops dashboard</h1>
        <p>
          Signed in as @{user.username}. User search, live/gift volume, and environment health (presence only — no
          secrets).
        </p>
        <button type="button" className="ghost-button" onClick={() => void adminLogout()}>
          Sign out
        </button>
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="empty-state">{notice}</p> : null}
      {busy && !stats ? <p className="empty-state">Loading…</p> : null}

      {stats ? (
        <div className="admin-grid">
          <div className="admin-stat">
            <strong>{stats.users}</strong>
            <span>Users</span>
          </div>
          <div className="admin-stat">
            <strong>{stats.liveSessions}</strong>
            <span>Live sessions</span>
          </div>
          <div className="admin-stat">
            <strong>{stats.coinPurchases ?? 0}</strong>
            <span>Coin purchases</span>
          </div>
          <div className="admin-stat">
            <strong>{stats.giftCount ?? 0}</strong>
            <span>Gifts sent</span>
          </div>
          <div className="admin-stat">
            <strong>{stats.giftVolumeCoins ?? 0}</strong>
            <span>Gift volume (coins)</span>
          </div>
          <div className="admin-stat">
            <strong>{formatUsd(stats.creatorPendingCents ?? 0)}</strong>
            <span>Creator pending</span>
          </div>
          <div className="admin-stat">
            <strong>{formatUsd(stats.creatorAvailableCents ?? 0)}</strong>
            <span>Creator available</span>
          </div>
          <div className="admin-stat">
            <strong>{stats.shareCount ?? 0}</strong>
            <span>Shares</span>
          </div>
          <div className="admin-stat">
            <strong>{stats.openReports}</strong>
            <span>Open reports</span>
          </div>
          <div className="admin-stat">
            <strong>{stats.activeSubscriptions}</strong>
            <span>Active subs</span>
          </div>
        </div>
      ) : null}

      <span>ENV HEALTH</span>
      <div className="admin-health">
        {Object.entries(health).map(([key, ok]) => (
          <span key={key} className={`admin-health-flag${ok ? "" : " off"}`}>
            {key}: {ok ? "configured" : "missing"}
          </span>
        ))}
        {Object.keys(health).length === 0 ? <span className="empty-state">No flags yet.</span> : null}
      </div>

      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void searchUsers().catch(() => setError("User search failed."));
        }}
      >
        <span>USER SEARCH</span>
        <label>
          Email / username / id
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button type="submit">Search</button>
      </form>

      {users.map((row) => (
        <article className="feed-card" key={row.id} data-testid={`admin-user-${row.username}`}>
          <strong>@{row.username}</strong>
          <p>
            {row.email} · {row.tier}/{row.tierStatus}
            {row.roles.includes("admin") ? " · admin" : ""}
            {row.suspendedAt ? " · suspended" : ""}
          </p>
          <p className="empty-state">{row.id}</p>
          <div className="admin-user-actions">
            <button
              type="button"
              data-testid={`admin-grant-pro-${row.username}`}
              disabled={busyId === row.id || row.tier === "pro"}
              onClick={() => void setTier(row, "pro")}
            >
              Grant Pro
            </button>
            <button
              type="button"
              data-testid={`admin-revoke-pro-${row.username}`}
              disabled={busyId === row.id || row.tier === "amateur"}
              onClick={() => void setTier(row, "amateur")}
            >
              Revoke
            </button>
          </div>
        </article>
      ))}

      <button
        type="button"
        className="sell-button"
        onClick={() => {
          void loadDashboard().catch(() => setError("Refresh failed."));
        }}
      >
        Refresh stats
      </button>
    </>
  );
}
