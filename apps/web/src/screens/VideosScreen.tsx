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

export function VideosScreen({
  user,
  onNeedAccount,
}: {
  user: User | null;
  onNeedAccount: () => void;
}) {
  const signedIn = Boolean(user);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [open, setOpen] = useState<VideoItem | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("repair");
  const [visibility, setVisibility] = useState<VideoVisibility>("draft");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshVideos = useCallback(async () => {
    const data = await apiGet<{ videos: VideoItem[] }>("/videos");
    setVideos(data.videos);
    return data.videos;
  }, []);

  useEffect(() => {
    void refreshVideos().catch(() => setError("Could not load videos."));
  }, [refreshVideos]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;

    const tick = async () => {
      const current = await refreshVideos().catch(() => [] as VideoItem[]);
      const processing = current.filter(
        (video) => video.ownerId === user?.id && video.status === "processing",
      );
      if (processing.length === 0) return;

      for (const video of processing) {
        if (cancelled) return;
        try {
          const ready = await tryCompleteVideo(video.id);
          if (ready) {
            setVideos((prev) => prev.map((row) => (row.id === ready.id ? ready : row)));
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
  }, [refreshVideos, signedIn, user?.id]);

  const myVideos = useMemo(
    () => (user ? videos.filter((video) => video.ownerId === user.id) : []),
    [videos, user],
  );

  const filteredMine = useMemo(() => {
    if (libraryFilter === "all") return myVideos;
    return myVideos.filter((video) => video.visibility === libraryFilter);
  }, [libraryFilter, myVideos]);

  const publicFeed = useMemo(
    () =>
      videos.filter(
        (video) =>
          video.visibility === "public" &&
          video.status === "ready" &&
          video.ownerId !== user?.id,
      ),
    [videos, user?.id],
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
      await refreshVideos();
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
    if (!user || video.ownerId !== user.id) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiSend<{ video: VideoItem }>(`/videos/${video.id}`, "PATCH", {
        visibility: next,
      });
      setVideos((prev) => prev.map((row) => (row.id === data.video.id ? data.video : row)));
      setNotice(`Visibility set to ${VISIBILITY_LABELS[next]}.`);
    } catch {
      setError("Could not update visibility.");
    } finally {
      setBusy(false);
    }
  }

  function renderVideoCard(video: VideoItem, owned: boolean) {
    return (
      <article className="feed-card" key={video.id}>
        <strong>{video.title}</strong>
        <p>
          {video.category} · {video.status}
          {video.visibility ? ` · ${VISIBILITY_LABELS[video.visibility]}` : ""}
          {video.likeCount ? ` · ${video.likeCount} likes` : ""}
        </p>
        <div className="profile-actions">
          <button type="button" onClick={() => setOpen(video)} disabled={video.status !== "ready"}>
            {video.status === "ready" ? (video.hlsUrl ? "Watch" : "Open") : "Processing"}
          </button>
          {owned ? (
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
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <>
      <div className="screen-intro">
        <span>VIDEO BAY</span>
        <h1>Watch and upload.</h1>
        <p>New uploads start as drafts. Only public videos appear in the shared feed.</p>
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
          {filteredMine.map((video) => renderVideoCard(video, true))}
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
      {publicFeed.map((video) => renderVideoCard(video, false))}
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
