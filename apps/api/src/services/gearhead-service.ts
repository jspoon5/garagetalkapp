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
import { z } from "zod";

export const gearHeadInputSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

type Tier = (typeof users.$inferSelect)["tier"];
type Vehicle = typeof vehicles.$inferSelect;
type ProviderPart = { name: string; retailer_links?: Record<string, string> };
type ProviderOutput = Omit<DiagnosticOutput, "parts"> & { parts: ProviderPart[] };

export const AI_TIER_QUOTAS: Record<Tier, number> = {
  amateur: 5,
  gearhead: 50,
  racing_pro: 200,
  pro: 500,
};

export type GearHeadProviderInput = {
  systemPrompt: string;
  prompt: string;
  vehicleLabel: string;
  message: string;
};

export type GearHeadProvider = {
  generate(input: GearHeadProviderInput): Promise<ProviderOutput>;
};

export class QuotaExceededError extends Error {
  constructor(readonly quota: number) {
    super("ai_quota_exceeded");
  }
}

const hazardousPattern =
  /\b(airbag|srs|high voltage|hv battery|disable brake|brake line|steering rack|fuel leak|gas tank|bypass|defeat|weld frame|structural|explosive)\b/i;

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

class DefaultGearHeadProvider implements GearHeadProvider {
  async generate(input: GearHeadProviderInput): Promise<ProviderOutput> {
    return {
      diagnosis: `Initial diagnostic direction for ${input.vehicleLabel}: ${input.message}`,
      possible_causes: ["sensor fault", "maintenance wear", "recent service issue"],
      next_steps: ["Scan for stored codes", "Inspect related connectors", "Schedule service if symptoms worsen"],
      parts: [{ name: "diagnostic scanner" }],
    };
  }
}

export class GearHeadService {
  private readonly provider: GearHeadProvider;

  constructor(
    private readonly db: Database,
    provider: GearHeadProvider = new DefaultGearHeadProvider(),
  ) {
    this.provider = provider;
  }

  async ask(userId: string, input: z.infer<typeof gearHeadInputSchema>): Promise<DiagnosticOutput> {
    const parsed = gearHeadInputSchema.parse(input);
    const user = await this.consumeQuota(userId);
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

    const output = await this.provider.generate({
      systemPrompt: SAFETY_SYSTEM_PROMPT,
      prompt,
      vehicleLabel: label,
      message: parsed.message,
    });
    return this.normalize(output, label, needsEvNotes(vehicle, parsed.message), user.tier);
  }

  private async consumeQuota(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error("user_not_found");
    const now = new Date();
    const shouldReset = !user.aiMonthResetAt || user.aiMonthResetAt.getTime() <= now.getTime();
    const currentUsage = shouldReset ? 0 : user.aiMonthUsage;
    const quota = AI_TIER_QUOTAS[user.tier];
    if (currentUsage >= quota) throw new QuotaExceededError(quota);
    const [updated] = await this.db
      .update(users)
      .set({
        aiMonthUsage: currentUsage + 1,
        aiMonthResetAt: shouldReset ? nextReset(now) : user.aiMonthResetAt,
        updatedAt: now,
      })
      .where(eq(users.id, userId))
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
    tier: Tier,
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
