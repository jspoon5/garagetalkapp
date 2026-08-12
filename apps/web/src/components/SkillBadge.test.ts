import { describe, expect, it } from "vitest";
import { BADGE_DISCLAIMER, skillBadgeRenderModel } from "./SkillBadge";

describe("SkillBadge", () => {
  it("has no component render path without the required disclaimer", () => {
    const model = skillBadgeRenderModel({
      badgeId: "badge-1",
      title: "Brake Basics",
      holderName: "Learner",
    });
    expect(model.disclaimer).toBe(BADGE_DISCLAIMER);
    expect(model.disclaimer).toBe("Educational achievement — not a professional certification or license");
  });
});
