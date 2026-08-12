import { eq } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { users } from "@garagetalk/db";
import { z } from "zod";

export const locationPinInputSchema = z.object({
  cityText: z.string().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  consent: z.literal(true),
});

export type LocationPin = {
  cityText: string;
  lat: number;
  lng: number;
  consentedAt: Date | null;
};

function toPin(user: typeof users.$inferSelect): LocationPin | null {
  if (!user.locationLat || !user.locationLng || !user.locationConsentAt || !user.cityText) return null;
  return {
    cityText: user.cityText,
    lat: Number(user.locationLat),
    lng: Number(user.locationLng),
    consentedAt: user.locationConsentAt,
  };
}

export class SpatialService {
  constructor(private readonly db: Database) {}

  async setLocationPin(userId: string, input: z.infer<typeof locationPinInputSchema>) {
    const parsed = locationPinInputSchema.parse(input);
    const [user] = await this.db
      .update(users)
      .set({
        cityText: parsed.cityText,
        locationLat: parsed.lat.toFixed(6),
        locationLng: parsed.lng.toFixed(6),
        locationConsentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user ? toPin(user) : null;
  }

  async removeLocationPin(userId: string) {
    await this.db
      .update(users)
      .set({
        cityText: null,
        locationLat: null,
        locationLng: null,
        locationConsentAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async getLocationPin(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user ? toPin(user) : null;
  }
}
