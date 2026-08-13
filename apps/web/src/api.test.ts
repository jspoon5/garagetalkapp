import { describe, expect, it } from "vitest";
import { formatUsd } from "./api";
import { filterRooms, formatGearHead, preferredRoom, roomLane } from "./bays";

describe("api helpers", () => {
  it("formats whole-dollar prices without cents", () => {
    expect(formatUsd(14900)).toBe("$149");
  });
});

describe("room presentation", () => {
  const rooms = [
    { id: "1", title: "Car Garage", kind: "topic", ownerId: null, createdAt: "" },
    { id: "2", title: "Truck Bay", kind: "topic", ownerId: null, createdAt: "" },
  ];

  it("maps titles onto vehicle lanes", () => {
    expect(roomLane("Motorcycle Bench")).toBe("Motorcycles");
    expect(preferredRoom(rooms, "Trucks")?.id).toBe("2");
    expect(filterRooms(rooms, "Cars")).toHaveLength(1);
  });

  it("formats a GearHead diagnostic", () => {
    expect(
      formatGearHead({
        diagnosis: "Check the battery first.",
        possible_causes: ["low voltage"],
        next_steps: ["Measure at rest"],
      }),
    ).toMatch(/battery/i);
  });
});
