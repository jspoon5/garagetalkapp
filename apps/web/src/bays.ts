import { images } from "./images";
import type { ChatRoom } from "./api";

export type Lane = "Cars" | "Trucks" | "Motorcycles";

export function roomLane(title: string): Lane {
  const value = title.toLowerCase();
  if (value.includes("truck") || value.includes("diesel")) return "Trucks";
  if (value.includes("moto") || value.includes("bike")) return "Motorcycles";
  return "Cars";
}

export function roomImage(title: string): string {
  const lane = roomLane(title);
  if (lane === "Trucks") return images.truck;
  if (lane === "Motorcycles") return images.motorcycle;
  return images.car;
}

export function filterRooms(rooms: ChatRoom[], filter: string): ChatRoom[] {
  if (filter === "All") return rooms;
  return rooms.filter((room) => roomLane(room.title) === filter);
}

export function preferredRoom(rooms: ChatRoom[], lane: Lane): ChatRoom | undefined {
  return rooms.find((room) => roomLane(room.title) === lane) ?? rooms[0];
}

export function gearHeadReply(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("crank") || q.includes("won’t start") || q.includes("wont start")) {
    return "Start safe: park level, set the brake, and confirm the battery is above 12.4V. If it cranks but won’t fire, check for spark and injector pulse before replacing parts.";
  }
  if (q.includes("light") || q.includes("cel") || q.includes("code")) {
    return "Scan for stored and pending codes first. Write them down, clear only after you capture freeze-frame, then retest. Don’t throw sensors at a P0420 until you’ve checked exhaust leaks.";
  }
  if (q.includes("tow") || q.includes("truck")) {
    return "For tow issues: confirm tire pressure, transmission temp, and that the brake controller is talking to the trailer. A surge under load is often cooling or a slipping converter — not always a tune.";
  }
  return "Park on level ground, set the brake, and tell me year/make/model plus the exact symptom (noise, smell, warning light, or no-start). I’ll give a safe first-step plan before you turn a wrench.";
}

export function formatGearHead(result: {
  diagnosis: string;
  possible_causes: string[];
  next_steps: string[];
  ev_safety_notes?: string;
}): string {
  const causes = result.possible_causes.map((item) => `• ${item}`).join("\n");
  const steps = result.next_steps.map((item, index) => `${index + 1}. ${item}`).join("\n");
  const safety = result.ev_safety_notes ? `\n\nSafety: ${result.ev_safety_notes}` : "";
  return `${result.diagnosis}\n\n${causes}${steps ? `\n\n${steps}` : ""}${safety}`;
}
