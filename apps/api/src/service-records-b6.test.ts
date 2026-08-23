import { maintenanceReminders } from "@garagetalk/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

function cookieFrom(response: { headers: Record<string, string | number | string[] | undefined> }) {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

describe("B6 service records", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie: string;
  let vehicleId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"] });
    cookie = (await register()).cookie;
    vehicleId = await createVehicle();
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  it("supports CRUD, reminder scheduling, and owner-controlled provenance exposure", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/garage/vehicles/${vehicleId}/service-records`,
      headers: { cookie },
      payload: {
        date: "2026-01-02T00:00:00.000Z",
        mileage: 45_000,
        kind: "maintenance",
        title: "Brake service",
        work: "Front pads and rotors",
        parts: [{ sku: "PAD-1", qty: 1 }],
        costCents: 42_000,
        receiptMedia: ["https://cdn.test/receipt.pdf"],
        sharedFields: ["date", "work"],
      },
    });
    expect(created.statusCode).toBe(201);
    const recordId = created.json().record.id as string;

    const publicRecords = await app.inject({
      method: "GET",
      url: `/garage/vehicles/${vehicleId}/service-records/public`,
    });
    expect(publicRecords.json().records[0].work).toBe("Front pads and rotors");
    expect(publicRecords.json().records[0].costCents).toBeUndefined();

    const updated = await app.inject({
      method: "PATCH",
      url: `/garage/vehicles/${vehicleId}/service-records/${recordId}`,
      headers: { cookie },
      payload: { work: "Front pads, rotors, and fluid", sharedFields: ["date", "work", "costCents"] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().record.work).toContain("fluid");

    const reminder = await app.inject({
      method: "POST",
      url: `/garage/vehicles/${vehicleId}/service-reminders`,
      headers: { cookie },
      payload: {
        kind: "brake_inspection",
        intervalMonths: 6,
        intervalMiles: 6_000,
        lastServiceDate: "2026-01-02T00:00:00.000Z",
        lastMileage: 45_000,
      },
    });
    expect(reminder.statusCode).toBe(201);
    expect(reminder.json().reminder.nextDueMiles).toBe(51_000);

    const rows = await ctx.db
      .select()
      .from(maintenanceReminders)
      .where(eq(maintenanceReminders.vehicleId, vehicleId));
    expect(rows).toHaveLength(1);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/garage/vehicles/${vehicleId}/service-records/${recordId}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: `/garage/vehicles/${vehicleId}/service-records`,
      headers: { cookie },
    });
    expect(list.json().records).toHaveLength(0);
  });

  async function register() {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "records@example.com",
        username: "recordsuser",
        password: "correct-horse-battery",
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    return { cookie: cookieFrom(res) };
  }

  async function createVehicle() {
    const res = await app.inject({
      method: "POST",
      url: "/garage/vehicles",
      headers: { cookie },
      payload: { type: "car", fuelType: "gas", make: "Mazda", model: "Miata", year: 2020 },
    });
    return res.json().vehicle.id as string;
  }
});
