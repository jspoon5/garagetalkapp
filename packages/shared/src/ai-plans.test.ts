import { describe, expect, it } from "vitest";
import {
  AI_PLANS,
  getEffectiveSubscriptionTier,
  nextUpgradeTier,
  planModelName,
  resolveAiModel,
  resolveAiPlan,
} from "./ai-plans.js";

describe("AI_PLANS", () => {
  it("matches Joe tier quotas and feature gates", () => {
    expect(AI_PLANS.amateur.monthlyQuestions).toBe(10);
    expect(AI_PLANS.gearhead.monthlyQuestions).toBe(100);
    expect(AI_PLANS.racing_pro.monthlyQuestions).toBe(400);
    expect(AI_PLANS.pro.monthlyQuestions).toBe(1000);
    expect(AI_PLANS.amateur.photosAllowed).toBe(false);
    expect(AI_PLANS.gearhead.photosAllowed).toBe(true);
  });

  it("maps model classes from env vars without exposing names to clients", () => {
    const env = {
      AI_MODEL_BASIC: "custom-basic",
      AI_MODEL_STANDARD: "custom-standard",
      AI_MODEL_ADVANCED: "custom-advanced",
      AI_MODEL_MAX: "custom-max",
    };
    expect(resolveAiModel("basic", env)).toBe("custom-basic");
    expect(planModelName(resolveAiPlan("pro"), env)).toBe("custom-max");
  });

  it("downgrades inactive paid tiers to amateur", () => {
    expect(getEffectiveSubscriptionTier("gearhead", "canceled")).toBe("amateur");
    expect(getEffectiveSubscriptionTier("pro", "past_due")).toBe("amateur");
    expect(getEffectiveSubscriptionTier("racing_pro", "active")).toBe("racing_pro");
    expect(getEffectiveSubscriptionTier("gearhead", "trialing")).toBe("gearhead");
  });

  it("suggests the next paid upgrade tier", () => {
    expect(nextUpgradeTier("amateur")).toBe("gearhead");
    expect(nextUpgradeTier("gearhead")).toBe("racing_pro");
    expect(nextUpgradeTier("pro")).toBeNull();
  });
});
