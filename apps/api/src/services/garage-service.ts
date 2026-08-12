import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { vehicles } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

export const vehicleInputSchema = z.object({
  type: z.string().min(1).max(64),
  fuelType: z.string().min(1).max(64),
  make: z.string().min(1).max(64),
  model: z.string().min(1).max(64),
  year: z.number().int().min(1900).max(2100),
  trim: z.string().max(64).nullable().optional(),
  vin: z.string().max(32).nullable().optional(),
  nickname: z.string().max(64).nullable().optional(),
  isPrimary: z.boolean().optional(),
  photos: z.array(z.string().url()).max(20).optional(),
  privacy: z.enum(["private", "followers", "public"]).optional(),
});

export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export class GarageService {
  constructor(private readonly db: Database) {}

  list(userId: string) {
    return this.db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.userId, userId), isNull(vehicles.deletedAt)))
      .orderBy(asc(vehicles.createdAt));
  }

  async create(userId: string, input: VehicleInput) {
    if (input.isPrimary) {
      await this.clearPrimary(userId);
    }
    const [row] = await this.db
      .insert(vehicles)
      .values({
        id: uuidv7(),
        userId,
        type: input.type,
        fuelType: input.fuelType,
        make: input.make,
        model: input.model,
        year: input.year,
        trim: input.trim ?? null,
        vin: input.vin ?? null,
        nickname: input.nickname ?? null,
        isPrimary: input.isPrimary ?? false,
        photos: input.photos ?? [],
        privacy: input.privacy ?? "private",
      })
      .returning();
    return row!;
  }

  async update(userId: string, vehicleId: string, input: Partial<VehicleInput>) {
    if (input.isPrimary) {
      await this.clearPrimary(userId);
    }
    const [row] = await this.db
      .update(vehicles)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(
        and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId), isNull(vehicles.deletedAt)),
      )
      .returning();
    return row ?? null;
  }

  async softDelete(userId: string, vehicleId: string) {
    const [row] = await this.db
      .update(vehicles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId), isNull(vehicles.deletedAt)),
      )
      .returning();
    return row ?? null;
  }

  private async clearPrimary(userId: string) {
    await this.db
      .update(vehicles)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(and(eq(vehicles.userId, userId), isNull(vehicles.deletedAt)));
  }
}
