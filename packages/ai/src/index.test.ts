import { describe, expect, it } from "vitest";
import { attachRetailerLinks, buildVehicleDiagnosticPrompt } from "./index.js";

describe("gearhead prompts", () => {
  it("injects vehicle context", () => {
    const prompt = buildVehicleDiagnosticPrompt({
      year: 2019,
      make: "Toyota",
      model: "Rav4",
      fuelType: "hybrid",
      symptom: "check engine light",
    });
    expect(prompt).toContain("2019 Toyota Rav4");
  });

  it("attaches retailer links", () => {
    const parts = attachRetailerLinks([{ name: "oxygen sensor" }], "2019 Toyota Rav4");
    expect(parts[0]?.retailer_links.autozone).toContain("autozone.com");
  });
});
