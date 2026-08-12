import type { serviceRecords } from "@garagetalk/db";

export function projectSharedRecord(row: typeof serviceRecords.$inferSelect) {
  const out: Record<string, unknown> = { id: row.id, vehicleId: row.vehicleId };
  for (const field of row.sharedFields) {
    if (field === "date") out.date = row.date;
    if (field === "mileage") out.mileage = row.mileage;
    if (field === "kind") out.kind = row.kind;
    if (field === "title") out.title = row.title;
    if (field === "work") out.work = row.work;
    if (field === "parts") out.parts = row.parts;
    if (field === "costCents") out.costCents = row.costCents;
  }
  return out;
}
