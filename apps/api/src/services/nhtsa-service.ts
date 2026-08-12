export type DecodedVin = {
  vin: string;
  source: "recorded" | "live" | "unavailable";
  make?: string;
  model?: string;
  year?: number;
  raw: Record<string, unknown>;
};

export type RecallFixture = {
  campaignId: string;
  summary: string;
  make: string;
  model: string;
  year: number;
  raw: Record<string, unknown>;
};

export interface NhtsaClient {
  decodeVin(vin: string): Promise<DecodedVin>;
  recallsForVehicle(vehicle: { make: string; model: string; year: number }): Promise<RecallFixture[]>;
}

const recordedVin = "1HGFA16526L000000";
const recordedDecode = {
  Count: 4,
  Message: "Recorded fixture",
  Results: [
    { Variable: "Make", Value: "HONDA" },
    { Variable: "Model", Value: "CIVIC" },
    { Variable: "Model Year", Value: "2006" },
    { Variable: "Vehicle Type", Value: "PASSENGER CAR" },
  ],
};

const recordedRecall: RecallFixture = {
  campaignId: "NHTSA-REC-2006-CIVIC-AIRBAG",
  make: "HONDA",
  model: "CIVIC",
  year: 2006,
  summary: "Recorded fixture: driver airbag inflator may rupture during deployment.",
  raw: { CampaignNumber: "NHTSA-REC-2006-CIVIC-AIRBAG", Component: "AIR BAGS" },
};

function value(raw: Record<string, unknown>, variable: string): string | undefined {
  const results = Array.isArray(raw.Results) ? raw.Results : [];
  const row = results.find(
    (item): item is { Variable: string; Value: string } =>
      typeof item === "object" &&
      item !== null &&
      (item as { Variable?: unknown }).Variable === variable &&
      typeof (item as { Value?: unknown }).Value === "string",
  );
  return row?.Value;
}

function normalizedDecode(vin: string, raw: Record<string, unknown>, source: DecodedVin["source"]) {
  const year = Number(value(raw, "Model Year"));
  return {
    vin,
    source,
    make: value(raw, "Make"),
    model: value(raw, "Model"),
    year: Number.isFinite(year) ? year : undefined,
    raw,
  };
}

export class RecordedNhtsaClient implements NhtsaClient {
  async decodeVin(vin: string): Promise<DecodedVin> {
    const normalizedVin = vin.trim().toUpperCase();
    if (normalizedVin === recordedVin) return normalizedDecode(normalizedVin, recordedDecode, "recorded");
    if (process.env.NHTSA_LIVE === "1") {
      const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(normalizedVin)}?format=json`;
      const res = await fetch(url);
      return normalizedDecode(normalizedVin, (await res.json()) as Record<string, unknown>, "live");
    }
    return { vin: normalizedVin, source: "unavailable", raw: { reason: "live_api_disabled" } };
  }

  async recallsForVehicle(vehicle: { make: string; model: string; year: number }): Promise<RecallFixture[]> {
    const match =
      vehicle.year === recordedRecall.year &&
      vehicle.make.toUpperCase() === recordedRecall.make &&
      vehicle.model.toUpperCase() === recordedRecall.model;
    if (match) return [recordedRecall];
    if (process.env.NHTSA_LIVE === "1") {
      const params = new URLSearchParams({
        make: vehicle.make,
        model: vehicle.model,
        modelYear: String(vehicle.year),
      });
      const res = await fetch(`https://api.nhtsa.gov/recalls/recallsByVehicle?${params}`);
      const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
      return (json.results ?? []).map((row) => ({
        campaignId: String(row.NHTSACampaignNumber ?? row.CampaignNumber ?? "unknown"),
        summary: String(row.Summary ?? row.summary ?? ""),
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        raw: row,
      }));
    }
    return [];
  }
}
