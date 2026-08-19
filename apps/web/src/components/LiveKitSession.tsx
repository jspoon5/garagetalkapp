import { LiveKitRoom, RoomAudioRenderer, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { useEffect, useState } from "react";
import { apiSend } from "../api";

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

  useEffect(() => {
    void apiSend<{ token: string; livekitUrl?: string | null; role: string }>(
      `/live/sessions/${sessionId}/token`,
      "POST",
      { role: isHost ? "host" : undefined },
    )
      .then((result) => {
        setToken(result.token);
        setLivekitUrl(result.livekitUrl ?? null);
      })
      .catch(() => setError("Could not join the live room."));
  }, [sessionId, isHost, userId]);

  if (error) return <p className="auth-error">{error}</p>;
  if (!token) return <p className="empty-state">Connecting to live video…</p>;

  const serverUrl = livekitUrl ?? "wss://mock.livekit.local";

  return (
    <div className="livekit-shell">
      <LiveKitRoom token={token} serverUrl={serverUrl} connect audio video={isHost}>
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

export function liveSessionSocketUrl(sessionId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/live/sessions/${sessionId}/ws`;
}
