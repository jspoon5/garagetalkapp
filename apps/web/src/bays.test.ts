import { describe, expect, it } from "vitest";
import { gearHeadReply, roomLane } from "./bays";

describe("bays", () => {
  it("classifies community rooms", () => {
    expect(roomLane("Car Garage")).toBe("Cars");
    expect(roomLane("Truck Bay")).toBe("Trucks");
  });

  it("gives a no-start first-step plan offline", () => {
    expect(gearHeadReply("Cranks but won’t start")).toMatch(/battery/i);
  });
});
