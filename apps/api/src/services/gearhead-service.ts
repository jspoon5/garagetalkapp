import { and, eq, isNull } from "drizzle-orm";
import {
  attachRetailerLinks,
  buildVehicleDiagnosticPrompt,
  diagnosticOutputSchema,
  SAFETY_SYSTEM_PROMPT,
} from "@garagetalk/ai";
import type { DiagnosticOutput } from "@garagetalk/ai";
import type { Database } from "@garagetalk/db";
import { users, vehicles } from "@garagetalk/db";
import {
  estimateTokenUsage,
  nextUpgradeTier,
  planModelName,
  type AiPlanId,
  type AiMemoryLevel,
} from "@garagetalk/shared";
import { z } from "zod";
import { EntitlementService } from "./entitlement-service.js";

export const gearHeadInputSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  /** Client may request photo analysis; server rejects when plan disallows photos. */
  photoUrl: z.string().url().optional(),
});

type Vehicle = typeof vehicles.$inferSelect;
type ProviderPart = { name: string; retailer_links?: Record<string, string> };
type ProviderOutput = Omit<DiagnosticOutput, "parts"> & { parts: ProviderPart[] };

export type GearHeadProviderInput = {
  systemPrompt: string;
  prompt: string;
  vehicleLabel: string;
  message: string;
  model: string;
  maxOutputTokens: number;
  memoryLevel: AiMemoryLevel;
  photoUrl?: string;
};

export type GearHeadProvider = {
  generate(input: GearHeadProviderInput): Promise<ProviderOutput>;
};

export type QuotaExceededDetails = {
  quota: number;
  usage: number;
  tier: AiPlanId;
  effectiveTier: AiPlanId;
  upgradeTier: Exclude<AiPlanId, "amateur"> | null;
  resetAt: Date;
  message: string;
};

export class QuotaExceededError extends Error {
  constructor(readonly details: QuotaExceededDetails) {
    super("ai_quota_exceeded");
  }
}

export class PhotosNotAllowedError extends Error {
  constructor(readonly effectiveTier: AiPlanId) {
    super("ai_photos_not_allowed");
  }
}

export class AiConcurrentRequestError extends Error {
  constructor() {
    super("ai_request_in_flight");
  }
}

const hazardousPattern =
  /\b(airbag|srs|high voltage|hv battery|disable brake|brake line|steering rack|fuel leak|gas tank|bypass|defeat|weld frame|structural|explosive)\b/i;

const inFlight = new Set<string>();

function nextReset(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
}

function vehicleLabel(vehicle: Vehicle | null): string {
  if (!vehicle) return "general vehicle";
  return `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.fuelType})`;
}

function needsEvNotes(vehicle: Vehicle | null, message: string): boolean {
  return vehicle?.fuelType === "electric" || vehicle?.fuelType === "hybrid" || /high voltage|hv|ev/i.test(message);
}

class StubGearHeadProvider implements GearHeadProvider {
  async generate(input: GearHeadProviderInput): Promise<ProviderOutput> {
    return {
      diagnosis: `Initial diagnostic direction for ${input.vehicleLabel}: ${input.message}`,
      possible_causes: ["sensor fault", "maintenance wear", "recent service issue"],
      next_steps: ["Scan for stored codes", "Inspect related connectors", "Schedule service if symptoms worsen"],
      parts: [{ name: "diagnostic scanner" }],
    };
  }
}

const providerOutputLooseSchema = z.object({
  diagnosis: z.string().min(1),
  possible_causes: z.array(z.string()).default([]),
  next_steps: z.array(z.string()).default([]),
  parts: z
    .array(
      z.object({
        name: z.string().min(1),
        retailer_links: z.record(z.string(), z.string()).optional(),
      }),
    )
    .default([]),
  ev_safety_notes: z.string().optional(),
});

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("ai_provider_invalid_json");
  }
}

/** OpenAI-compatible chat completions client (works with OpenAI and compatible gateways). */
export class OpenAiCompatibleGearHeadProvider implements GearHeadProvider {
  constructor(
    private readonly opts: {
      apiKey: string;
      baseUrl: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async generate(input: GearHeadProviderInput): Promise<ProviderOutput> {
    const base = this.opts.baseUrl.replace(/\/$/, "");
    const url = `${base}/chat/completions`;
    const userContent: Array<Record<string, unknown>> | string = input.photoUrl
      ? [
          { type: "text", text: input.prompt },
          { type: "image_url", image_url: { url: input.photoUrl } },
        ]
      : input.prompt;

    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.35,
        max_tokens: input.maxOutputTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ai_provider_http_${res.status}:${body.slice(0, 200)}`);
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content?.trim()) throw new Error("ai_provider_empty_response");

    const parsed = providerOutputLooseSchema.parse(extractJsonObject(content));
    return {
      diagnosis: parsed.diagnosis,
      possible_causes: parsed.possible_causes,
      next_steps: parsed.next_steps,
      parts: parsed.parts,
      ev_safety_notes: parsed.ev_safety_notes,
    };
  }
}

/** Prefer live OpenAI-compatible API when AI_API_KEY is set; otherwise stub for local/tests. */
export function createDefaultGearHeadProvider(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): GearHeadProvider {
  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) return new StubGearHeadProvider();
  return new OpenAiCompatibleGearHeadProvider({
    apiKey,
    baseUrl: env.AI_BASE_URL?.trim() || "https://api.openai.com/v1",
    fetchImpl,
  });
}

export class GearHeadService {
  private readonly provider: GearHeadProvider;
  private readonly entitlements: EntitlementService;

  constructor(
    private readonly db: Database,
    provider: GearHeadProvider = createDefaultGearHeadProvider(),
    entitlements?: EntitlementService,
  ) {
    this.provider = provider;
    this.entitlements = entitlements ?? new EntitlementService(db);
  }

  async ask(userId: string, input: z.infer<typeof gearHeadInputSchema>): Promise<DiagnosticOutput> {
    if (inFlight.has(userId)) throw new AiConcurrentRequestError();
    inFlight.add(userId);
    try {
      return await this.askInner(userId, input);
    } finally {
      inFlight.delete(userId);
    }
  }

  private async askInner(userId: string, input: z.infer<typeof gearHeadInputSchema>): Promise<DiagnosticOutput> {
    const parsed = gearHeadInputSchema.parse(input);
    const entitlement = await this.entitlements.resolveForUser(userId);
    if (!entitlement) throw new Error("user_not_found");

    if (parsed.photoUrl && !entitlement.plan.photosAllowed) {
      throw new PhotosNotAllowedError(entitlement.effectiveTier);
    }

    const user = await this.consumeQuota(entitlement);
    const vehicle = parsed.vehicleId ? await this.getVehicle(userId, parsed.vehicleId) : null;
    if (parsed.vehicleId && !vehicle) throw new Error("vehicle_not_found");

    const label = vehicleLabel(vehicle);
    if (hazardousPattern.test(parsed.message)) {
      return this.hazardResponse(vehicle, parsed.message);
    }

    const prompt = vehicle
      ? buildVehicleDiagnosticPrompt({
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          fuelType: vehicle.fuelType,
          symptom: parsed.message,
        })
      : `Symptom: ${parsed.message}

Respond with JSON matching the GearHead diagnostic output schema.`;

    const model = planModelName(entitlement.plan);
    const output = await this.provider.generate({
      systemPrompt: SAFETY_SYSTEM_PROMPT,
      prompt,
      vehicleLabel: label,
      message: parsed.message,
      model,
      maxOutputTokens: entitlement.plan.maxOutputTokens,
      memoryLevel: entitlement.plan.memoryLevel,
      photoUrl: parsed.photoUrl,
    });

    const tokenEstimate = estimateTokenUsage(parsed.message) + estimateTokenUsage(output.diagnosis);
    void tokenEstimate;

    return this.normalize(output, label, needsEvNotes(vehicle, parsed.message), entitlement.effectiveTier);
  }

  private async consumeQuota(entitlement: NonNullable<Awaited<ReturnType<EntitlementService["resolveForUser"]>>>) {
    const { user, effectiveTier, plan } = entitlement;
    const now = new Date();
    const shouldReset = !user.aiMonthResetAt || user.aiMonthResetAt.getTime() <= now.getTime();
    const currentUsage = shouldReset ? 0 : user.aiMonthUsage;
    const quota = plan.monthlyQuestions;
    const resetAt = shouldReset ? nextReset(now) : user.aiMonthResetAt ?? nextReset(now);

    if (currentUsage >= quota) {
      throw new QuotaExceededError({
        quota,
        usage: currentUsage,
        tier: entitlement.storedTier,
        effectiveTier,
        upgradeTier: nextUpgradeTier(effectiveTier),
        resetAt,
        message:
          effectiveTier === "amateur"
            ? "You've used all free GearHead questions this month. Upgrade to GearHead for more diagnostics."
            : "You've reached your monthly GearHead allowance. Upgrade for a higher tier or wait until your quota resets.",
      });
    }

    const [updated] = await this.db
      .update(users)
      .set({
        aiMonthUsage: currentUsage + 1,
        aiMonthResetAt: shouldReset ? resetAt : user.aiMonthResetAt,
        updatedAt: now,
      })
      .where(eq(users.id, user.id))
      .returning();
    return updated ?? user;
  }

  private async getVehicle(userId: string, vehicleId: string) {
    const [vehicle] = await this.db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId), isNull(vehicles.deletedAt)))
      .limit(1);
    return vehicle ?? null;
  }

  private normalize(
    output: ProviderOutput,
    label: string,
    includeEvNotes: boolean,
    tier: AiPlanId,
  ): DiagnosticOutput {
    const withLinks: DiagnosticOutput = {
      diagnosis: output.diagnosis,
      possible_causes: output.possible_causes,
      next_steps: output.next_steps,
      parts: output.parts.map((part) => ({
        name: part.name,
        retailer_links: part.retailer_links ?? attachRetailerLinks([{ name: part.name }], label)[0]!.retailer_links,
      })),
      ev_safety_notes: includeEvNotes
        ? "High-voltage systems require isolation procedures and qualified service equipment."
        : output.ev_safety_notes,
    };
    const parsed = diagnosticOutputSchema.parse(withLinks);
    return tier === "amateur" ? { ...parsed, next_steps: parsed.next_steps.slice(0, 5) } : parsed;
  }

  private hazardResponse(vehicle: Vehicle | null, message: string): DiagnosticOutput {
    return {
      diagnosis: "This topic is safety-critical and needs professional inspection.",
      possible_causes: ["The described system can create serious injury, fire, or legal compliance risk."],
      next_steps: [],
      parts: [],
      ev_safety_notes: needsEvNotes(vehicle, message)
        ? "Do not open or bypass high-voltage components; contact a qualified EV technician."
        : undefined,
    };
  }
}

/** @deprecated Use AI_PLANS from @garagetalk/shared */
export const AI_TIER_QUOTAS = {
  amateur: 10,
  gearhead: 100,
  racing_pro: 400,
  pro: 1000,
} as const;
