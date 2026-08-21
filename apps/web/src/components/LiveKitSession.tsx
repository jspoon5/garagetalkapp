import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
  useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { useEffect, useState } from "react";
import { apiSend } from "../api";

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

export function LiveKitSession({
  sessionId,
  userId,
  isHost,
}: {
  sessionId: string;
  userId: string;
  isHost: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onAir, setOnAir] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiSend<{ token: string; livekitUrl?: string | null; role: string }>(
      `/live/sessions/${sessionId}/token`,
      "POST",
      { role: isHost ? "host" : "viewer" },
    )
      .then((result) => {
        if (cancelled) return;
        setToken(result.token);
        setLivekitUrl(result.livekitUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not join the live room.");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, isHost, userId]);

  if (error) return <p className="auth-error">{error}</p>;
  if (!token) return <p className="empty-state">Connecting to live video…</p>;

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
        {isHost ? <HostBroadcastControls onAir={onAir} setOnAir={setOnAir} /> : null}
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
