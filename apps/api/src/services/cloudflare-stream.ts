import { z } from "zod";

const streamTokenEnv = ["CLOUDFLARE_STREAM_TOKEN", "CF_STREAM_API_TOKEN", "CLOUDFLARE_API_TOKEN"] as const;
const accountEnv = ["CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID", "R2_ACCOUNT_ID"] as const;

export type StreamDirectUpload = {
  uid: string;
  uploadUrl: string;
};

function firstEnv(keys: readonly string[], env: NodeJS.ProcessEnv): string | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function readStreamConfig(env: NodeJS.ProcessEnv = process.env): {
  accountId: string;
  token: string;
} | null {
  const accountId = firstEnv(accountEnv, env);
  const token = firstEnv(streamTokenEnv, env);
  if (!accountId || !token) return null;
  return { accountId, token };
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

/** Creates a Cloudflare Stream direct-creator upload URL. */
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
  const json: unknown = await res.json();
  const parsed = directUploadResponseSchema.safeParse(json);
  if (!parsed.success || !parsed.data.success || !parsed.data.result) {
    const detail =
      parsed.success && parsed.data.errors?.[0]?.message
        ? parsed.data.errors[0].message
        : `stream_http_${res.status}`;
    throw new Error(detail);
  }
  return { uid: parsed.data.result.uid, uploadUrl: parsed.data.result.uploadURL };
}
