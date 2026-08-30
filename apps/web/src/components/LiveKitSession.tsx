import {
  LiveKitRoom,
  VideoConference,
  useRemoteParticipants,
  useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { useEffect, useState } from "react";
import { apiSend, ApiError } from "../api";

const CLIENT_ID_KEY = "gt_livekit_client_id";

type PublishRole = "host" | "guest" | "mod" | "viewer";

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

function canPublishRole(role: PublishRole | null | undefined): boolean {
  return role === "host" || role === "guest" || role === "mod";
}

function deviceLabel(device: MediaDeviceInfo, index: number): string {
  if (device.label?.trim()) return device.label.trim();
  const kind = device.kind === "audioinput" ? "Microphone" : "Camera";
  return `${kind} ${index + 1}`;
}

function looksLikeRearCamera(label: string): boolean {
  return /back|rear|environment|ultra.?wide|wide.?angle/i.test(label);
}

function looksLikeFrontCamera(label: string): boolean {
  return /front|user|face|selfie/i.test(label);
}

/** Camera + mic selectors from OS devices; supports rear/front flip on phones. */
function DevicePickers({
  cameraId,
  micId,
  onCameraChange,
  onMicChange,
  onFlipCamera,
  disabled,
}: {
  cameraId: string;
  micId: string;
  onCameraChange: (deviceId: string) => void;
  onMicChange: (deviceId: string) => void;
  onFlipCamera?: () => void;
  disabled?: boolean;
}) {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [permError, setPermError] = useState<string | null>(null);

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setPermError("This browser cannot list cameras/mics.");
      return;
    }
    try {
      // Permission prompt so device labels are populated (not blank "Camera 1").
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setPermError("Allow camera and microphone access to choose a device.");
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput" && d.deviceId));
      setMics(devices.filter((d) => d.kind === "audioinput" && d.deviceId));
      setPermError(null);
    } catch {
      setPermError("Could not list cameras/mics from this device.");
    }
  }

  useEffect(() => {
    void refreshDevices();
    const onChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
  }, []);

  const hasRearAndFront =
    cameras.some((c) => looksLikeRearCamera(c.label)) &&
    cameras.some((c) => looksLikeFrontCamera(c.label) || !looksLikeRearCamera(c.label));

  return (
    <div className="livekit-devices" data-testid="live-device-pickers">
      <label>
        Camera
        <select
          value={cameraId}
          disabled={disabled || cameras.length === 0}
          onChange={(event) => onCameraChange(event.target.value)}
        >
          <option value="">Default camera</option>
          {cameras.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {deviceLabel(device, index)}
              {looksLikeRearCamera(device.label) ? " (rear)" : looksLikeFrontCamera(device.label) ? " (front)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Microphone
        <select
          value={micId}
          disabled={disabled || mics.length === 0}
          onChange={(event) => onMicChange(event.target.value)}
        >
          <option value="">Default microphone</option>
          {mics.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {deviceLabel(device, index)}
            </option>
          ))}
        </select>
      </label>
      <div className="profile-actions">
        <button type="button" disabled={disabled} onClick={() => void refreshDevices()}>
          Refresh devices
        </button>
        {onFlipCamera && (hasRearAndFront || cameras.length > 1) ? (
          <button type="button" disabled={disabled} onClick={onFlipCamera}>
            Flip / rear camera
          </button>
        ) : null}
      </div>
      {permError ? <p className="auth-error">{permError}</p> : null}
      {cameras.length === 0 && !permError ? (
        <p className="empty-state">No cameras listed yet — tap Refresh devices after allowing access.</p>
      ) : null}
    </div>
  );
}

function PublishControls({
  title,
  onAir,
  setOnAir,
}: {
  title: string;
  onAir: boolean;
  setOnAir: (value: boolean) => void;
}) {
  const room = useRoomContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraId, setCameraId] = useState("");
  const [micId, setMicId] = useState("");
  const [preferRear, setPreferRear] = useState(false);

  useEffect(() => {
    return () => {
      void room.localParticipant.setCameraEnabled(false).catch(() => undefined);
      void room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    };
  }, [room]);

  async function applyDevices(nextCameraId = cameraId, nextMicId = micId, rear = preferRear) {
    if (nextMicId) {
      await room.switchActiveDevice("audioinput", nextMicId).catch(() => undefined);
    }
    if (nextCameraId) {
      await room.switchActiveDevice("videoinput", nextCameraId).catch(() => undefined);
    }
    const videoOpts: { deviceId?: string; facingMode?: "user" | "environment" } = {};
    if (nextCameraId) videoOpts.deviceId = nextCameraId;
    else if (rear) videoOpts.facingMode = "environment";
    else videoOpts.facingMode = "user";
    const audioOpts = nextMicId ? { deviceId: nextMicId } : undefined;
    return { videoOpts, audioOpts };
  }

  async function goLive() {
    setBusy(true);
    setError(null);
    try {
      const { videoOpts, audioOpts } = await applyDevices();
      await room.localParticipant.setMicrophoneEnabled(true, audioOpts);
      await room.localParticipant.setCameraEnabled(true, videoOpts);
      setOnAir(true);
    } catch {
      setError("Could not start camera/mic. Pick a device, allow permissions, and try again.");
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

  async function onCameraChange(deviceId: string) {
    setCameraId(deviceId);
    if (!onAir) return;
    setBusy(true);
    try {
      if (deviceId) await room.switchActiveDevice("videoinput", deviceId);
      await room.localParticipant.setCameraEnabled(true, deviceId ? { deviceId } : undefined);
    } catch {
      setError("Could not switch camera.");
    } finally {
      setBusy(false);
    }
  }

  async function onMicChange(deviceId: string) {
    setMicId(deviceId);
    if (!onAir) return;
    setBusy(true);
    try {
      if (deviceId) await room.switchActiveDevice("audioinput", deviceId);
      await room.localParticipant.setMicrophoneEnabled(true, deviceId ? { deviceId } : undefined);
    } catch {
      setError("Could not switch microphone.");
    } finally {
      setBusy(false);
    }
  }

  async function flipCamera() {
    setBusy(true);
    setError(null);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
      const current = cameras.find((c) => c.deviceId === cameraId);
      const rear = cameras.find((c) => looksLikeRearCamera(c.label));
      const front = cameras.find((c) => looksLikeFrontCamera(c.label));
      let next = "";
      let nextRear = preferRear;
      if (current && looksLikeRearCamera(current.label) && front) {
        next = front.deviceId;
        nextRear = false;
      } else if (rear && (!current || !looksLikeRearCamera(current.label))) {
        next = rear.deviceId;
        nextRear = true;
      } else if (cameras.length > 1) {
        const idx = Math.max(
          0,
          cameras.findIndex((c) => c.deviceId === cameraId),
        );
        next = cameras[(idx + 1) % cameras.length]!.deviceId;
        nextRear = looksLikeRearCamera(cameras.find((c) => c.deviceId === next)?.label ?? "");
      } else {
        // Single camera / mobile facingMode flip
        nextRear = !preferRear;
        setPreferRear(nextRear);
        if (onAir) {
          await room.localParticipant.setCameraEnabled(true, {
            facingMode: nextRear ? "environment" : "user",
          });
        }
        return;
      }
      setCameraId(next);
      setPreferRear(nextRear);
      if (onAir) {
        await room.switchActiveDevice("videoinput", next);
        await room.localParticipant.setCameraEnabled(true, { deviceId: next });
      }
    } catch {
      setError("Could not flip camera. Try picking rear from the camera list.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="livekit-backstage">
      <p>{title}</p>
      <DevicePickers
        cameraId={cameraId}
        micId={micId}
        onCameraChange={(id) => void onCameraChange(id)}
        onMicChange={(id) => void onMicChange(id)}
        onFlipCamera={() => void flipCamera()}
        disabled={busy}
      />
      {error ? <p className="auth-error">{error}</p> : null}
      {onAir ? (
        <div className="livekit-controls" style={{ padding: 0, border: "none", background: "transparent" }}>
          <span className="live-pill on-air">
            <i /> ON AIR
          </span>
          <button type="button" disabled={busy} onClick={() => void endBroadcast()}>
            Stop camera
          </button>
        </div>
      ) : (
        <button type="button" className="sell-button" disabled={busy} onClick={() => void goLive()}>
          {busy ? "Starting…" : "Go live (camera + mic)"}
        </button>
      )}
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

  // VideoConference already renders remote audio; do not also mount RoomAudioRenderer
  // or multi-guest sessions double-play tracks (classic echo).
  return <VideoConference />;
}

export function LiveKitSession({
  sessionId,
  userId,
  isHost,
  canHostLive,
  tokenNonce = 0,
  onUpgradeRequired,
  onLeave,
  onRole,
}: {
  sessionId: string;
  userId: string | null;
  isHost: boolean;
  canHostLive: boolean;
  /** Bump to force a fresh LiveKit token (e.g. after guest approval). */
  tokenNonce?: number;
  onUpgradeRequired?: () => void;
  onLeave?: () => void;
  onRole?: (role: PublishRole) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [role, setRole] = useState<PublishRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onAir, setOnAir] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setToken(null);
    setLivekitUrl(null);
    setRole(null);
    setOnAir(false);
    setError(null);

    const clientId = getLiveKitClientId();
    // Do not force "viewer" for signed-in non-hosts — server uses approved guest / mod role.
    const path = userId
      ? `/live/sessions/${sessionId}/token`
      : `/live/sessions/${sessionId}/viewer-token`;
    const body = userId
      ? isHost
        ? { role: "host" as const, clientId }
        : { clientId }
      : { clientId };

    void apiSend<{ token: string; livekitUrl?: string | null; role: PublishRole }>(path, "POST", body)
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
        setRole(result.role);
        onRole?.(result.role);
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
  }, [sessionId, isHost, userId, tokenNonce, onUpgradeRequired, onRole]);

  if (error) return <p className="auth-error">{error}</p>;
  if (!token || !livekitUrl) return <p className="empty-state">Connecting to live video…</p>;

  const mayPublish = canPublishRole(role);
  const showHostPublish = isHost && canHostLive;
  const showGuestPublish = !isHost && mayPublish;

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
        {showHostPublish ? (
          <PublishControls
            title="Pick camera/mic (rear camera works for under-hood). Camera stays off until you go live."
            onAir={onAir}
            setOnAir={setOnAir}
          />
        ) : null}
        {isHost && !canHostLive ? (
          <p className="empty-state">Upgrade to publish from this session.</p>
        ) : null}
        {showGuestPublish ? (
          <PublishControls
            title="Guest spot approved — pick your camera and mic, then go live."
            onAir={onAir}
            setOnAir={setOnAir}
          />
        ) : null}
        {!isHost && role === "viewer" ? (
          <p className="empty-state">Watching as viewer. Request a guest spot to use your camera/mic.</p>
        ) : null}
        <LeaveLiveControl onLeave={onLeave} />
        {mayPublish && !onAir ? null : mayPublish ? (
          <VideoConference />
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
