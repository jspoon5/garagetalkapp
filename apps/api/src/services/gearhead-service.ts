import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  attachRetailerLinks,
  buildVehicleDiagnosticPrompt,
  diagnosticOutputSchema,
  SAFETY_SYSTEM_PROMPT,
} from "@garagetalk/ai";
import type { DiagnosticOutput } from "@garagetalk/ai";
import type { Database } from "@garagetalk/db";
import { gearheadMessages, gearheadThreads, users, vehicles } from "@garagetalk/db";
import {
  estimateTokenUsage,
  nextUpgradeTier,
  planModelName,
  type AiPlanId,
  type AiMemoryLevel,
} from "@garagetalk/shared";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { EntitlementService } from "./entitlement-service.js";

export const gearHeadInputSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  /** Client may request photo analysis; server rejects when plan disallows photos. */
  photoUrl: z.string().url().optional(),
});

type Vehicle = typeof vehicles.$inferSelect;
type ProviderPart = { name: string; retailer_links?: Record<string, string> };
type ProviderOutput = Omit<DiagnosticOutput, "parts"> & { parts: ProviderPart[] };

export type GearHeadHistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type GearHeadProviderInput = {
  systemPrompt: string;
  prompt: string;
  vehicleLabel: string;
  message: string;
  model: string;
  maxOutputTokens: number;
  memoryLevel: AiMemoryLevel;
  photoUrl?: string;
  history?: GearHeadHistoryMessage[];
};

export type GearHeadProvider = {
  generate(input: GearHeadProviderInput): Promise<ProviderOutput>;
};

export type GearHeadAskResult = DiagnosticOutput & { threadId: string };

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

/** Joe memory windows: short=4, standard/medium=12, long≈24, extended=40. */
function memoryWindow(level: AiMemoryLevel): number {
  switch (level) {
    case "short":
      return 4;
    case "medium":
      return 12;
    case "long":
      return 24;
    case "extended":
      return 40;
    default:
      return 4;
  }
}

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

const JSON_OUTPUT_INSTRUCTIONS = `Respond with a single JSON object using exactly these keys:
{"diagnosis": string, "possible_causes": string[], "next_steps": string[], "parts": [{"name": string}], "ev_safety_notes"?: string}
Do not wrap the object or include markdown.`;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter((s) => s.trim().length > 0);
}

function normalizeProviderJson(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  const diagnosis =
    (typeof obj.diagnosis === "string" && obj.diagnosis) ||
    (typeof obj.answer === "string" && obj.answer) ||
    (typeof obj.summary === "string" && obj.summary) ||
    (typeof obj.recommendation === "string" && obj.recommendation) ||
    (typeof obj.response === "string" && obj.response) ||
    undefined;
  const partsRaw = obj.parts ?? obj.recommended_parts ?? obj.recommendedParts;
  const parts = Array.isArray(partsRaw)
    ? partsRaw
        .map((part) => {
          if (typeof part === "string") return { name: part };
          if (part && typeof part === "object" && "name" in part) {
            return { name: String((part as { name: unknown }).name) };
          }
          return null;
        })
        .filter((p): p is { name: string } => Boolean(p?.name))
    : [];
  return {
    diagnosis,
    possible_causes: asStringArray(obj.possible_causes ?? obj.possibleCauses ?? obj.causes),
    next_steps: asStringArray(obj.next_steps ?? obj.nextSteps ?? obj.steps),
    parts,
    ev_safety_notes:
      typeof obj.ev_safety_notes === "string"
        ? obj.ev_safety_notes
        : typeof obj.evSafetyNotes === "string"
          ? obj.evSafetyNotes
          : undefined,
  };
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

    const history = (input.history ?? []).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

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
          ...history,
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

    const parsed = providerOutputLooseSchema.parse(normalizeProviderJson(extractJsonObject(content)));
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

  async ask(userId: string, input: z.infer<typeof gearHeadInputSchema>): Promise<GearHeadAskResult> {
    if (inFlight.has(userId)) throw new AiConcurrentRequestError();
    inFlight.add(userId);
    try {
      return await this.askInner(userId, input);
    } finally {
      inFlight.delete(userId);
    }
  }

  async listThreads(userId: string) {
    const rows = await this.db
      .select()
      .from(gearheadThreads)
      .where(eq(gearheadThreads.userId, userId))
      .orderBy(desc(gearheadThreads.updatedAt))
      .limit(50);
    return rows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getThread(userId: string, threadId: string) {
    const [thread] = await this.db
      .select()
      .from(gearheadThreads)
      .where(and(eq(gearheadThreads.id, threadId), eq(gearheadThreads.userId, userId)))
      .limit(1);
    if (!thread) return null;
    const messages = await this.db
      .select()
      .from(gearheadMessages)
      .where(eq(gearheadMessages.threadId, threadId))
      .orderBy(asc(gearheadMessages.createdAt))
      .limit(200);
    return {
      thread: {
        id: thread.id,
        vehicleId: thread.vehicleId,
        title: thread.title,
        createdAt: thread.createdAt.toISOString(),
        updatedAt: thread.updatedAt.toISOString(),
      },
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
      })),
    };
  }

  private async askInner(userId: string, input: z.infer<typeof gearHeadInputSchema>): Promise<GearHeadAskResult> {
    const parsed = gearHeadInputSchema.parse(input);
    const entitlement = await this.entitlements.resolveForUser(userId);
    if (!entitlement) throw new Error("user_not_found");

    if (parsed.photoUrl && !entitlement.plan.photosAllowed) {
      throw new PhotosNotAllowedError(entitlement.effectiveTier);
    }

    await this.consumeQuota(entitlement);
    const vehicle = parsed.vehicleId ? await this.getVehicle(userId, parsed.vehicleId) : null;
    if (parsed.vehicleId && !vehicle) throw new Error("vehicle_not_found");

    const thread = await this.resolveThread(userId, parsed.threadId, parsed.vehicleId, parsed.message);
    const history = await this.loadHistory(thread.id, entitlement.plan.memoryLevel);

    const label = vehicleLabel(vehicle);
    if (hazardousPattern.test(parsed.message)) {
      const hazard = this.hazardResponse(vehicle, parsed.message);
      await this.persistTurn(thread.id, parsed.message, hazard);
      return { ...hazard, threadId: thread.id };
    }

    const prompt = vehicle
      ? `${buildVehicleDiagnosticPrompt({
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          fuelType: vehicle.fuelType,
          symptom: parsed.message,
        })}

${JSON_OUTPUT_INSTRUCTIONS}`
      : `Symptom: ${parsed.message}

${JSON_OUTPUT_INSTRUCTIONS}`;

    const model = planModelName(entitlement.plan);
    const output = await this.provider.generate({
      systemPrompt: `${SAFETY_SYSTEM_PROMPT}

${JSON_OUTPUT_INSTRUCTIONS}`,
      prompt,
      vehicleLabel: label,
      message: parsed.message,
      model,
      maxOutputTokens: entitlement.plan.maxOutputTokens,
      memoryLevel: entitlement.plan.memoryLevel,
      photoUrl: parsed.photoUrl,
      history,
    });

    const tokenEstimate = estimateTokenUsage(parsed.message) + estimateTokenUsage(output.diagnosis);
    void tokenEstimate;

    const normalized = this.normalize(output, label, needsEvNotes(vehicle, parsed.message), entitlement.effectiveTier);
    await this.persistTurn(thread.id, parsed.message, normalized);
    return { ...normalized, threadId: thread.id };
  }

  private async resolveThread(
    userId: string,
    threadId: string | undefined,
    vehicleId: string | undefined,
    message: string,
  ) {
    if (threadId) {
      const [existing] = await this.db
        .select()
        .from(gearheadThreads)
        .where(and(eq(gearheadThreads.id, threadId), eq(gearheadThreads.userId, userId)))
        .limit(1);
      if (existing) {
        await this.db
          .update(gearheadThreads)
          .set({ updatedAt: new Date(), vehicleId: vehicleId ?? existing.vehicleId })
          .where(eq(gearheadThreads.id, existing.id));
        return existing;
      }
    }

    if (vehicleId) {
      const [forVehicle] = await this.db
        .select()
        .from(gearheadThreads)
        .where(and(eq(gearheadThreads.userId, userId), eq(gearheadThreads.vehicleId, vehicleId)))
        .orderBy(desc(gearheadThreads.updatedAt))
        .limit(1);
      if (forVehicle) {
        await this.db
          .update(gearheadThreads)
          .set({ updatedAt: new Date() })
          .where(eq(gearheadThreads.id, forVehicle.id));
        return forVehicle;
      }
    }

    const title = message.trim().slice(0, 80) || "GearHead chat";
    const [created] = await this.db
      .insert(gearheadThreads)
      .values({
        id: uuidv7(),
        userId,
        vehicleId: vehicleId ?? null,
        title,
      })
      .returning();
    return created!;
  }

  private async loadHistory(threadId: string, memoryLevel: AiMemoryLevel): Promise<GearHeadHistoryMessage[]> {
    const limit = memoryWindow(memoryLevel);
    const rows = await this.db
      .select()
      .from(gearheadMessages)
      .where(eq(gearheadMessages.threadId, threadId))
      .orderBy(desc(gearheadMessages.createdAt))
      .limit(limit);
    return rows.reverse().map((row) => {
      const content = row.content as Record<string, unknown>;
      const text =
        typeof content.text === "string"
          ? content.text
          : typeof content.diagnosis === "string"
            ? content.diagnosis
            : JSON.stringify(content);
      const role = row.role === "assistant" ? "assistant" : "user";
      return { role, content: text } as GearHeadHistoryMessage;
    });
  }

  private async persistTurn(threadId: string, userMessage: string, assistant: DiagnosticOutput) {
    const now = new Date();
    await this.db.insert(gearheadMessages).values([
      {
        id: uuidv7(),
        threadId,
        role: "user",
        content: { text: userMessage },
        createdAt: now,
      },
      {
        id: uuidv7(),
        threadId,
        role: "assistant",
        content: { ...assistant, text: assistant.diagnosis },
        createdAt: new Date(now.getTime() + 1),
      },
    ]);
    await this.db.update(gearheadThreads).set({ updatedAt: new Date() }).where(eq(gearheadThreads.id, threadId));
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
