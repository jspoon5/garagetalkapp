import { describe, expect, it } from "vitest";
import { REVENUE_SHARE_BPS, TIP_SIDE_FEE_BPS } from "@garagetalk/shared";
import { computeGiftShare } from "./services/gift-service.js";

describe("computeGiftShare SCT math", () => {
  it("100 coin tip with 4% tip-side and pro 30% yields 28 creator cents", () => {
    const share = computeGiftShare({
      coinCost: 100,
      tipSideFeeBps: TIP_SIDE_FEE_BPS,
      shareBps: REVENUE_SHARE_BPS.pro,
    });
    expect(TIP_SIDE_FEE_BPS).toBe(400);
    expect(share.grossCents).toBe(100);
    expect(share.tipSideFeeCents).toBe(4);
    expect(share.eligibleCents).toBe(96);
    expect(share.creatorShareCents).toBe(28);
    expect(share.platformFeeCents).toBe(72);
  });

  it("uses integer basis-point math for gearhead 15%", () => {
    const share = computeGiftShare({
      coinCost: 1000,
      tipSideFeeBps: 400,
      shareBps: REVENUE_SHARE_BPS.gearhead,
    });
    // tip-side 40 → eligible 960 → 15% = 144
    expect(share.tipSideFeeCents).toBe(40);
    expect(share.eligibleCents).toBe(960);
    expect(share.creatorShareCents).toBe(144);
    expect(share.platformFeeCents).toBe(960 - 144 + 40);
  });
});
