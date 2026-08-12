import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { maintenanceReminders, serviceRecords, vehicles } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

export const serviceRecordInputSchema = z.object({
  date: z.string().datetime(),
  mileage: z.number().int().min(0).nullable().optional(),
  kind: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  work: z.string().max(4000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  parts: z.array(z.record(z.unknown())).max(100).optional(),
  costCents: z.number().int().min(0).nullable().optional(),
  receiptMedia: z.array(z.string().url()).max(20).optional(),
  sharedFields: z.array(z.enum(["date", "mileage", "kind", "title", "work", "parts", "costCents"])).optional(),
});

export const reminderInputSchema = z.object({
  kind: z.string().min(1).max(80),
  intervalMonths: z.number().int().min(1).max(120).nullable().optional(),
  intervalMiles: z.number().int().min(1).max(200_000).nullable().optional(),
  lastServiceDate: z.string().datetime().nullable().optional(),
  lastMileage: z.number().int().min(0).nullable().optional(),
});

export class ServiceRecordService {
  constructor(private readonly db: Database) {}

  async listRecords(userId: string, vehicleId: string) {
    if (!(await this.ownsVehicle(userId, vehicleId))) return null;
    return this.db
      .select()
      .from(serviceRecords)
      .where(and(eq(serviceRecords.vehicleId, vehicleId), isNull(serviceRecords.deletedAt)));
  }

  async createRecord(userId: string, vehicleId: string, input: z.infer<typeof serviceRecordInputSchema>) {
    if (!(await this.ownsVehicle(userId, vehicleId))) return null;
    const body = serviceRecordInputSchema.parse(input);
    const [record] = await this.db
      .insert(serviceRecords)
      .values({
        id: uuidv7(),
        vehicleId,
        date: new Date(body.date),
        mileage: body.mileage ?? null,
        kind: body.kind,
        title: body.title,
        work: body.work ?? null,
        notes: body.notes ?? null,
        parts: body.parts ?? [],
        costCents: body.costCents ?? null,
        receiptMedia: body.receiptMedia ?? [],
        sharedFields: body.sharedFields ?? [],
      })
      .returning();
    return record ?? null;
  }

  async updateRecord(
    userId: string,
    vehicleId: string,
    recordId: string,
    input: Partial<z.infer<typeof serviceRecordInputSchema>>,
  ) {
    if (!(await this.ownsVehicle(userId, vehicleId))) return null;
    const body = serviceRecordInputSchema.partial().parse(input);
    const [record] = await this.db
      .update(serviceRecords)
      .set({
        ...body,
        date: body.date ? new Date(body.date) : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(serviceRecords.id, recordId),
          eq(serviceRecords.vehicleId, vehicleId),
          isNull(serviceRecords.deletedAt),
        ),
      )
      .returning();
    return record ?? null;
  }

  async deleteRecord(userId: string, vehicleId: string, recordId: string) {
    if (!(await this.ownsVehicle(userId, vehicleId))) return null;
    const [record] = await this.db
      .update(serviceRecords)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(serviceRecords.id, recordId), eq(serviceRecords.vehicleId, vehicleId)))
      .returning();
    return record ?? null;
  }

  async scheduleReminder(userId: string, vehicleId: string, input: z.infer<typeof reminderInputSchema>) {
    if (!(await this.ownsVehicle(userId, vehicleId))) return null;
    const body = reminderInputSchema.parse(input);
    const baseDate = body.lastServiceDate ? new Date(body.lastServiceDate) : new Date();
    const nextDueAt = body.intervalMonths
      ? new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + body.intervalMonths, baseDate.getUTCDate()))
      : null;
    const nextDueMiles =
      body.intervalMiles && body.lastMileage !== undefined && body.lastMileage !== null
        ? body.lastMileage + body.intervalMiles
        : null;
    const [reminder] = await this.db
      .insert(maintenanceReminders)
      .values({
        id: uuidv7(),
        vehicleId,
        kind: body.kind,
        intervalMonths: body.intervalMonths ?? null,
        intervalMiles: body.intervalMiles ?? null,
        nextDueAt,
        nextDueMiles,
      })
      .returning();
    return reminder ?? null;
  }

  async publicProvenance(vehicleId: string) {
    const rows = await this.db
      .select()
      .from(serviceRecords)
      .where(and(eq(serviceRecords.vehicleId, vehicleId), isNull(serviceRecords.deletedAt)));
    return rows
      .filter((row) => row.sharedFields.length > 0)
      .map((row) => this.projectShared(row));
  }

  private async ownsVehicle(userId: string, vehicleId: string): Promise<boolean> {
    const [vehicle] = await this.db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId), isNull(vehicles.deletedAt)))
      .limit(1);
    return Boolean(vehicle);
  }

  private projectShared(row: typeof serviceRecords.$inferSelect): Record<string, unknown> {
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
}
