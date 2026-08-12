import { z } from "zod";

export const diagnosticHazardPattern =
  /\b(brake|airbag|srs|fuel|gas leak|high voltage| hv |structural|frame)\b/i;

export const diagnosticInputSchema = z.object({
  vehicleId: z.string().uuid(),
  symptomText: z.string().min(1).max(4000),
  photos: z.array(z.string().url()).max(12).default([]),
  audioClips: z
    .array(z.object({ url: z.string().url(), durationSec: z.number().min(0).max(600) }))
    .max(8)
    .default([]),
  dtcCodes: z.array(z.string().regex(/^[PCBU][0-9A-F]{4}$/i)).max(20).default([]),
});

export const diagnosticOutputSchema = z.object({
  hypotheses: z.array(
    z.object({
      fault: z.string(),
      confidence: z.number().min(0).max(1),
      reasoning: z.string(),
      urgency: z.enum(["low", "medium", "high", "stop_driving"]),
      diy_feasibility: z.enum(["easy", "moderate", "advanced", "professional_only"]),
      est_cost_band: z.string(),
    }),
  ),
  follow_up_questions: z.array(z.string()),
  safety_flags: z.array(z.string()),
});

export type DiagnosticOutput = z.infer<typeof diagnosticOutputSchema>;

export interface DiagnosticProvider {
  run(input: {
    symptomText: string;
    dtcCodes: string[];
    context: Record<string, unknown>;
  }): Promise<{ output: DiagnosticOutput; costCents: number; provider: string }>;
}

export class DeterministicDiagnosticProvider implements DiagnosticProvider {
  async run(input: { symptomText: string; dtcCodes: string[] }) {
    const primary = input.dtcCodes.includes("P0133")
      ? "upstream oxygen sensor slow response"
      : input.symptomText.toLowerCase().includes("misfire")
        ? "ignition misfire"
        : "general drivability fault";
    return {
      provider: "deterministic-mock",
      costCents: 42,
      output: {
        hypotheses: [
          {
            fault: primary,
            confidence: 0.62,
            reasoning: "Ranked from supplied symptoms, DTCs, vehicle context, and prior outcomes.",
            urgency: "medium" as const,
            diy_feasibility: "moderate" as const,
            est_cost_band: "$100-$400",
          },
          {
            fault: "maintenance baseline issue",
            confidence: 0.28,
            reasoning: "Service history may indicate overdue inspection items.",
            urgency: "low" as const,
            diy_feasibility: "easy" as const,
            est_cost_band: "$0-$150",
          },
        ],
        follow_up_questions: ["When did the symptom first appear?", "Does it change when warm?"],
        safety_flags: [],
      },
    };
  }
}
