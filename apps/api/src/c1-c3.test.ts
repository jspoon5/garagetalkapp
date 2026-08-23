import { MemoryEmailClient } from "@garagetalk/email";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import {
  elm327InitCommands,
  parseElm327Dtcs,
  parseElm327LivePid,
  webBluetoothSupport,
} from "./services/obd-elm327.js";
import { createTestDb } from "./test/pglite.js";

function cookieFrom(response: { headers: Record<string, string | number | string[] | undefined> }) {
  const setCookie = response.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

describe("C1-C3 diagnostics and OBD", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let email: MemoryEmailClient;
  let cookie: string;
  let vehicleId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    email = new MemoryEmailClient();
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"], emailClient: email });
    cookie = (await register()).cookie;
    vehicleId = await createKnownRecallVehicle();
  });

  afterAll(async () => {
    await app.close();
    await ctx.client.close();
  });

  it("decodes VINs and creates recall alerts within one sweep", async () => {
    const list = await app.inject({ method: "GET", url: "/garage/vehicles", headers: { cookie } });
    expect(list.json().vehicles[0].vinDecoded.source).toBe("recorded");

    const sweep = await app.inject({ method: "POST", url: "/track-c/recalls/sweep", headers: { cookie } });
    expect(sweep.statusCode).toBe(200);
    expect(sweep.json().alerts).toBe(1);
    expect(email.sent.at(-1)?.subject).toContain("recall digest");

    const badge = await app.inject({
      method: "GET",
      url: `/garage/vehicles/${vehicleId}/recall-badge`,
      headers: { cookie },
    });
    expect(badge.json().openRecallCount).toBe(1);
    expect(badge.json().alerts[0].campaignId).toContain("CIVIC");
  });

  it("produces grounded hypotheses, blocks hazardous DIY, and tracks cost", async () => {
    const session = await app.inject({
      method: "POST",
      url: "/diagnostics/sessions",
      headers: { cookie },
      payload: {
        vehicleId,
        symptomText: "Runs rough and has a slow O2 response code.",
        audioClips: [{ url: "https://cdn.test/idle.wav", durationSec: 3 }],
        dtcCodes: ["P0133"],
      },
    });
    expect(session.statusCode).toBe(201);
    expect(session.json().modelOutput.hypotheses[0].fault).toContain("oxygen sensor");
    expect(session.json().session.costCents).toBe(42);
    expect(session.json().session.audioClips[0].spectralFeatures.status).toBe("queued_stub");

    const hazardous = await app.inject({
      method: "POST",
      url: "/diagnostics/sessions",
      headers: { cookie },
      payload: { vehicleId, symptomText: "Brake pedal sinks and airbag light is on.", dtcCodes: ["B0100"] },
    });
    const output = hazardous.json().modelOutput;
    expect(output.safety_flags).toContain("professional_only_hazard");
    expect(output.hypotheses.every((h: { diy_feasibility: string }) => h.diy_feasibility === "professional_only")).toBe(true);
  });

  it("parses ELM327 transcripts and handles unsupported browsers gracefully", async () => {
    expect(elm327InitCommands).toEqual(["ATZ", "ATE0", "ATSP0"]);
    expect(parseElm327Dtcs("SEARCHING...\r43 01 33 00 00 00 00\r>")).toEqual(["P0133"]);
    expect(parseElm327Dtcs("47 01 71 00 00")).toEqual(["P0171"]);
    expect(parseElm327LivePid("41 0C 1A F8\r41 05 7B\r41 10 01 90\r41 06 90")).toMatchObject({
      rpm: 1726,
      coolantC: 83,
      mafGps: 4,
    });
    expect(webBluetoothSupport({ userAgent: "iPhone", bluetooth: {} })).toEqual({
      supported: false,
      fallback: "ios-web-bluetooth-unavailable",
    });

    const diagnostic = await app.inject({
      method: "POST",
      url: "/diagnostics/sessions",
      headers: { cookie },
      payload: { vehicleId, symptomText: "Live data capture", dtcCodes: [] },
    });
    const device = await app.inject({
      method: "POST",
      url: "/obd/devices",
      headers: { cookie },
      payload: { fingerprint: "elm327-aa:bb", protocol: "iso15765" },
    });
    const snapshot = await app.inject({
      method: "POST",
      url: `/diagnostics/sessions/${diagnostic.json().session.id}/obd-snapshots`,
      headers: { cookie },
      payload: { deviceId: device.json().device.id, snapshot: { rpm: 1726, coolantC: 83 } },
    });
    expect(snapshot.statusCode).toBe(201);
    expect(snapshot.json().snapshot.snapshot.rpm).toBe(1726);
  });

  async function register() {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "c1-c3@example.com", username: "c1c3", password: "correct-horse-battery" },
    });
    return { cookie: cookieFrom(res) };
  }

  async function createKnownRecallVehicle() {
    const res = await app.inject({
      method: "POST",
      url: "/garage/vehicles",
      headers: { cookie },
      payload: {
        type: "car",
        fuelType: "gas",
        make: "Honda",
        model: "Civic",
        year: 2006,
        vin: "1HGFA16526L000000",
        birthYear: 1995,
        ageConfirmed: true,

      },
    });
    return res.json().vehicle.id as string;
  }
});
