import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import {
  bookings,
  diagnosticCostEvents,
  diagnosticSessions,
  faultOutcomes,
  listings,
  notifications,
  obdDevices,
  obdSnapshots,
  quoteRequests,
  quotes,
  recallAlerts,
  recallChecks,
  recalls,
  repairBriefs,
  serviceRecords,
  shopServices,
  shops,
  users,
  vehicles,
} from "@garagetalk/db";
import type { EmailClient } from "@garagetalk/email";
import { MemoryEmailClient } from "@garagetalk/email";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { signPayload, verifyAttestation } from "./attestation.js";
import {
  DeterministicDiagnosticProvider,
  diagnosticHazardPattern,
  diagnosticInputSchema,
  diagnosticOutputSchema,
  type DiagnosticOutput,
  type DiagnosticProvider,
} from "./c1-c6-diagnostics.js";
import { RecordedNhtsaClient, type NhtsaClient } from "./nhtsa-service.js";
import { projectSharedRecord } from "./service-record-projection.js";

export class C1C6Service {
  private readonly email: EmailClient;
  private readonly nhtsa: NhtsaClient;
  private readonly diagnostics: DiagnosticProvider;

  constructor(private readonly db: Database, opts: { emailClient?: EmailClient; nhtsa?: NhtsaClient; diagnostics?: DiagnosticProvider } = {}) {
    this.email = opts.emailClient ?? new MemoryEmailClient();
    this.nhtsa = opts.nhtsa ?? new RecordedNhtsaClient();
    this.diagnostics = opts.diagnostics ?? new DeterministicDiagnosticProvider();
  }

  async runRecallSweep(now = new Date()) {
    const fleet = await this.db.select().from(vehicles).where(isNull(vehicles.deletedAt));
    const digests = new Map<string, string[]>();
    let alerts = 0;
    for (const vehicle of fleet) {
      const found = await this.nhtsa.recallsForVehicle(vehicle);
      await this.db.insert(recallChecks).values({
        id: uuidv7(),
        vehicleId: vehicle.id,
        checkedAt: now,
        campaignIds: found.map((row) => row.campaignId),
      });
      for (const item of found) {
        const [recall] = await this.upsertRecall(item);
        const [existing] = await this.db
          .select()
          .from(recallAlerts)
          .where(and(eq(recallAlerts.vehicleId, vehicle.id), eq(recallAlerts.campaignId, item.campaignId)))
          .limit(1);
        if (existing) continue;
        const [alert] = await this.db
          .insert(recallAlerts)
          .values({
            id: uuidv7(),
            vehicleId: vehicle.id,
            recallId: recall?.id ?? null,
            campaignId: item.campaignId,
            notifiedAt: now,
          })
          .returning();
        await this.db.insert(notifications).values({
          id: uuidv7(),
          userId: vehicle.userId,
          type: "recall_alert",
          subjectType: "vehicle",
          subjectId: vehicle.id,
          payload: { campaignId: item.campaignId, summary: item.summary },
        });
        digests.set(vehicle.userId, [...(digests.get(vehicle.userId) ?? []), item.summary]);
        if (alert) alerts++;
      }
    }
    await this.sendRecallDigests(digests);
    return { checked: fleet.length, alerts };
  }

  async recallBadge(userId: string, vehicleId: string) {
    if (!(await this.ownsVehicle(userId, vehicleId))) return null;
    const rows = await this.db
      .select()
      .from(recallAlerts)
      .where(and(eq(recallAlerts.vehicleId, vehicleId), eq(recallAlerts.status, "open")));
    return { openRecallCount: rows.length, alerts: rows };
  }

  async createDiagnosticSession(userId: string, input: z.infer<typeof diagnosticInputSchema>) {
    const body = diagnosticInputSchema.parse(input);
    if (!(await this.ownsVehicle(userId, body.vehicleId))) return null;
    const context = await this.assembleContext(userId, body.vehicleId);
    const provider = await this.diagnostics.run({ symptomText: body.symptomText, dtcCodes: body.dtcCodes, context });
    let output = diagnosticOutputSchema.parse(provider.output);
    const safetyFlags = [...output.safety_flags];
    if (diagnosticHazardPattern.test(body.symptomText) || body.dtcCodes.some((code) => ["B", "U"].includes(code[0] ?? ""))) {
      safetyFlags.push("professional_only_hazard");
      output = {
        ...output,
        safety_flags: safetyFlags,
        hypotheses: output.hypotheses.map((h) => ({ ...h, diy_feasibility: "professional_only" })),
      };
    }
    output = await this.rerankFromOutcomes(output, body);
    const [session] = await this.db
      .insert(diagnosticSessions)
      .values({
        id: uuidv7(),
        userId,
        vehicleId: body.vehicleId,
        symptomText: body.symptomText,
        photos: body.photos,
        audioClips: body.audioClips.map((clip) => ({
          ...clip,
          spectralFeatures: { status: "queued_stub", centroidHz: 0 },
        })),
        dtcCodes: body.dtcCodes.map((code) => code.toUpperCase()),
        inputs: body,
        contextSnapshot: context,
        hypotheses: output.hypotheses,
        followUpQuestions: output.follow_up_questions,
        safetyFlags: output.safety_flags,
        modelMeta: { provider: provider.provider },
        costCents: provider.costCents,
      })
      .returning();
    await this.db.insert(diagnosticCostEvents).values({
      id: uuidv7(),
      sessionId: session!.id,
      provider: provider.provider,
      cents: provider.costCents,
      meta: { kind: "diagnostic_session" },
    });
    return { session, modelOutput: output };
  }

  async exportBrief(userId: string, sessionId: string) {
    const session = await this.getOwnedSession(userId, sessionId);
    if (!session) return null;
    const [existing] = await this.db.select().from(repairBriefs).where(eq(repairBriefs.sessionId, sessionId)).limit(1);
    if (existing) return existing;
    const [brief] = await this.db
      .insert(repairBriefs)
      .values({
        id: uuidv7(),
        sessionId,
        shareToken: uuidv7().replace(/-/g, ""),
        pdfMedia: `stub://repair-brief/${sessionId}.pdf`,
        snapshot: { session, exportedAt: new Date().toISOString() },
      })
      .returning();
    return brief ?? null;
  }

  async getBriefByToken(token: string) {
    const [brief] = await this.db.select().from(repairBriefs).where(eq(repairBriefs.shareToken, token)).limit(1);
    return brief ?? null;
  }

  async requestQuotes(userId: string, briefId: string, cityArea: string, radiusMiles: number) {
    const brief = await this.getOwnedBrief(userId, briefId);
    if (!brief) return null;
    const [request] = await this.db
      .insert(quoteRequests)
      .values({
        id: uuidv7(),
        briefId,
        cityArea,
        radiusMiles,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning();
    const verified = await this.db.select().from(shops).where(eq(shops.verificationStatus, "verified"));
    for (const shop of verified) {
      await this.db.insert(notifications).values({
        id: uuidv7(),
        userId: shop.ownerUserId,
        type: "quote_request",
        subjectType: "quote_request",
        subjectId: request!.id,
        payload: { cityArea, radiusMiles },
      });
    }
    return { request, notified: verified.length };
  }

  async submitQuote(ownerId: string, requestId: string, shopId: string, body: { lowCents: number; highCents: number; notes?: string; expiresAt: string }) {
    const shop = await this.ownedVerifiedShop(ownerId, shopId);
    if (!shop) return null;
    const [quote] = await this.db.insert(quotes).values({
      id: uuidv7(),
      requestId,
      shopId,
      lowCents: body.lowCents,
      highCents: body.highCents,
      notes: body.notes ?? null,
      expiresAt: new Date(body.expiresAt),
    }).returning();
    return quote ?? null;
  }

  async bookQuote(userId: string, quoteId: string, scheduledAt: string, serviceId?: string) {
    const row = await this.quoteWithSession(quoteId);
    if (!row || row.session.userId !== userId || row.quote.expiresAt.getTime() <= Date.now()) return null;
    const service = serviceId ? await this.shopService(row.quote.shopId, serviceId) : await this.firstShopService(row.quote.shopId);
    if (!service) return null;
    const fee = platformFee(row.quote.highCents);
    const bookingId = uuidv7();
    const [booking] = await this.db.insert(bookings).values({
      id: bookingId,
      shopId: row.quote.shopId,
      userId,
      serviceId: service.id,
      quoteId,
      vehicleId: row.session.vehicleId,
      scheduledAt: new Date(scheduledAt),
      applicationFeeCents: fee,
      calendarUid: `${bookingId}@garagetalk.local`,
    }).returning();
    await this.db.update(quotes).set({ status: "booked", updatedAt: new Date() }).where(eq(quotes.id, quoteId));
    return { booking, payment: { mode: "stub", applicationFeeCents: fee } };
  }

  async attestBookingOutcome(ownerId: string, bookingId: string, input: { verifiedFix: string; parts?: unknown[] }) {
    const row = await this.bookingWithSession(bookingId);
    if (!row || row.shop.ownerUserId !== ownerId || row.booking.status !== "completed") return null;
    const payload = {
      bookingId,
      sessionId: row.session.id,
      shopId: row.shop.id,
      verifiedFix: input.verifiedFix,
      parts: input.parts ?? [],
    };
    const [outcome] = await this.db.insert(faultOutcomes).values({
      id: uuidv7(),
      sessionId: row.session.id,
      bookingId,
      shopId: row.shop.id,
      verifiedFix: input.verifiedFix,
      parts: input.parts ?? [],
      inputSnapshot: row.session.inputs ?? {},
      attestation: signPayload(payload, row.shop.id),
    }).returning();
    return outcome ?? null;
  }

  async rememberObdDevice(userId: string, fingerprint: string, protocol?: string) {
    const [device] = await this.db.insert(obdDevices).values({
      id: uuidv7(),
      userId,
      fingerprint,
      protocol: protocol ?? null,
      lastConnectedAt: new Date(),
    }).returning();
    return device ?? null;
  }

  async streamObdSnapshot(userId: string, sessionId: string, snapshot: Record<string, unknown>, deviceId?: string) {
    const session = await this.getOwnedSession(userId, sessionId);
    if (!session) return null;
    const [row] = await this.db.insert(obdSnapshots).values({ id: uuidv7(), sessionId, deviceId: deviceId ?? null, snapshot }).returning();
    await this.db.update(diagnosticSessions).set({ modelMeta: { ...(session.modelMeta ?? {}), obdSnapshot: snapshot }, updatedAt: new Date() }).where(eq(diagnosticSessions.id, sessionId));
    return row ?? null;
  }

  async attestServiceRecord(ownerId: string, shopId: string, recordId: string, note: string) {
    const shop = await this.ownedVerifiedShop(ownerId, shopId);
    const [record] = await this.db.select().from(serviceRecords).where(eq(serviceRecords.id, recordId)).limit(1);
    if (!shop || !record) return null;
    const payload = { recordId, shopId, date: record.date.toISOString(), title: record.title, work: record.work, note };
    const [updated] = await this.db.update(serviceRecords).set({
      attestedByShopId: shopId,
      attestation: signPayload(payload, shopId),
      updatedAt: new Date(),
    }).where(eq(serviceRecords.id, recordId)).returning();
    return updated ?? null;
  }

  async verifyServiceRecord(recordId: string, note = "") {
    const [record] = await this.db.select().from(serviceRecords).where(eq(serviceRecords.id, recordId)).limit(1);
    if (!record || !record.attestedByShopId) return { valid: false, reason: "missing_attestation" };
    const payload = { recordId, shopId: record.attestedByShopId, date: record.date.toISOString(), title: record.title, work: record.work, note };
    return { valid: verifyAttestation(payload, record.attestedByShopId, record.attestation), record };
  }

  async verifiedHistory(vehicleId: string) {
    const rows = await this.db.select().from(serviceRecords).where(and(eq(serviceRecords.vehicleId, vehicleId), isNull(serviceRecords.deletedAt)));
    const timeline = [];
    for (const row of rows.filter((item) => item.sharedFields.length > 0)) {
      const result = row.attestedByShopId ? await this.verifyServiceRecord(row.id) : { valid: false };
      const verification = { valid: result.valid };
      timeline.push({ ...projectSharedRecord(row), verification });
    }
    return timeline;
  }

  async listingVerifiedHistory(listingId: string) {
    const [listing] = await this.db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
    return listing?.vehicleId ? this.verifiedHistory(listing.vehicleId) : [];
  }

  private async upsertRecall(item: { campaignId: string; make: string; model: string; year: number; summary: string; raw: Record<string, unknown> }) {
    const [existing] = await this.db.select().from(recalls).where(eq(recalls.campaignId, item.campaignId)).limit(1);
    if (existing) return [existing];
    return this.db.insert(recalls).values({ id: uuidv7(), campaignId: item.campaignId, make: item.make, model: item.model, year: item.year, summary: item.summary, raw: item.raw }).returning();
  }

  private async sendRecallDigests(digests: Map<string, string[]>) {
    for (const [userId, summaries] of digests) {
      const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user) await this.email.send({ to: user.email, subject: "Garage Talk recall digest", html: `<p>${summaries.join("<br>")}</p>` });
    }
  }

  private async assembleContext(userId: string, vehicleId: string) {
    const [vehicle] = await this.db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
    const recallRows = await this.db.select().from(recallAlerts).where(eq(recallAlerts.vehicleId, vehicleId));
    const history = await this.db.select().from(serviceRecords).where(and(eq(serviceRecords.vehicleId, vehicleId), isNull(serviceRecords.deletedAt)));
    const prior = await this.db.select().from(diagnosticSessions).where(and(eq(diagnosticSessions.userId, userId), eq(diagnosticSessions.vehicleId, vehicleId))).orderBy(desc(diagnosticSessions.createdAt)).limit(5);
    return { vehicle, vinDecoded: vehicle?.vinDecoded, recalls: recallRows, serviceHistory: history, priorSessions: prior };
  }

  private async rerankFromOutcomes(output: DiagnosticOutput, input: z.infer<typeof diagnosticInputSchema>) {
    const rows = await this.db.select().from(faultOutcomes);
    const matches = rows.filter((row) => {
      const snap = (row.inputSnapshot ?? {}) as { dtcCodes?: string[]; symptomText?: string };
      return (snap.dtcCodes ?? []).some((code) => input.dtcCodes.includes(code)) || input.symptomText.toLowerCase().includes(String(row.verifiedFix).toLowerCase().split(" ")[0] ?? "");
    });
    const hypotheses = output.hypotheses
      .map((h) => {
        const boost = matches.some((row) => row.verifiedFix.toLowerCase().includes(h.fault.toLowerCase().split(" ")[0] ?? "")) ? 0.25 : 0;
        return { ...h, confidence: Math.min(1, h.confidence + boost) };
      })
      .sort((a, b) => b.confidence - a.confidence);
    return { ...output, hypotheses };
  }

  private async ownsVehicle(userId: string, vehicleId: string) {
    const [row] = await this.db.select({ id: vehicles.id }).from(vehicles).where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId), isNull(vehicles.deletedAt))).limit(1);
    return Boolean(row);
  }

  private async getOwnedSession(userId: string, sessionId: string) {
    const [row] = await this.db.select().from(diagnosticSessions).where(and(eq(diagnosticSessions.id, sessionId), eq(diagnosticSessions.userId, userId))).limit(1);
    return row ?? null;
  }

  private async getOwnedBrief(userId: string, briefId: string) {
    const [row] = await this.db.select({ brief: repairBriefs }).from(repairBriefs).innerJoin(diagnosticSessions, eq(repairBriefs.sessionId, diagnosticSessions.id)).where(and(eq(repairBriefs.id, briefId), eq(diagnosticSessions.userId, userId))).limit(1);
    return row?.brief ?? null;
  }

  private async ownedVerifiedShop(ownerId: string, shopId: string) {
    const [shop] = await this.db.select().from(shops).where(and(eq(shops.id, shopId), eq(shops.ownerUserId, ownerId), eq(shops.verificationStatus, "verified"))).limit(1);
    return shop ?? null;
  }

  private async quoteWithSession(quoteId: string) {
    const [row] = await this.db.select({ quote: quotes, request: quoteRequests, brief: repairBriefs, session: diagnosticSessions }).from(quotes).innerJoin(quoteRequests, eq(quotes.requestId, quoteRequests.id)).innerJoin(repairBriefs, eq(quoteRequests.briefId, repairBriefs.id)).innerJoin(diagnosticSessions, eq(repairBriefs.sessionId, diagnosticSessions.id)).where(eq(quotes.id, quoteId)).limit(1);
    return row ?? null;
  }

  private async bookingWithSession(bookingId: string) {
    const [row] = await this.db.select({ booking: bookings, quote: quotes, request: quoteRequests, brief: repairBriefs, session: diagnosticSessions, shop: shops }).from(bookings).innerJoin(quotes, eq(bookings.quoteId, quotes.id)).innerJoin(quoteRequests, eq(quotes.requestId, quoteRequests.id)).innerJoin(repairBriefs, eq(quoteRequests.briefId, repairBriefs.id)).innerJoin(diagnosticSessions, eq(repairBriefs.sessionId, diagnosticSessions.id)).innerJoin(shops, eq(bookings.shopId, shops.id)).where(eq(bookings.id, bookingId)).limit(1);
    return row ?? null;
  }

  private async shopService(shopId: string, serviceId: string) {
    const [service] = await this.db.select().from(shopServices).where(and(eq(shopServices.id, serviceId), eq(shopServices.shopId, shopId))).limit(1);
    return service ?? null;
  }

  private async firstShopService(shopId: string) {
    const [service] = await this.db.select().from(shopServices).where(eq(shopServices.shopId, shopId)).limit(1);
    return service ?? null;
  }
}

function platformFee(amountCents: number) {
  return Math.floor((amountCents * 1_000 + 5_000) / 10_000);
}
