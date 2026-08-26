/**
 * Smoke-test upload paths against a live GarageTalk API.
 * Usage: node scripts/probe-uploads.mjs [API_BASE]
 */
const base = (process.argv[2] ?? process.env.API_BASE ?? "https://app.garagetalk.app").replace(/\/$/, "");
const tester = {
  username: "tester",
  password: "GarageTalkTest1",
};

function cookieFrom(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  const setCookie = raw.length ? raw : [response.headers.get("set-cookie")].filter(Boolean);
  return setCookie.map((line) => String(line).split(";")[0]).join("; ");
}

async function jsonOrText(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

const headers = {
  "Content-Type": "application/json",
  Origin: base,
};

console.log(`Probing ${base}`);

const health = await fetch(`${base}/healthz`);
console.log("healthz:", health.status, await health.text());

const login = await fetch(`${base}/auth/login`, {
  method: "POST",
  headers,
  body: JSON.stringify(tester),
});
const loginBody = await jsonOrText(login);
const cookie = cookieFrom(login);
console.log("login:", login.status, loginBody.user?.username ?? loginBody.error ?? loginBody.raw);
if (!login.ok) process.exit(1);

const authHeaders = { ...headers, Cookie: cookie };

const presign = await fetch(`${base}/uploads/presign`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({
    kind: "generic",
    mimeType: "image/jpeg",
    sizeBytes: 2048,
  }),
});
const presignBody = await jsonOrText(presign);
console.log("photo presign:", presign.status, presignBody.error ?? presignBody.uploadUrl?.slice(0, 60) ?? presignBody);

if (presign.ok) {
  const tinyJpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==",
    "base64",
  );
  const put = await fetch(presignBody.uploadUrl, {
    method: presignBody.method ?? "PUT",
    headers: presignBody.headers ?? { "Content-Type": "image/jpeg" },
    body: tinyJpeg,
  });
  console.log("photo PUT:", put.status, put.statusText);
  const complete = await fetch(`${base}/uploads/${presignBody.assetId}/complete`, {
    method: "POST",
    headers: authHeaders,
    body: "{}",
  });
  const completeBody = await jsonOrText(complete);
  console.log("photo complete:", complete.status, completeBody.error ?? completeBody.asset?.publicUrl ?? completeBody);
}

const session = await fetch(`${base}/videos/upload-session`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({
    title: `probe ${new Date().toISOString()}`,
    category: "repair",
    mimeType: "video/mp4",
    sizeBytes: 1024,
  }),
});
const sessionBody = await jsonOrText(session);
console.log("video session:", session.status, {
  error: sessionBody.error,
  provider: sessionBody.upload?.provider,
  videoStatus: sessionBody.video?.status,
  uploadUrl: sessionBody.upload?.uploadUrl?.slice(0, 80),
});

if (session.ok && sessionBody.upload?.assetId) {
  const completeVideo = await fetch(`${base}/videos/${sessionBody.video.id}/complete`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ assetId: sessionBody.upload.assetId }),
  });
  const completeVideoBody = await jsonOrText(completeVideo);
  console.log("video complete:", completeVideo.status, {
    error: completeVideoBody.error,
    status: completeVideoBody.video?.status,
    hlsUrl: completeVideoBody.video?.hlsUrl?.slice(0, 80),
  });
} else if (session.ok && sessionBody.upload?.provider === "cloudflare_stream") {
  const completeVideo = await fetch(`${base}/videos/${sessionBody.video.id}/complete`, {
    method: "POST",
    headers: authHeaders,
    body: "{}",
  });
  const completeVideoBody = await jsonOrText(completeVideo);
  console.log("video complete (stream, no file uploaded):", completeVideo.status, {
    error: completeVideoBody.error,
    status: completeVideoBody.video?.status,
  });
}

const videos = await fetch(`${base}/videos`, { headers: authHeaders });
const videosBody = await jsonOrText(videos);
const rows = videosBody.videos ?? [];
const processing = rows.filter((v) => v.status === "processing");
console.log("videos:", videos.status, `${rows.length} total, ${processing.length} processing`);
for (const row of processing.slice(0, 5)) {
  console.log("  stuck?", row.id, row.title, row.streamAssetId, row.createdAt);
}
