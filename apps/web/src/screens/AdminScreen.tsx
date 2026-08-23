import { useEffect, useState } from "react";
import {
  apiGet,
  apiSend,
  ApiError,
  type AdminStats,
  type AdminUserRow,
  type User,
} from "../api";

const TIER_LABEL: Record<AdminUserRow["tier"], string> = {
  amateur: "Free",
  gearhead: "GearHead",
  racing_pro: "Racing Pro",
  pro: "Pro",
};

export function AdminScreen({
  user,
  onNeedAccount,
}: {
  user: User | null;
  onNeedAccount: () => void;
}) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(nextQuery = query) {
    if (!user) {
      onNeedAccount();
      return;
    }
    setError(null);
    try {
      const path = nextQuery.trim()
        ? `/admin/users?query=${encodeURIComponent(nextQuery.trim())}`
        : "/admin/users";
      const [dash, listed] = await Promise.all([
        apiGet<{ stats: AdminStats }>("/admin/dashboard"),
        apiGet<{ users: AdminUserRow[] }>(path),
      ]);
      setStats(dash.stats);
      setRows(listed.users);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setError("This desk is for first-party operators. Sign in with Jeremy or Joe’s Garage Talk account.");
        setStats(null);
        setRows([]);
        return;
      }
      setError("Could not load the admin desk.");
    }
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, [user?.id]);

  async function setTier(row: AdminUserRow, tier: "pro" | "amateur") {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      const result = await apiSend<{ user: AdminUserRow }>(`/admin/users/${row.id}/tier`, "PATCH", {
        tier,
        status: tier === "pro" ? "active" : "canceled",
      });
      setRows((current) => current.map((item) => (item.id === row.id ? { ...item, ...result.user } : item)));
      setNotice(
        tier === "pro"
          ? `Granted Pro to ${row.email}. No Stripe charge was created.`
          : `Revoked Pro from ${row.email}.`,
      );
      const dash = await apiGet<{ stats: AdminStats }>("/admin/dashboard");
      setStats(dash.stats);
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

  if (!user) {
    return (
      <>
        <div className="screen-intro">
          <span>ADMIN</span>
          <h1>Operator desk.</h1>
          <p>Sign in with the same Garage Talk account Jeremy or Joe already use. There is no separate admin password.</p>
        </div>
        <button type="button" className="sell-button" data-testid="admin-need-account" onClick={onNeedAccount}>
          Sign in
        </button>
      </>
    );
  }

  return (
    <>
      <div className="screen-intro">
        <span>ADMIN</span>
        <h1>Subscribers and tiers.</h1>
        <p>
          Signed in as {user.email}. Grant or revoke Pro here — this writes a manual entitlement, not a live Stripe
          charge.
        </p>
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="empty-state">{notice}</p> : null}
      {stats ? (
        <div className="profile-stats admin-stats" data-testid="admin-stats">
          <div>
            <strong>{stats.users}</strong>
            <span>Users</span>
          </div>
          <div>
            <strong>{stats.paidUsers}</strong>
            <span>Paid</span>
          </div>
          <div>
            <strong>{stats.byTier.pro}</strong>
            <span>Pro</span>
          </div>
          <div>
            <strong>{stats.activeSubscriptions}</strong>
            <span>Subs</span>
          </div>
        </div>
      ) : null}
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void load(query);
        }}
      >
        <label>
          Find a user
          <input
            data-testid="admin-user-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="email, username, or id"
          />
        </label>
        <button type="submit" data-testid="admin-user-search">
          Search
        </button>
      </form>
      {rows.map((row) => (
        <article className="feed-card admin-user-card" key={row.id} data-testid={`admin-user-${row.username}`}>
          <strong>{row.email}</strong>
          <p>
            @{row.username} · {TIER_LABEL[row.tier] ?? row.tier}
            {row.suspendedAt ? " · suspended" : ""}
          </p>
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
      {rows.length === 0 && !error ? <p className="empty-state">No users match that search.</p> : null}
    </>
  );
}
