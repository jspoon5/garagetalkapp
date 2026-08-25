import { z } from "zod";

const streamTokenEnv = [
  "CLOUDFLARE_STREAM_TOKEN",
  "CF_STREAM_API_TOKEN",
  "CLOUDFLARE_API_TOKEN",
] as const;
const accountEnv = ["CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID", "R2_ACCOUNT_ID"] as const;
const customerEnv = [
  "CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN",
  "CF_STREAM_CUSTOMER_SUBDOMAIN",
  "STREAM_CUSTOMER_SUBDOMAIN",
] as const;

export type StreamConfig = {
  accountId: string;
  token: string;
  /** e.g. customer-xxxx — used only as playback URL fallback */
  customerSubdomain: string | null;
};

export type StreamDirectUpload = {
  uid: string;
  uploadUrl: string;
};

export type StreamVideoDetails = {
  uid: string;
  readyToStream: boolean;
  statusState: string;
  durationSeconds: number | null;
  hlsUrl: string | null;
  thumbUrl: string | null;
};

function firstEnv(keys: readonly string[], env: NodeJS.ProcessEnv): string | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function readStreamConfig(env: NodeJS.ProcessEnv = process.env): StreamConfig | null {
  const accountId = firstEnv(accountEnv, env);
  const token = firstEnv(streamTokenEnv, env);
  if (!accountId || !token) return null;
  return {
    accountId,
    token,
    customerSubdomain: firstEnv(customerEnv, env),
  };
}

/** True when STREAM_PROVIDER is cloudflare (default) or unset. */
export function streamProviderIsCloudflare(env: NodeJS.ProcessEnv = process.env): boolean {
  const provider = (env.STREAM_PROVIDER ?? "cloudflare").trim().toLowerCase();
  return provider === "cloudflare";
}

/** True when uploads should use R2 direct storage instead of Cloudflare Stream. */
export function streamProviderIsR2(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.STREAM_PROVIDER ?? "").trim().toLowerCase() === "r2";
}

export function isStubStreamUploadUrl(url: string): boolean {
  return /upload\.videodelivery\.net\/stub\b/i.test(url) || /\/stub\/cf_/i.test(url);
}

export function playbackUrlForUid(uid: string, customerSubdomain: string | null): string {
  if (customerSubdomain) {
    const host = customerSubdomain.includes(".")
      ? customerSubdomain
      : `${customerSubdomain}.cloudflarestream.com`;
    return `https://${host}/${uid}/manifest/video.m3u8`;
  }
  return `https://videodelivery.net/${uid}/manifest/video.m3u8`;
}

const directUploadResponseSchema = z.object({
  success: z.boolean(),
  result: z
    .object({
      uid: z.string().min(1),
      uploadURL: z.string().url(),
    })
    .optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

const streamVideoResponseSchema = z.object({
  success: z.boolean(),
  result: z
    .object({
      uid: z.string().min(1),
      readyToStream: z.boolean().optional(),
      duration: z.number().optional(),
      thumbnail: z.string().url().optional(),
      playback: z
        .object({
          hls: z.string().url().optional(),
        })
        .optional(),
      status: z
        .object({
          state: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

/** Creates a Cloudflare Stream direct-creator upload URL (basic POST, ≤200MB). */
export async function createStreamDirectUpload(opts: {
  accountId: string;
  token: string;
  videoId: string;
  maxDurationSeconds?: number;
  fetchImpl?: typeof fetch;
}): Promise<StreamDirectUpload> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/stream/direct_upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        maxDurationSeconds: opts.maxDurationSeconds ?? 3600,
        requireSignedURLs: false,
        meta: { videoId: opts.videoId },
      }),
    },
  );
  const json: unknown = await res.json().catch(() => null);
  const parsed = directUploadResponseSchema.safeParse(json);
  if (!parsed.success || !parsed.data.success || !parsed.data.result) {
    const detail =
      parsed.success && parsed.data.errors?.[0]?.message
        ? parsed.data.errors[0].message
        : `stream_http_${res.status}`;
    throw new Error(detail);
  }
  const uploadUrl = parsed.data.result.uploadURL;
  if (isStubStreamUploadUrl(uploadUrl)) {
    throw new Error("stream_stub_rejected");
  }
  return { uid: parsed.data.result.uid, uploadUrl };
}

/** Fetches Stream video details (status + playback) for an uploaded uid. */
export async function getStreamVideo(opts: {
  accountId: string;
  token: string;
  uid: string;
  customerSubdomain?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<StreamVideoDetails> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/stream/${opts.uid}`,
    {
      headers: { Authorization: `Bearer ${opts.token}` },
    },
  );
  const json: unknown = await res.json().catch(() => null);
  const parsed = streamVideoResponseSchema.safeParse(json);
  if (!parsed.success || !parsed.data.success || !parsed.data.result) {
    const detail =
      parsed.success && parsed.data.errors?.[0]?.message
        ? parsed.data.errors[0].message
        : `stream_http_${res.status}`;
    throw new Error(detail);
  }
  const result = parsed.data.result;
  const ready = Boolean(result.readyToStream) || result.status?.state === "ready";
  const hls =
    result.playback?.hls ??
    (ready ? playbackUrlForUid(result.uid, opts.customerSubdomain ?? null) : null);
  return {
    uid: result.uid,
    readyToStream: ready,
    statusState: result.status?.state ?? (ready ? "ready" : "pendingupload"),
    durationSeconds: result.duration ?? null,
    hlsUrl: hls,
    thumbUrl: result.thumbnail ?? null,
  };
}
