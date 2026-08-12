import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

describe("garage vehicles", () => {
  let client: Awaited<ReturnType<typeof createTestDb>>["client"];
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie: string;

  beforeAll(async () => {
    const ctx = await createTestDb();
    client = ctx.client;
    app = await buildApp({
      db: ctx.db,
      trustedOrigins: ["http://localhost:5173"],
    });
    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "garage@example.com",
        username: "garageuser",
        password: "correct-horse-battery",
      },
    });
    const setCookie = reg.headers["set-cookie"];
    cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it("create edit delete and primary flag", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/garage/vehicles",
      headers: { cookie },
      payload: {
        type: "car",
        fuelType: "gas",
        make: "Honda",
        model: "Civic",
        year: 2018,
        nickname: "Daily",
        isPrimary: true,
      },
    });
    expect(created.statusCode).toBe(201);
    const vehicleId = created.json().vehicle.id as string;

    const listed = await app.inject({
      method: "GET",
      url: "/garage/vehicles",
      headers: { cookie },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().vehicles).toHaveLength(1);

    const updated = await app.inject({
      method: "PATCH",
      url: `/garage/vehicles/${vehicleId}`,
      headers: { cookie },
      payload: { nickname: "Track", fuelType: "hybrid" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().vehicle.nickname).toBe("Track");

    const second = await app.inject({
      method: "POST",
      url: "/garage/vehicles",
      headers: { cookie },
      payload: {
        type: "motorcycle",
        fuelType: "gas",
        make: "Yamaha",
        model: "MT-07",
        year: 2021,
        isPrimary: true,
      },
    });
    expect(second.statusCode).toBe(201);

    const afterPrimary = await app.inject({
      method: "GET",
      url: "/garage/vehicles",
      headers: { cookie },
    });
    const vehicles = afterPrimary.json().vehicles as Array<{ isPrimary: boolean; make: string }>;
    expect(vehicles.filter((v) => v.isPrimary)).toHaveLength(1);
    expect(vehicles.find((v) => v.isPrimary)?.make).toBe("Yamaha");

    const del = await app.inject({
      method: "DELETE",
      url: `/garage/vehicles/${vehicleId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(200);

    const finalList = await app.inject({
      method: "GET",
      url: "/garage/vehicles",
      headers: { cookie },
    });
    expect(finalList.json().vehicles).toHaveLength(1);
  });

  it("reorders vehicles by sortOrder", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/garage/vehicles",
      headers: { cookie },
      payload: {
        type: "car",
        fuelType: "gas",
        make: "Ford",
        model: "Focus",
        year: 2015,
      },
    });
    const second = await app.inject({
      method: "POST",
      url: "/garage/vehicles",
      headers: { cookie },
      payload: {
        type: "car",
        fuelType: "gas",
        make: "Toyota",
        model: "Corolla",
        year: 2016,
      },
    });
    const idA = first.json().vehicle.id as string;
    const idB = second.json().vehicle.id as string;

    const reorder = await app.inject({
      method: "POST",
      url: "/garage/vehicles/reorder",
      headers: { cookie },
      payload: { vehicleIds: [idB, idA] },
    });
    expect(reorder.statusCode).toBe(200);

    const listed = await app.inject({
      method: "GET",
      url: "/garage/vehicles",
      headers: { cookie },
    });
    const vehicles = listed.json().vehicles as Array<{ id: string; make: string }>;
    const reordered = vehicles.filter((v) => v.id === idA || v.id === idB);
    expect(reordered[0]?.make).toBe("Toyota");
    expect(reordered[1]?.make).toBe("Ford");
  });
});
