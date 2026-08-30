import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend, ApiError, type User, type VideoItem, type VideoVisibility } from "../api";

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryCompleteVideo(videoId: string): Promise<VideoItem | null> {
  const res = await fetch(`/videos/${videoId}/complete`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = (await res.json()) as { video?: VideoItem | null; error?: string };
  if (data.video?.status === "ready" && data.video.hlsUrl) return data.video;
  if (data.error === "stream_still_processing") return null;
  if (data.error && !res.ok) throw new ApiError(res.status, data.error);
  return null;
}

async function finalizeStreamUpload(videoId: string): Promise<VideoItem | null> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await tryCompleteVideo(videoId);
    if (ready) return ready;
    await wait(3000);
  }
  return null;
}

const VISIBILITY_LABELS: Record<VideoVisibility, string> = {
  draft: "Draft",
  public: "Public",
  private: "Private",
};

type LibraryFilter = "all" | VideoVisibility;

export function VideoPlayerSheet({
  video,
  onClose,
}: {
  video: VideoItem;
  onClose: () => void;
}) {
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const canWatch = video.status === "ready" && Boolean(video.hlsUrl);

  return (
    <div className="sheet-scrim" role="presentation" onClick={onClose}>
      <div className="sheet" role="dialog" onClick={(event) => event.stopPropagation()}>
        <h2>{video.title}</h2>
        <p>
          {video.category}
          {video.visibility ? ` · ${VISIBILITY_LABELS[video.visibility]}` : ""}
          {video.status !== "ready" ? ` · ${video.status}` : ""}
        </p>
        {canWatch ? (
          <video
            key={video.hlsUrl ?? video.id}
            controls
            playsInline
            preload="metadata"
            crossOrigin="anonymous"
            src={video.hlsUrl ?? undefined}
            poster={video.thumbUrl ?? undefined}
            style={{ width: "100%", maxHeight: "70vh", background: "#000" }}
            onError={() =>
              setPlaybackError("Could not play this file in-app. Use Open file below.")
            }
          />
        ) : (
          <p className="empty-state">
            {video.status === "processing"
              ? "Still processing — try again in a moment."
              : "Playback URL isn’t ready yet."}
          </p>
        )}
        {playbackError ? <p className="auth-error">{playbackError}</p> : null}
        {video.hlsUrl ? (
          <a className="sell-button" href={video.hlsUrl} target="_blank" rel="noreferrer">
            Open file
          </a>
        ) : null}
        <button type="button" className="sheet-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function VideosScreen({
  user,
  onNeedAccount,
}: {
  user: User | null;
  onNeedAccount: () => void;
}) {
  const signedIn = Boolean(user);
  const [publicVideos, setPublicVideos] = useState<VideoItem[]>([]);
  const [mineVideos, setMineVideos] = useState<VideoItem[]>([]);
  const [open, setOpen] = useState<VideoItem | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("repair");
  const [visibility, setVisibility] = useState<VideoVisibility>("draft");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshPublic = useCallback(async () => {
    const data = await apiGet<{ videos: VideoItem[] }>("/videos");
    setPublicVideos(data.videos.filter((video) => video.visibility === "public" && video.status === "ready"));
    return data.videos;
  }, []);

  const refreshMine = useCallback(async () => {
    if (!user) {
      setMineVideos([]);
      return [] as VideoItem[];
    }
    const data = await apiGet<{ videos: VideoItem[] }>("/videos/mine");
    setMineVideos(data.videos);
    return data.videos;
  }, [user]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshPublic(), refreshMine()]);
  }, [refreshPublic, refreshMine]);

  useEffect(() => {
    void refreshAll().catch(() => setError("Could not load videos."));
  }, [refreshAll]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;

    const tick = async () => {
      const current = await refreshMine().catch(() => [] as VideoItem[]);
      const processing = current.filter((video) => video.status === "processing");
      if (processing.length === 0) return;

      for (const video of processing) {
        if (cancelled) return;
        try {
          const ready = await tryCompleteVideo(video.id);
          if (ready) {
            setMineVideos((prev) => prev.map((row) => (row.id === ready.id ? { ...row, ...ready } : row)));
          }
        } catch {
          // Keep polling other uploads; a single failure shouldn't stop the list.
        }
      }
    };

    void tick();
    const interval = window.setInterval(() => void tick(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshMine, signedIn]);

  const filteredMine = useMemo(() => {
    if (libraryFilter === "all") return mineVideos;
    return mineVideos.filter((video) => video.visibility === libraryFilter);
  }, [libraryFilter, mineVideos]);

  const publicFeed = useMemo(
    () => publicVideos.filter((video) => video.ownerId !== user?.id),
    [publicVideos, user?.id],
  );

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
    if (file.size > 2 * 1024 * 1024 * 1024) {
      setError("This upload path supports files up to 2 GB. Use a smaller clip.");
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
        visibility,
        mimeType: file.type || "video/mp4",
        sizeBytes: file.size,
      });

      if (/upload\.videodelivery\.net\/stub/i.test(session.upload.uploadUrl)) {
        setError("Stream not configured");
        return;
      }

      if (session.upload.provider === "cloudflare_stream") {
        const body = new FormData();
        body.append("file", file);
        const put = await fetch(session.upload.uploadUrl, { method: "POST", body });
        if (!put.ok) throw new Error("stream_put_failed");
        setNotice("Upload received — waiting for Stream to finish encoding…");
        const ready = await finalizeStreamUpload(session.video.id);
        setNotice(
          ready
            ? `Upload complete — saved as ${VISIBILITY_LABELS[visibility]}.`
            : "Upload received. Encoding is still running — we'll keep checking in the background.",
        );
      } else if (session.upload.uploadUrl.includes("stub-r2.local")) {
        await apiSend(`/videos/${session.video.id}/complete`, "POST", {
          assetId: session.upload.assetId,
        });
        setNotice(`Upload marked ready as ${VISIBILITY_LABELS[visibility]}.`);
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
        setNotice(`Upload complete — saved as ${VISIBILITY_LABELS[visibility]}.`);
      }

      setTitle("");
      setFile(null);
      await refreshAll();
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === "stream_not_configured" || err.code === "upload_storage_unconfigured")
      ) {
        setError("Stream not configured");
      } else {
        setError("Could not finish the upload. Try again in a moment.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function setVideoVisibility(video: VideoItem, next: VideoVisibility) {
    if (!user) {
      onNeedAccount();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await apiSend<{ video: VideoItem }>(`/videos/${video.id}`, "PATCH", {
        visibility: next,
      });
      setMineVideos((prev) =>
        prev.map((row) => (row.id === data.video.id ? { ...row, ...data.video } : row)),
      );
      setNotice(`Visibility set to ${VISIBILITY_LABELS[next]}.`);
      if (next === "public" || video.visibility === "public") {
        await refreshPublic().catch(() => undefined);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not update visibility (${err.code}).`
          : "Could not update visibility.",
      );
    } finally {
      setBusy(false);
    }
  }

  function renderOwnedCard(video: VideoItem) {
    const watchable = video.status === "ready" && Boolean(video.hlsUrl);
    return (
      <article className="feed-card" key={video.id}>
        <strong>{video.title}</strong>
        <p>
          {video.category} · {video.status}
          {video.visibility ? ` · ${VISIBILITY_LABELS[video.visibility]}` : ""}
          {video.likeCount ? ` · ${video.likeCount} likes` : ""}
        </p>
        <div className="profile-actions">
          <button type="button" onClick={() => setOpen(video)} disabled={!watchable && video.status !== "ready"}>
            {watchable ? "Watch" : video.status === "ready" ? "Open" : "Processing"}
          </button>
          <select
            value={video.visibility ?? "draft"}
            disabled={busy}
            onChange={(event) => void setVideoVisibility(video, event.target.value as VideoVisibility)}
            aria-label={`Visibility for ${video.title}`}
          >
            <option value="draft">Draft</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
      </article>
    );
  }

  return (
    <>
      <div className="screen-intro">
        <span>VIDEO BAY</span>
        <h1>Watch and upload.</h1>
        <p>New uploads start as drafts. Switch each clip to public or private — owners can always watch their own.</p>
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="empty-state">{notice}</p> : null}

      {signedIn ? (
        <>
          <span>MY LIBRARY</span>
          <div className="profile-actions">
            {(["all", "draft", "public", "private"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                className={libraryFilter === filter ? "sell-button" : undefined}
                onClick={() => setLibraryFilter(filter)}
              >
                {filter === "all" ? "All mine" : VISIBILITY_LABELS[filter]}
              </button>
            ))}
          </div>
          {filteredMine.map((video) => renderOwnedCard(video))}
          {filteredMine.length === 0 ? (
            <p className="empty-state">
              {libraryFilter === "all"
                ? "No uploads yet. Start one below — it stays a draft until you publish."
                : `No ${libraryFilter} videos yet.`}
            </p>
          ) : null}
        </>
      ) : null}

      <span>PUBLIC FEED</span>
      {publicFeed.map((video) => (
        <article className="feed-card" key={video.id}>
          <strong>{video.title}</strong>
          <p>
            {video.category} · public
            {video.likeCount ? ` · ${video.likeCount} likes` : ""}
          </p>
          <button
            type="button"
            onClick={() => setOpen(video)}
            disabled={video.status !== "ready" || !video.hlsUrl}
          >
            Watch
          </button>
        </article>
      ))}
      {publicFeed.length === 0 ? (
        <p className="empty-state">No public videos yet. Creators publish from their library.</p>
      ) : null}

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
          Visibility
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as VideoVisibility)}
            disabled={busy}
          >
            <option value="draft">Draft — only you see it</option>
            <option value="public">Public — everyone can watch when ready</option>
            <option value="private">Private — only you see it</option>
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
      {open ? <VideoPlayerSheet video={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
