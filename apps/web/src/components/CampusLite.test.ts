import { describe, expect, it } from "vitest";
import {
  CAMPUS_LITE_LOAD_BUDGET,
  campusListModeItems,
  liveBadgeCount,
  type CampusLiteHotspot,
} from "./CampusLite";

describe("Campus Lite", () => {
  it("makes list mode keyboard navigable and applies the D1 badge threshold", () => {
    const hotspots: CampusLiteHotspot[] = [
      { id: "learn", label: "Learn", href: "/learn", x: 80, y: 100, activityCount: 2 },
      { id: "live", label: "Live", href: "/live", x: 180, y: 90, activityCount: 3 },
    ];
    const items = campusListModeItems(hotspots);
    expect(items.map((item) => item.tabIndex)).toEqual([0, 0]);
    expect(items.map((item) => item.href)).toEqual(["/learn", "/live"]);
    expect(items.map((item) => item.badgeCount)).toEqual([0, 3]);
    expect(liveBadgeCount(2)).toBe(0);
    expect(liveBadgeCount(3)).toBe(3);
  });

  it("documents the mobile load budget", () => {
    expect(CAMPUS_LITE_LOAD_BUDGET.initialJsKb).toBeLessThanOrEqual(28);
    expect(CAMPUS_LITE_LOAD_BUDGET.art).toContain("single inline SVG");
  });
});
