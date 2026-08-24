import { useEffect, useState } from "react";
import { apiGet, apiSend, ApiError, type VideoItem } from "../api";

export function VideosScreen({
  signedIn,
  onNeedAccount,
}: {
  signedIn: boolean;
  onNeedAccount: () => void;
}) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [open, setOpen] = useState<VideoItem | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("repair");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshVideos() {
    const data = await apiGet<{ videos: VideoItem[] }>("/videos");
    setVideos(data.videos);
  }

  useEffect(() => {
    void refreshVideos().catch(() => setError("Could not load videos."));
  }, []);

  async function upload() {
    if (!signedIn) {
      onNeedAccount();
      return;
    }
    if (!title.trim()) {
      setError("Add a title before uploading.");
      return;
    }
    if (!file) {
      setError("Choose a video file to upload.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const session = await apiSend<{
        video: VideoItem;
        upload: {
          provider: string;
          uploadUrl: string;
          method: "PUT" | "POST";
          headers: Record<string, string>;
          assetId: string | null;
        };
      }>("/videos/upload-session", "POST", {
        title: title.trim(),
        category,
        mimeType: file.type || "video/mp4",
        sizeBytes: file.size,
      });

      if (session.upload.provider === "cloudflare_stream") {
        const body = new FormData();
        body.append("file", file);
        const put = await fetch(session.upload.uploadUrl, { method: "POST", body });
        if (!put.ok) throw new Error("stream_put_failed");
        setNotice("Upload received. Transcoding usually finishes in a minute — pull to refresh.");
      } else if (session.upload.uploadUrl.includes("stub-r2.local")) {
        await apiSend(`/videos/${session.video.id}/complete`, "POST", {
          assetId: session.upload.assetId,
        });
        setNotice("Upload marked ready in local/stub mode.");
      } else {
        const put = await fetch(session.upload.uploadUrl, {
          method: session.upload.method,
          headers: session.upload.headers,
          body: file,
        });
        if (!put.ok) throw new Error("r2_put_failed");
        await apiSend(`/videos/${session.video.id}/complete`, "POST", {
          assetId: session.upload.assetId,
        });
        setNotice("Upload complete — your clip is ready to watch.");
      }

      setTitle("");
      setFile(null);
      await refreshVideos();
    } catch (err) {
      if (err instanceof ApiError && err.code === "upload_storage_unconfigured") {
        setError("Video storage isn’t configured on the server yet (needs R2 or Cloudflare Stream).");
      } else {
        setError("Could not finish the upload. Try again in a moment.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="screen-intro">
        <span>VIDEO BAY</span>
        <h1>Watch and upload.</h1>
        <p>Catalog from the Garage Talk API. Playback uses HLS when a rendition is ready.</p>
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="empty-state">{notice}</p> : null}
      {videos.map((video) => (
        <article className="feed-card" key={video.id}>
          <strong>{video.title}</strong>
          <p>
            {video.category} · {video.status}
            {video.likeCount ? ` · ${video.likeCount} likes` : ""}
          </p>
          <button type="button" onClick={() => setOpen(video)} disabled={video.status !== "ready"}>
            {video.status === "ready" ? (video.hlsUrl ? "Watch" : "Open") : "Processing"}
          </button>
        </article>
      ))}
      {videos.length === 0 ? <p className="empty-state">No ready videos yet. Start an upload below.</p> : null}
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (!signedIn) {
            onNeedAccount();
            return;
          }
          void upload();
        }}
      >
        <span>UPLOAD</span>
        <label>
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required={signedIn}
            disabled={busy}
          />
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            disabled={busy}
          >
            <option value="repair">Repair</option>
            <option value="restoration">Restoration</option>
            <option value="review">Review</option>
            <option value="racing">Racing</option>
            <option value="diy">DIY</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Video file
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            required={signedIn}
            disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" disabled={busy}>
          {signedIn ? (busy ? "Uploading…" : "Upload video") : "Sign in to upload"}
        </button>
      </form>
      {open ? (
        <div className="sheet-scrim" role="presentation" onClick={() => setOpen(null)}>
          <div className="sheet" role="dialog" onClick={(event) => event.stopPropagation()}>
            <h2>{open.title}</h2>
            <p>{open.description ?? "No description yet."}</p>
            {open.hlsUrl ? (
              <video controls playsInline src={open.hlsUrl} poster={open.thumbUrl ?? undefined} />
            ) : (
              <p className="empty-state">Playback URL isn’t ready yet.</p>
            )}
            <button type="button" className="sheet-close" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
