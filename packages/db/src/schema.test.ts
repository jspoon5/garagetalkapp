import { describe, expect, it } from "vitest";
import * as schema from "./schema/index.js";

describe("schema surface", () => {
  it("exports core Part III tables", () => {
    const required = [
      "users",
      "sessions",
      "passkeys",
      "vehicles",
      "videos",
      "chatRooms",
      "liveSessions",
      "shops",
      "listings",
      "bookings",
      "diagnosticSessions",
      "repairBriefs",
      "courses",
      "quests",
      "skillBadges",
      "avatarUnlocks",
      "reports",
      "auditLogs",
      "webhookEvents",
    ];
    for (const name of required) {
      expect(schema).toHaveProperty(name);
    }
  });
});
