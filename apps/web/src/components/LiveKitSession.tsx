import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
  useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiSend, ApiError } from "../api";

const CLIENT_ID_KEY = "gt_livekit_client_id";

function getLiveKitClientId(): string {
  try {
    const existing = sessionStorage.getItem(CLIENT_ID_KEY);
    if (existing && existing.length >= 8) return existing;
    const next = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    sessionStorage.setItem(CLIENT_ID_KEY, next);
    return next;
  } catch {
    return `tab_${Math.random().toString(36).slice(2, 12)}`;
  }
}

function HostBroadcastControls({ onAir, setOnAir }: { onAir: boolean; setOnAir: (value: boolean) => void }) {
  const { t } = useTranslation();
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
          <i /> {t("live.onAir")}
        </span>
        <button type="button" disabled={busy} onClick={() => void endBroadcast()}>
          {t("live.stopCamera")}
        </button>
      </div>
    );
  }

  return (
    <div className="livekit-backstage">
      <p>{t("live.previewReady")}</p>
      {error ? <p className="auth-error">{error}</p> : null}
      <button type="button" className="sell-button" disabled={busy} onClick={() => void goLive()}>
        {busy ? t("live.starting") : t("live.goLive")}
      </button>
    </div>
  );
}

function LeaveLiveControl({ onLeave }: { onLeave?: () => void }) {
  const { t } = useTranslation();
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
        {busy ? t("live.leaving") : t("live.leaveLive")}
      </button>
    </div>
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
  userId: string;
  isHost: boolean;
  canHostLive: boolean;
  onUpgradeRequired?: () => void;
  onLeave?: () => void;
}) {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onAir, setOnAir] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const clientId = getLiveKitClientId();
    void apiSend<{ token: string; livekitUrl?: string | null; role: string }>(
      `/live/sessions/${sessionId}/token`,
      "POST",
      { role: isHost ? "host" : "viewer", clientId },
    )
      .then((result) => {
        if (cancelled) return;
        setToken(result.token);
        setLivekitUrl(result.livekitUrl ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 402) {
          setError("Live hosting requires a paid plan.");
          onUpgradeRequired?.();
          return;
        }
        setError("Could not join the live room.");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, isHost, userId]);

  if (error) return <p className="auth-error">{error}</p>;
  if (!token) return <p className="empty-state">{t("live.connecting")}</p>;

  const serverUrl = livekitUrl ?? "wss://mock.livekit.local";

  return (
    <div className="livekit-shell">
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio={false}
        video={false}
        onDisconnected={() => setOnAir(false)}
      >
        {isHost ? (
          canHostLive ? (
            <HostBroadcastControls onAir={onAir} setOnAir={setOnAir} />
          ) : (
            <p className="empty-state">{t("live.upgradeToPublish")}</p>
          )
        ) : null}
        <LeaveLiveControl onLeave={onLeave} />
        {isHost && !onAir ? null : (
          <>
            <VideoConference />
            <RoomAudioRenderer />
          </>
        )}
      </LiveKitRoom>
    </div>
  );
}

export function liveSessionSocketUrl(sessionId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/live/sessions/${sessionId}/ws`;
}
