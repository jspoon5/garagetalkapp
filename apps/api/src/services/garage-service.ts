import { and, asc, eq, inArray, isNull } from "drizzle-orm";
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
      .orderBy(asc(vehicles.sortOrder), asc(vehicles.createdAt));
  }

  async create(userId: string, input: VehicleInput) {
    if (input.isPrimary) {
      await this.clearPrimary(userId);
    }
    const existing = await this.db
      .select({ sortOrder: vehicles.sortOrder })
      .from(vehicles)
      .where(and(eq(vehicles.userId, userId), isNull(vehicles.deletedAt)));
    const sortOrder =
      existing.length === 0 ? 0 : Math.max(...existing.map((row) => row.sortOrder)) + 1;

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
        sortOrder,
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

  async reorder(userId: string, orderedIds: string[]): Promise<boolean> {
    if (orderedIds.length === 0) return true;

    const owned = await this.db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.userId, userId),
          isNull(vehicles.deletedAt),
          inArray(vehicles.id, orderedIds),
        ),
      );
    if (owned.length !== orderedIds.length) return false;

    await this.db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(vehicles)
          .set({ sortOrder: i, updatedAt: new Date() })
          .where(and(eq(vehicles.id, orderedIds[i]!), eq(vehicles.userId, userId)));
      }
    });
    return true;
  }

  private async clearPrimary(userId: string) {
    await this.db
      .update(vehicles)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(and(eq(vehicles.userId, userId), isNull(vehicles.deletedAt)));
  }
}
