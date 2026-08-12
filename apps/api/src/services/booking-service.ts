import { and, eq } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  shopServices,
  shops,
  users,
} from "@garagetalk/db";
import type { EmailClient } from "@garagetalk/email";
import { MemoryEmailClient } from "@garagetalk/email";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

export class BookingConflictError extends Error {
  constructor() {
    super("booking_conflict");
  }
}

export const shopServiceInputSchema = z.object({
  name: z.string().min(1).max(160),
  durationMin: z.number().int().min(15).max(24 * 60),
  priceBandLowCents: z.number().int().min(0).nullable().optional(),
  priceBandHighCents: z.number().int().min(0).nullable().optional(),
});

export const availabilityRuleInputSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
  capacity: z.number().int().min(1).max(20).optional(),
});

export const availabilityExceptionInputSchema = z.object({
  date: z.string().datetime(),
  closed: z.boolean().optional(),
  openTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  capacity: z.number().int().min(1).max(20).nullable().optional(),
});

export const bookingRequestSchema = z.object({
  shopId: z.string().uuid(),
  serviceId: z.string().uuid(),
  vehicleId: z.string().uuid().nullable().optional(),
  scheduledAt: z.string().datetime(),
});

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function sameUtcDate(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function isConflictError(err: unknown): boolean {
  return err instanceof Error && /unique|duplicate|constraint|failed query/i.test(err.message);
}

export class BookingService {
  private readonly emailClient: EmailClient;

  constructor(
    private readonly db: Database,
    opts: { emailClient?: EmailClient } = {},
  ) {
    this.emailClient = opts.emailClient ?? new MemoryEmailClient();
  }

  async createShopService(ownerId: string, shopId: string, input: z.infer<typeof shopServiceInputSchema>) {
    if (!(await this.ownsShop(ownerId, shopId))) return null;
    const body = shopServiceInputSchema.parse(input);
    const [service] = await this.db
      .insert(shopServices)
      .values({
        id: uuidv7(),
        shopId,
        name: body.name,
        durationMin: body.durationMin,
        priceBandLowCents: body.priceBandLowCents ?? null,
        priceBandHighCents: body.priceBandHighCents ?? null,
      })
      .returning();
    return service ?? null;
  }

  listShopServices(shopId: string) {
    return this.db.select().from(shopServices).where(eq(shopServices.shopId, shopId));
  }

  async addAvailabilityRule(ownerId: string, shopId: string, input: z.infer<typeof availabilityRuleInputSchema>) {
    if (!(await this.ownsShop(ownerId, shopId))) return null;
    const body = availabilityRuleInputSchema.parse(input);
    const [rule] = await this.db
      .insert(availabilityRules)
      .values({ id: uuidv7(), shopId, ...body, capacity: body.capacity ?? 1 })
      .returning();
    return rule ?? null;
  }

  async addAvailabilityException(
    ownerId: string,
    shopId: string,
    input: z.infer<typeof availabilityExceptionInputSchema>,
  ) {
    if (!(await this.ownsShop(ownerId, shopId))) return null;
    const body = availabilityExceptionInputSchema.parse(input);
    const [exception] = await this.db
      .insert(availabilityExceptions)
      .values({
        id: uuidv7(),
        shopId,
        date: new Date(body.date),
        closed: body.closed ?? false,
        openTime: body.openTime ?? null,
        closeTime: body.closeTime ?? null,
        capacity: body.capacity ?? null,
      })
      .returning();
    return exception ?? null;
  }

  async requestBooking(userId: string, input: z.infer<typeof bookingRequestSchema>) {
    const body = bookingRequestSchema.parse(input);
    const service = await this.getService(body.shopId, body.serviceId);
    if (!service) return { error: "service_not_found" as const };
    const scheduledAt = new Date(body.scheduledAt);
    if (!(await this.isAvailable(body.shopId, scheduledAt))) {
      return { error: "slot_unavailable" as const };
    }
    const id = uuidv7();
    try {
      const [booking] = await this.db
        .insert(bookings)
        .values({
          id,
          shopId: body.shopId,
          userId,
          serviceId: body.serviceId,
          vehicleId: body.vehicleId ?? null,
          scheduledAt,
          calendarUid: `${id}@garagetalk.local`,
        })
        .returning();
      return { booking: booking ?? null };
    } catch (err) {
      if (isConflictError(err)) throw new BookingConflictError();
      throw err;
    }
  }

  async confirmBooking(ownerId: string, bookingId: string) {
    const row = await this.getOwnedBooking(ownerId, bookingId);
    if (!row) return null;
    const [booking] = await this.db
      .update(bookings)
      .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();
    if (booking) await this.sendBookingEmail(booking, "confirmed", "Your Garage Talk booking is confirmed.");
    return booking ?? null;
  }

  async completeBooking(ownerId: string, bookingId: string) {
    if (!(await this.getOwnedBooking(ownerId, bookingId))) return null;
    const [booking] = await this.db
      .update(bookings)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();
    return booking ?? null;
  }

  async cancelBooking(userId: string, bookingId: string) {
    const [booking] = await this.db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) return null;
    const ownerOk = await this.ownsShop(userId, booking.shopId);
    if (!ownerOk && booking.userId !== userId) return null;
    const [updated] = await this.db
      .update(bookings)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();
    return updated ?? null;
  }

  async markNoShow(ownerId: string, bookingId: string) {
    if (!(await this.getOwnedBooking(ownerId, bookingId))) return null;
    const [booking] = await this.db
      .update(bookings)
      .set({ status: "no_show", noShowAt: new Date(), updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();
    return booking ?? null;
  }

  async sendDueReminders(now = new Date()) {
    const rows = await this.db.select().from(bookings).where(eq(bookings.status, "confirmed"));
    let sent = 0;
    for (const booking of rows) {
      const diffMs = booking.scheduledAt.getTime() - now.getTime();
      if (diffMs <= 0) continue;
      if (diffMs <= 2 * 60 * 60 * 1000 && !booking.reminder2hSentAt) {
        await this.sendBookingEmail(booking, "2 hour reminder", "Your booking starts in about 2 hours.");
        await this.markReminderSent(booking.id, "2h");
        sent++;
      } else if (diffMs <= 24 * 60 * 60 * 1000 && !booking.reminder24hSentAt) {
        await this.sendBookingEmail(booking, "24 hour reminder", "Your booking starts in about 24 hours.");
        await this.markReminderSent(booking.id, "24h");
        sent++;
      }
    }
    return { sent };
  }

  private async ownsShop(ownerId: string, shopId: string): Promise<boolean> {
    const [shop] = await this.db
      .select({ id: shops.id })
      .from(shops)
      .where(and(eq(shops.id, shopId), eq(shops.ownerUserId, ownerId)))
      .limit(1);
    return Boolean(shop);
  }

  private async getService(shopId: string, serviceId: string) {
    const [service] = await this.db
      .select()
      .from(shopServices)
      .where(and(eq(shopServices.id, serviceId), eq(shopServices.shopId, shopId)))
      .limit(1);
    return service ?? null;
  }

  private async isAvailable(shopId: string, scheduledAt: Date) {
    const exceptions = await this.db
      .select()
      .from(availabilityExceptions)
      .where(eq(availabilityExceptions.shopId, shopId));
    const exception = exceptions.find((row) => sameUtcDate(row.date, scheduledAt));
    if (exception?.closed) return false;
    const open = exception?.openTime;
    const close = exception?.closeTime;
    const ruleRows = await this.db
      .select()
      .from(availabilityRules)
      .where(and(eq(availabilityRules.shopId, shopId), eq(availabilityRules.weekday, scheduledAt.getUTCDay())));
    const rule = ruleRows[0];
    if (!rule && (!open || !close)) return false;
    const start = scheduledAt.getUTCHours() * 60 + scheduledAt.getUTCMinutes();
    return start >= minutes(open ?? rule!.openTime) && start < minutes(close ?? rule!.closeTime);
  }

  private async getOwnedBooking(ownerId: string, bookingId: string) {
    const [row] = await this.db
      .select({ booking: bookings })
      .from(bookings)
      .innerJoin(shops, eq(bookings.shopId, shops.id))
      .where(and(eq(bookings.id, bookingId), eq(shops.ownerUserId, ownerId)))
      .limit(1);
    return row?.booking ?? null;
  }

  private async sendBookingEmail(
    booking: typeof bookings.$inferSelect,
    subjectSuffix: string,
    html: string,
  ) {
    const [user] = await this.db.select().from(users).where(eq(users.id, booking.userId)).limit(1);
    if (!user) return;
    await this.emailClient.send({
      to: user.email,
      subject: `Garage Talk booking ${subjectSuffix}`,
      html: `<p>${html}</p>`,
      attachments: [
        {
          filename: "booking.ics",
          contentType: "text/calendar",
          content: this.buildIcs(booking),
        },
      ],
    });
  }

  private buildIcs(booking: typeof bookings.$inferSelect): string {
    const start = booking.scheduledAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Garage Talk//Booking//EN",
      "BEGIN:VEVENT",
      `UID:${booking.calendarUid ?? booking.id}`,
      `DTSTAMP:${start}`,
      `DTSTART:${start}`,
      "SUMMARY:Garage Talk service booking",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  }

  private async markReminderSent(bookingId: string, kind: "24h" | "2h") {
    await this.db
      .update(bookings)
      .set({
        reminderSentAt: new Date(),
        reminder24hSentAt: kind === "24h" ? new Date() : undefined,
        reminder2hSentAt: kind === "2h" ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));
  }
}
