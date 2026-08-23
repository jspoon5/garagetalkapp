import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

describe("spatial chat A6", () => {
  let client: Awaited<ReturnType<typeof createTestDb>>["client"];
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie: string;

  beforeAll(async () => {
    const ctx = await createTestDb();
    client = ctx.client;
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"] });
    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "spatial@example.com",
        username: "spatialuser",
        password: "correct-horse-battery",
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    const setCookie = reg.headers["set-cookie"];
    cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it("lists and joins spatial rooms without a pin, then sets and removes a consented pin", async () => {
    const room = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { cookie },
      payload: {
        title: "Detroit night meet",
        kind: "spatial",
        mapPoint: { lat: 42.3314, lng: -83.0458, label: "Detroit" },
      },
    });
    expect(room.statusCode).toBe(201);
    const roomId = room.json().room.id as string;

    const list = await app.inject({ method: "GET", url: "/spatial/rooms" });
    expect(list.statusCode).toBe(200);
    expect(list.json().rooms.map((r: { id: string }) => r.id)).toContain(roomId);

    const joined = await app.inject({
      method: "POST",
      url: `/rooms/${roomId}/join`,
      headers: { cookie },
    });
    expect(joined.statusCode).toBe(200);

    const setPin = await app.inject({
      method: "POST",
      url: "/me/location-pin",
      headers: { cookie },
      payload: { cityText: "Detroit", lat: 42.3314, lng: -83.0458, consent: true },
    });
    expect(setPin.statusCode).toBe(200);
    expect(setPin.json().pin).toMatchObject({ cityText: "Detroit", lat: 42.3314, lng: -83.0458 });

    const removePin = await app.inject({
      method: "DELETE",
      url: "/me/location-pin",
      headers: { cookie },
    });
    expect(removePin.statusCode).toBe(200);

    const pinAfter = await app.inject({
      method: "GET",
      url: "/me/location-pin",
      headers: { cookie },
    });
    expect(pinAfter.json().pin).toBeNull();
  });
});
