import { z } from "zod";

const placeholder = /^(change-me|replace-with|your_|xxx|TODO)/i;

function nonPlaceholder(min = 1) {
  return z
    .string()
    .min(min)
    .refine((v) => !placeholder.test(v), { message: "placeholder value not allowed in production" });
}

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: nonPlaceholder(10),
  DIRECT_DATABASE_URL: nonPlaceholder(10).optional(),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
  // Render generateValue is base64(256-bit) ≈ 44 chars; require at least that.
  SESSION_SECRET: z.string().min(32),
  AUTH_TRUSTED_ORIGINS: z.string().default("http://localhost:5173"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  STREAM_PROVIDER: z.enum(["cloudflare", "mux"]).default("cloudflare"),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_RTMP_URL: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
  AI_BASE_URL: z.string().url().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL_FAST: z.string().default("gpt-4o-mini"),
  AI_MODEL_SMART: z.string().default("gpt-4o"),
  AI_MODEL_VISION: z.string().default("gpt-4o"),
  AI_MODEL_BASIC: z.string().default("gpt-4o-mini"),
  AI_MODEL_STANDARD: z.string().default("gpt-4o-mini"),
  AI_MODEL_ADVANCED: z.string().default("gpt-4o"),
  AI_MODEL_MAX: z.string().default("gpt-4o"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SID: z.string().optional(),
  SMS_DAILY_BUDGET_USD: z.coerce.number().default(5),
  SMS_ALLOWED_COUNTRIES: z.string().default("US,CA"),
  NHTSA_BASE_URL: z.string().url().default("https://vpic.nhtsa.dot.gov/api"),
  SENTRY_DSN_WEB: z.string().optional(),
  SENTRY_DSN_API: z.string().optional(),
  PLAUSIBLE_DOMAIN: z.string().optional(),
  /** Single first-party admin email (legacy Render secret). */
  ADMIN_EMAIL: z.string().optional(),
  /** Comma-separated first-party admin emails (Joe and extras). */
  ADMIN_EMAILS: z.string().optional(),
  /** Comma-separated first-party admin usernames. */
  ADMIN_USERNAMES: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(
  raw: NodeJS.ProcessEnv = process.env,
  opts: { requireProductionSecrets?: boolean } = {},
): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }

  const env = parsed.data;
  const prod = env.NODE_ENV === "production" || opts.requireProductionSecrets;
  if (prod) {
    const required: Array<keyof AppEnv> = ["DATABASE_URL", "SESSION_SECRET", "APP_BASE_URL"];
    for (const key of required) {
      const value = env[key];
      if (typeof value !== "string" || value.length === 0 || placeholder.test(value)) {
        throw new Error(`Production refuses to start: missing/placeholder ${key}`);
      }
    }
    if (env.SESSION_SECRET.length < 32) {
      throw new Error("Production refuses to start: SESSION_SECRET must be >= 32 chars");
    }
  }
  return env;
}

export const SUBSCRIPTION_TIERS = ["amateur", "gearhead", "racing_pro", "pro"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const TIER_QUOTAS: Record<
  SubscriptionTier,
  { aiSearchesPerMonth: number; liveFeatures: boolean; listingSlots: number }
> = {
  amateur: { aiSearchesPerMonth: 10, liveFeatures: false, listingSlots: 0 },
  gearhead: { aiSearchesPerMonth: 100, liveFeatures: true, listingSlots: 5 },
  racing_pro: { aiSearchesPerMonth: 400, liveFeatures: true, listingSlots: 25 },
  pro: { aiSearchesPerMonth: 1000, liveFeatures: true, listingSlots: 100 },
};
