import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
  useRemoteParticipants,
  useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { useEffect, useState } from "react";
import { apiSend, ApiError } from "../api";

const CLIENT_ID_KEY = "gt_livekit_client_id";

/** Stable ≥8 char client id for LiveKit viewer identity (session + fallbacks). */
export function getLiveKitClientId(): string {
  try {
    const existing = sessionStorage.getItem(CLIENT_ID_KEY);
    if (existing && existing.replace(/[^a-zA-Z0-9_-]/g, "").length >= 8) return existing;
  } catch {
    // private mode / blocked storage
  }

  let next = "";
  try {
    next = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  } catch {
    next = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
  if (next.replace(/[^a-zA-Z0-9_-]/g, "").length < 8) {
    next = `guest_${Date.now().toString(36)}`;
  }
  try {
    sessionStorage.setItem(CLIENT_ID_KEY, next);
  } catch {
    // ignore
  }
  return next;
}

function joinErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : "Could not join the live room.";
  }
  if (err.status === 402 || err.code === "upgrade_required") {
    return "Live hosting requires a paid plan.";
  }
  if (err.code === "csrf_failed") {
    return "Could not join the live room (security check failed). Refresh and try again.";
  }
  if (err.code === "validation_error" || err.code === "invalid_client" || err.status === 400) {
    return "Could not join the live room (invalid viewer id). Refresh and try again.";
  }
  if (err.code === "not_found" || err.status === 404) {
    return "This live session was not found.";
  }
  if (err.code === "livekit_not_configured") {
    return "Live video is not configured on the server.";
  }
  const detail =
    err.details && typeof err.details.message === "string" ? err.details.message : null;
  return detail ? `${err.code}: ${detail}` : `Could not join the live room (${err.code}).`;
}

function HostBroadcastControls({ onAir, setOnAir }: { onAir: boolean; setOnAir: (value: boolean) => void }) {
  const room = useRoomContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      void room.localParticipant.setCameraEnabled(false).catch(() => undefined);
      void room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    };
  }, [room]);

  async function goLive() {
    setBusy(true);
    setError(null);
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.localParticipant.setCameraEnabled(true);
      setOnAir(true);
    } catch {
      setError("Could not start camera/mic. Check browser permissions and try again.");
      await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
      await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function endBroadcast() {
    setBusy(true);
    try {
      await room.localParticipant.setCameraEnabled(false);
      await room.localParticipant.setMicrophoneEnabled(false);
      setOnAir(false);
    } finally {
      setBusy(false);
    }
  }

  if (onAir) {
    return (
      <div className="livekit-controls">
        <span className="live-pill on-air">
          <i /> ON AIR
        </span>
        <button type="button" disabled={busy} onClick={() => void endBroadcast()}>
          Stop camera
        </button>
      </div>
    );
  }

  return (
    <div className="livekit-backstage">
      <p>Preview connected. Camera and mic stay off until you go live.</p>
      {error ? <p className="auth-error">{error}</p> : null}
      <button type="button" className="sell-button" disabled={busy} onClick={() => void goLive()}>
        {busy ? "Starting…" : "Go live (camera + mic)"}
      </button>
    </div>
  );
}

function LeaveLiveControl({ onLeave }: { onLeave?: () => void }) {
  const room = useRoomContext();
  const [busy, setBusy] = useState(false);

  async function leave() {
    setBusy(true);
    try {
      await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
      await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      await room.disconnect();
    } finally {
      setBusy(false);
      onLeave?.();
    }
  }

  return (
    <div className="livekit-controls">
      <button type="button" disabled={busy} onClick={() => void leave()}>
        {busy ? "Leaving…" : "Leave live"}
      </button>
    </div>
  );
}

/** Viewer stage: real conference when someone is publishing; otherwise waiting copy. */
function ViewerStage() {
  const remotes = useRemoteParticipants();
  const publishing = remotes.some(
    (participant) =>
      participant.isCameraEnabled ||
      participant.isMicrophoneEnabled ||
      participant.isScreenShareEnabled ||
      [...participant.trackPublications.values()].some((pub) => pub.track && !pub.isMuted),
  );

  if (!publishing) {
    return (
      <p className="empty-state" data-testid="live-waiting-for-host">
        Connected — waiting for the host to start broadcasting.
      </p>
    );
  }

  return (
    <>
      <VideoConference />
      <RoomAudioRenderer />
    </>
  );
}

export function LiveKitSession({
  sessionId,
  userId,
  isHost,
  canHostLive,
  onUpgradeRequired,
  onLeave,
}: {
  sessionId: string;
  userId: string | null;
  isHost: boolean;
  canHostLive: boolean;
  onUpgradeRequired?: () => void;
  onLeave?: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onAir, setOnAir] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const clientId = getLiveKitClientId();
    const path = userId
      ? `/live/sessions/${sessionId}/token`
      : `/live/sessions/${sessionId}/viewer-token`;
    const body = userId
      ? { role: isHost ? "host" : "viewer", clientId }
      : { clientId };
    void apiSend<{ token: string; livekitUrl?: string | null; role: string }>(path, "POST", body)
      .then((result) => {
        if (cancelled) return;
        if (!result.livekitUrl) {
          setError("Live video is not configured (missing LiveKit URL).");
          console.error("[live] token ok but livekitUrl missing", { sessionId, role: result.role });
          return;
        }
        if (/mock\.livekit\.local/i.test(result.livekitUrl)) {
          setError("Live video is misconfigured (mock LiveKit URL).");
          console.error("[live] refused mock LiveKit URL", result.livekitUrl);
          return;
        }
        setToken(result.token);
        setLivekitUrl(result.livekitUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[live] join failed", err);
        if (err instanceof ApiError && err.status === 402) {
          setError("Live hosting requires a paid plan.");
          onUpgradeRequired?.();
          return;
        }
        setError(joinErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, isHost, userId, onUpgradeRequired]);

  if (error) return <p className="auth-error">{error}</p>;
  if (!token || !livekitUrl) return <p className="empty-state">Connecting to live video…</p>;

  return (
    <div className="livekit-shell" data-testid="livekit-shell">
      <LiveKitRoom
        token={token}
        serverUrl={livekitUrl}
        connect
        audio={false}
        video={false}
        onDisconnected={() => setOnAir(false)}
        onError={(err) => {
          console.error("[live] LiveKitRoom error", err);
          setError(err instanceof Error ? err.message : "LiveKit connection failed.");
        }}
      >
        {isHost ? (
          canHostLive ? (
            <HostBroadcastControls onAir={onAir} setOnAir={setOnAir} />
          ) : (
            <p className="empty-state">Upgrade to publish from this session.</p>
          )
        ) : null}
        <LeaveLiveControl onLeave={onLeave} />
        {isHost && !onAir ? null : isHost ? (
          <>
            <VideoConference />
            <RoomAudioRenderer />
          </>
        ) : (
          <ViewerStage />
        )}
      </LiveKitRoom>
    </div>
  );
}

export function liveSessionSocketUrl(sessionId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/live/sessions/${sessionId}/ws`;
}
