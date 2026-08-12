import { z } from "zod";
import { partsSearchUrls } from "@garagetalk/shared";

/** Founder IP: vehicle-context diagnostic structured output (legacy routes.ts behavior). */
export const diagnosticOutputSchema = z.object({
  diagnosis: z.string(),
  possible_causes: z.array(z.string()),
  next_steps: z.array(z.string()),
  parts: z.array(
    z.object({
      name: z.string(),
      retailer_links: z.record(z.string(), z.string()),
    }),
  ),
  ev_safety_notes: z.string().optional(),
});

export type DiagnosticOutput = z.infer<typeof diagnosticOutputSchema>;

export const SAFETY_SYSTEM_PROMPT = `You are GearHead AI, an educational automotive assistant.
Provide educational guidance only. Never provide safety-bypass instructions.
For dangerous, regulated, high-voltage, fuel-system, structural, brake, steering, airbag,
gas, appliance electrical, or safety-critical repairs, recommend licensed professionals
and do not provide step-by-step DIY instructions.`;

export function buildVehicleDiagnosticPrompt(input: {
  year: number;
  make: string;
  model: string;
  fuelType: string;
  symptom: string;
}): string {
  const vehicle = `${input.year} ${input.make} ${input.model} (${input.fuelType})`;
  return `Vehicle context: ${vehicle}
Symptom: ${input.symptom}

Respond with JSON matching {diagnosis, possible_causes[], next_steps[], parts[{name}], ev_safety_notes?}.
Include retailer search intent in parts names so links can be generated.`;
}

export function attachRetailerLinks(
  parts: Array<{ name: string }>,
  vehicleLabel: string,
): DiagnosticOutput["parts"] {
  return parts.map((p) => ({
    name: p.name,
    retailer_links: partsSearchUrls(p.name, vehicleLabel),
  }));
}
