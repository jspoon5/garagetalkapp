import type { SubscriptionTier } from "./env.js";

/** Joe spec: amateur tier in DB maps to the free plan. */
export type AiPlanId = SubscriptionTier;

export type AiMemoryLevel = "short" | "medium" | "long" | "extended";
export type AiModelClass = "basic" | "standard" | "advanced" | "max";

export type AiPlan = {
  id: AiPlanId;
  label: string;
  monthlyQuestions: number;
  modelClass: AiModelClass;
  photosAllowed: boolean;
  memoryLevel: AiMemoryLevel;
  maxOutputTokens: number;
  priceCents: number | null;
};

export const AI_PLANS: Record<AiPlanId, AiPlan> = {
  amateur: {
    id: "amateur",
    label: "Free",
    monthlyQuestions: 10,
    modelClass: "basic",
    photosAllowed: false,
    memoryLevel: "short",
    maxOutputTokens: 500,
    priceCents: null,
  },
  gearhead: {
    id: "gearhead",
    label: "GearHead",
    monthlyQuestions: 100,
    modelClass: "standard",
    photosAllowed: true,
    memoryLevel: "medium",
    maxOutputTokens: 800,
    priceCents: 999,
  },
  racing_pro: {
    id: "racing_pro",
    label: "Racing Pro",
    monthlyQuestions: 400,
    modelClass: "advanced",
    photosAllowed: true,
    memoryLevel: "long",
    maxOutputTokens: 1200,
    priceCents: 1999,
  },
  pro: {
    id: "pro",
    label: "Pro",
    monthlyQuestions: 1000,
    modelClass: "max",
    photosAllowed: true,
    memoryLevel: "extended",
    maxOutputTokens: 1800,
    priceCents: 2999,
  },
};

const MODEL_ENV_KEYS: Record<AiModelClass, string> = {
  basic: "AI_MODEL_BASIC",
  standard: "AI_MODEL_STANDARD",
  advanced: "AI_MODEL_ADVANCED",
  max: "AI_MODEL_MAX",
};

const MODEL_DEFAULTS: Record<AiModelClass, string> = {
  basic: "gpt-4o-mini",
  standard: "gpt-4o-mini",
  advanced: "gpt-4o",
  max: "gpt-4o",
};

const UPGRADE_ORDER: AiPlanId[] = ["amateur", "gearhead", "racing_pro", "pro"];

export function resolveAiPlan(tier: AiPlanId): AiPlan {
  return AI_PLANS[tier];
}

export function resolveAiModel(modelClass: AiModelClass, env: NodeJS.ProcessEnv = process.env): string {
  const key = MODEL_ENV_KEYS[modelClass];
  const fromEnv = env[key];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return MODEL_DEFAULTS[modelClass];
}

export function planModelName(plan: AiPlan, env: NodeJS.ProcessEnv = process.env): string {
  return resolveAiModel(plan.modelClass, env);
}

/** Never trust client tier — derive effective tier from stored subscription state. */
export function getEffectiveSubscriptionTier(
  tier: AiPlanId | null | undefined,
  tierStatus: string | null | undefined,
): AiPlanId {
  if (!tier || tier === "amateur") return "amateur";
  if (tierStatus === "active" || tierStatus === "trialing") return tier;
  return "amateur";
}

export function nextUpgradeTier(current: AiPlanId): Exclude<AiPlanId, "amateur"> | null {
  const idx = UPGRADE_ORDER.indexOf(current);
  if (idx < 0 || idx >= UPGRADE_ORDER.length - 1) return null;
  const next = UPGRADE_ORDER[idx + 1]!;
  return next === "amateur" ? "gearhead" : (next as Exclude<AiPlanId, "amateur">);
}

export function estimateTokenUsage(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** @deprecated Use AI_PLANS[ tier ].monthlyQuestions */
export function aiMonthlyQuota(tier: AiPlanId): number {
  return AI_PLANS[tier].monthlyQuestions;
}
