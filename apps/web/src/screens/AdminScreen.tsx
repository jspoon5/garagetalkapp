import { useEffect, useState } from "react";
import { apiGet, formatUsd, type User } from "../api";

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

type AdminUser = {
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
  onNeedAccount,
}: {
  user: User | null;
  onNeedAccount: () => void;
}) {
  const isAdmin = Boolean(user?.roles?.includes("admin"));
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadDashboard() {
    const data = await apiGet<{ stats: DashboardStats }>("/admin/dashboard");
    setStats(data.stats);
  }

  async function searchUsers(nextQuery = query) {
    const data = await apiGet<{ users: AdminUser[] }>(
      `/admin/users${nextQuery.trim() ? `?query=${encodeURIComponent(nextQuery.trim())}` : ""}`,
    );
    setUsers(data.users);
  }

  useEffect(() => {
    if (!user) return;
    if (!isAdmin) return;
    setBusy(true);
    void Promise.all([loadDashboard(), searchUsers("")])
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load admin dashboard.");
      })
      .finally(() => setBusy(false));
  }, [user?.id, isAdmin]);

  if (!user) {
    return (
      <div className="screen-intro">
        <span>ADMIN</span>
        <h1>Sign in required.</h1>
        <p>Admin tools need an authenticated admin session.</p>
        <button type="button" className="sell-button" onClick={onNeedAccount}>
          Sign in
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="screen-intro">
        <span>ADMIN</span>
        <h1>Access denied.</h1>
        <p>This area is limited to GarageTalk admins.</p>
      </div>
    );
  }

  const health = stats?.envHealth ?? {};

  return (
    <>
      <div className="screen-intro">
        <span>ADMIN</span>
        <h1>Ops dashboard.</h1>
        <p>User search, live/gift volume, and environment health (presence only — no secrets).</p>
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
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
        <article className="feed-card" key={row.id}>
          <strong>@{row.username}</strong>
          <p>
            {row.email} · {row.tier}/{row.tierStatus}
            {row.roles.includes("admin") ? " · admin" : ""}
            {row.suspendedAt ? " · suspended" : ""}
          </p>
          <p className="empty-state">{row.id}</p>
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
