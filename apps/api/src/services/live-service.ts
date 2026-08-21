import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { liveGuestRequests, liveRoles, liveSessions, users } from "@garagetalk/db";
import type { EmailClient } from "@garagetalk/email";
import { MemoryEmailClient } from "@garagetalk/email";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { EntitlementService } from "./entitlement-service.js";
import { reactionCounts, reactionIdsForUser, toggleReaction } from "./reaction-store.js";

export const liveRoleSchema = z.enum(["host", "mod", "guest", "viewer"]);
export type LiveRole = z.infer<typeof liveRoleSchema>;

export const guestRequestInputSchema = z.object({
  message: z.string().max(500).optional(),
});

export const guestDecisionSchema = z.object({
  requestId: z.string().uuid(),
  approve: z.boolean(),
});

export const liveSessionInputSchema = z.object({
  roomName: z.string().min(3).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().min(1).max(200).nullable().optional(),
  kind: z.enum(["stream", "class", "office_hours"]).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

export const liveTokenInputSchema = z.object({
  role: liveRoleSchema.optional(),
});

export const liveRoleInputSchema = z.object({
  userId: z.string().uuid(),
  role: liveRoleSchema,
});

export const recordingEventSchema = z.object({
  assetId: z.string().min(1).max(200).optional(),
  replayUrl: z.string().url().optional(),
  error: z.string().min(1).max(500).optional(),
});

type LiveSessionInput = z.infer<typeof liveSessionInputSchema>;
type RecordingEvent = "start" | "egress_complete" | "upload_complete" | "fail";
type RecordingState = "idle" | "recording" | "uploading" | "ready" | "failed";

const ROLE_RANK: Record<LiveRole, number> = { viewer: 0, guest: 1, mod: 2, host: 3 };
const DEFAULT_SECRET = "test-livekit-secret";
const DEFAULT_KEY = "test-livekit-key";

function b64(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyMockLiveKitToken(token: string, secret = DEFAULT_SECRET): boolean {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return false;
  return safeEqual(hmac(`${header}.${payload}`, secret), signature);
}

function signMockLiveKitToken(input: {
  apiKey: string;
  secret: string;
  roomName: string;
  role: LiveRole;
  userId: string;
  username?: string;
}): string {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: input.apiKey,
    sub: input.userId,
    nbf: now - 5,
    exp: now + 60 * 60,
    video: {
      room: input.roomName,
      roomJoin: true,
      canPublish: input.role === "host" || input.role === "guest" || input.role === "mod",
      canSubscribe: true,
      roomAdmin: input.role === "host",
      roomRecord: input.role === "host" || input.role === "mod",
    },
    metadata: JSON.stringify({ role: input.role, username: input.username ?? input.userId }),
  };
  const body = b64(JSON.stringify(payload));
  return `${header}.${body}.${hmac(`${header}.${body}`, input.secret)}`;
}

async function signLiveKitToken(input: {
  apiKey: string;
  secret: string;
  roomName: string;
  role: LiveRole;
  userId: string;
  username?: string;
}): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY ?? input.apiKey;
  const secret = process.env.LIVEKIT_API_SECRET ?? input.secret;
  if (process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
    try {
      const { AccessToken } = await import("livekit-server-sdk");
      const token = new AccessToken(apiKey, secret, {
        identity: input.userId,
        name: input.username ?? input.userId,
        metadata: JSON.stringify({ role: input.role }),
      });
      token.addGrant({
        roomJoin: true,
        room: input.roomName,
        canPublish: input.role === "host" || input.role === "guest" || input.role === "mod",
        canSubscribe: true,
        roomAdmin: input.role === "host",
        roomRecord: input.role === "host" || input.role === "mod",
      });
      return await token.toJwt();
    } catch {
      // Fall back to mock JWT when SDK unavailable.
    }
  }
  return signMockLiveKitToken({ ...input, apiKey, secret });
}

export type LiveSessionBroadcaster = (sessionId: string, payload: unknown) => void;

export class LiveService {
  private readonly emailClient: EmailClient;
  private readonly entitlements: EntitlementService;
  private broadcaster: LiveSessionBroadcaster | null = null;

  constructor(
    private readonly db: Database,
    opts: { emailClient?: EmailClient; entitlements?: EntitlementService } = {},
  ) {
    this.emailClient = opts.emailClient ?? new MemoryEmailClient();
    this.entitlements = opts.entitlements ?? new EntitlementService(db);
  }

  setBroadcaster(fn: LiveSessionBroadcaster) {
    this.broadcaster = fn;
  }

  broadcast(sessionId: string, payload: unknown) {
    this.broadcaster?.(sessionId, payload);
  }

  liveKitUrl(): string | null {
    return process.env.LIVEKIT_URL ?? null;
  }

  async listSessions(userId?: string | null) {
    const rows = await this.db
      .select()
      .from(liveSessions)
      .where(isNull(liveSessions.endedAt))
      .orderBy(desc(liveSessions.createdAt))
      .limit(20);
    const ids = rows.map((row) => row.id);
    const counts = await reactionCounts(this.db, "live_session", ids);
    const liked = userId ? await reactionIdsForUser(this.db, userId, "live_session", ids) : new Set<string>();
    return rows.map((row) => ({
      ...row,
      rtmpStreamKey: null,
      likeCount: counts.get(row.id) ?? 0,
      likedByMe: liked.has(row.id),
    }));
  }

  async getPublicSession(sessionId: string, userId?: string | null) {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    const counts = await reactionCounts(this.db, "live_session", [sessionId]);
    const liked = userId ? await reactionIdsForUser(this.db, userId, "live_session", [sessionId]) : new Set<string>();
    return {
      ...session,
      rtmpStreamKey: null,
      likeCount: counts.get(sessionId) ?? 0,
      likedByMe: liked.has(sessionId),
    };
  }

  async toggleLike(userId: string, sessionId: string) {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    const result = await toggleReaction(this.db, userId, "live_session", sessionId, "like");
    const counts = await reactionCounts(this.db, "live_session", [sessionId]);
    return { liked: result.liked, likeCount: counts.get(sessionId) ?? 0 };
  }

  async createSession(hostId: string, input: LiveSessionInput) {
    const entitlement = await this.entitlements.resolveForUser(hostId);
    if (!entitlement?.canHostLive) {
      return { error: "upgrade_required" as const };
    }

    const parsed = liveSessionInputSchema.parse(input);
    const sessionId = uuidv7();
    const secret = process.env.LIVEKIT_API_SECRET ?? DEFAULT_SECRET;
    const rtmpBase = process.env.LIVEKIT_RTMP_URL?.trim();
    const rtmpReady = Boolean(rtmpBase && !rtmpBase.includes("livekit.local"));
    const rtmp = rtmpReady
      ? {
          url: rtmpBase!,
          key: `gt_${hmac(sessionId, secret).slice(0, 32)}`,
        }
      : { url: null as string | null, key: null as string | null };
    const scheduledAt = parsed.scheduledAt ? new Date(parsed.scheduledAt) : null;

    const [session] = await this.db
      .insert(liveSessions)
      .values({
        id: sessionId,
        hostId,
        roomName: parsed.roomName,
        title: parsed.title ?? null,
        kind: parsed.kind ?? "stream",
        scheduledAt,
        rtmpEnabled: rtmpReady ? "true" : "false",
        rtmpIngestUrl: rtmp.url,
        rtmpStreamKey: rtmp.key,
      })
      .returning();
    if (!session) throw new Error("failed to create live session");

    await this.db.insert(liveRoles).values({
      id: uuidv7(),
      sessionId,
      userId: hostId,
      role: "host",
    });

    if (scheduledAt) await this.sendReminder(sessionId);
    const [updated] = await this.db.select().from(liveSessions).where(eq(liveSessions.id, sessionId));
    return { session: updated ?? session, rtmp };
  }

  async sendReminder(sessionId: string): Promise<boolean> {
    const row = await this.getSessionWithHost(sessionId);
    if (!row?.session.scheduledAt) return false;
    await this.emailClient.send({
      to: row.host.email,
      subject: `Garage Talk live reminder: ${row.session.title ?? row.session.roomName}`,
      html: `<p>Your scheduled live session starts at ${row.session.scheduledAt.toISOString()}.</p>`,
    });
    await this.db
      .update(liveSessions)
      .set({ reminderSentAt: new Date(), updatedAt: new Date() })
      .where(eq(liveSessions.id, sessionId));
    return true;
  }

  async getRtmpConfig(sessionId: string, actorId: string) {
    const session = await this.getAuthorizedSession(sessionId, actorId, "mod");
    if (!session) return null;
    const url = session.rtmpIngestUrl;
    if (!url || url.includes("livekit.local")) {
      return { url: null, key: null };
    }
    return { url, key: session.rtmpStreamKey };
  }

  async assignRole(sessionId: string, actorId: string, targetUserId: string, role: LiveRole) {
    const session = await this.getAuthorizedSession(sessionId, actorId, "host");
    if (!session) return null;
    const [row] = await this.db
      .insert(liveRoles)
      .values({ id: uuidv7(), sessionId, userId: targetUserId, role })
      .onConflictDoUpdate({
        target: [liveRoles.sessionId, liveRoles.userId],
        set: { role, updatedAt: new Date() },
      })
      .returning();
    return row ?? null;
  }

  async issueToken(sessionId: string, userId: string, requestedRole?: LiveRole) {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    const effectiveRole = await this.getEffectiveRole(sessionId, userId);
    const role = requestedRole ?? effectiveRole;
    if (ROLE_RANK[role] > ROLE_RANK[effectiveRole]) return { error: "forbidden" as const };
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const token = await signLiveKitToken({
      apiKey: process.env.LIVEKIT_API_KEY ?? DEFAULT_KEY,
      secret: process.env.LIVEKIT_API_SECRET ?? DEFAULT_SECRET,
      roomName: session.roomName,
      role,
      userId,
      username: user?.username,
    });
    return {
      token,
      role,
      roomName: session.roomName,
      livekitUrl: this.liveKitUrl(),
    };
  }

  async requestGuest(sessionId: string, userId: string, message?: string) {
    const session = await this.getSession(sessionId);
    if (!session || session.endedAt) return { error: "session_not_found" as const };
    if (session.hostId === userId) return { error: "host_cannot_guest" as const };
    const [existing] = await this.db
      .select()
      .from(liveGuestRequests)
      .where(and(eq(liveGuestRequests.sessionId, sessionId), eq(liveGuestRequests.userId, userId)))
      .limit(1);
    if (existing?.status === "pending") return { request: existing };
    if (existing?.status === "approved") return { request: existing };
    const requestId = uuidv7();
    const [request] = await this.db
      .insert(liveGuestRequests)
      .values({
        id: requestId,
        sessionId,
        userId,
        message: message ?? null,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: [liveGuestRequests.sessionId, liveGuestRequests.userId],
        set: { message: message ?? null, status: "pending", updatedAt: new Date(), decidedAt: null, decidedById: null },
      })
      .returning();
    this.broadcast(sessionId, { type: "guest_request", requestId: request?.id ?? requestId, userId });
    return { request: request ?? null };
  }

  async listGuestRequests(sessionId: string, actorId: string) {
    const session = await this.getAuthorizedSession(sessionId, actorId, "host");
    if (!session) return null;
    const rows = await this.db
      .select({ request: liveGuestRequests, user: users })
      .from(liveGuestRequests)
      .innerJoin(users, eq(liveGuestRequests.userId, users.id))
      .where(and(eq(liveGuestRequests.sessionId, sessionId), eq(liveGuestRequests.status, "pending")))
      .orderBy(desc(liveGuestRequests.createdAt));
    return rows.map((row) => ({
      id: row.request.id,
      userId: row.request.userId,
      username: row.user.username,
      message: row.request.message,
      createdAt: row.request.createdAt.toISOString(),
    }));
  }

  async decideGuestRequest(sessionId: string, hostId: string, requestId: string, approve: boolean) {
    const session = await this.getAuthorizedSession(sessionId, hostId, "host");
    if (!session) return null;
    const [request] = await this.db
      .select()
      .from(liveGuestRequests)
      .where(and(eq(liveGuestRequests.id, requestId), eq(liveGuestRequests.sessionId, sessionId)))
      .limit(1);
    if (!request || request.status !== "pending") return { error: "invalid_request" as const };
    const now = new Date();
    const status = approve ? "approved" : "declined";
    await this.db
      .update(liveGuestRequests)
      .set({ status, decidedAt: now, decidedById: hostId, updatedAt: now })
      .where(eq(liveGuestRequests.id, requestId));
    if (approve) {
      await this.db
        .insert(liveRoles)
        .values({ id: uuidv7(), sessionId, userId: request.userId, role: "guest" })
        .onConflictDoUpdate({
          target: [liveRoles.sessionId, liveRoles.userId],
          set: { role: "guest", updatedAt: now },
        });
    }
    this.broadcast(sessionId, { type: "guest_decision", requestId, userId: request.userId, approve });
    return { ok: true, status };
  }

  async markStarted(sessionId: string, hostId: string) {
    const session = await this.getAuthorizedSession(sessionId, hostId, "host");
    if (!session) return null;
    const [updated] = await this.db
      .update(liveSessions)
      .set({ startedAt: new Date(), updatedAt: new Date() })
      .where(eq(liveSessions.id, sessionId))
      .returning();
    return updated ?? null;
  }

  async transitionRecording(
    sessionId: string,
    actorId: string,
    event: RecordingEvent,
    input: z.infer<typeof recordingEventSchema>,
  ) {
    const session = await this.getAuthorizedSession(sessionId, actorId, "mod");
    if (!session) return null;
    const parsed = recordingEventSchema.parse(input);
    const state = session.recordingState as RecordingState;
    const patch = this.recordingPatch(state, event, parsed);
    if (!patch) return { error: "invalid_transition" as const, state };

    const [updated] = await this.db
      .update(liveSessions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(liveSessions.id, sessionId))
      .returning();
    return { session: updated ?? null };
  }

  private recordingPatch(
    state: RecordingState,
    event: RecordingEvent,
    input: z.infer<typeof recordingEventSchema>,
  ): Partial<typeof liveSessions.$inferInsert> | null {
    if (event === "start" && state === "idle") {
      return { recordingState: "recording", recordingAssetId: input.assetId ?? `egress_${uuidv7()}` };
    }
    if (event === "egress_complete" && state === "recording") {
      return { recordingState: "uploading", recordingAssetId: input.assetId ?? null };
    }
    if (event === "upload_complete" && state === "uploading") {
      return {
        recordingState: "ready",
        recordingReplayUrl:
          input.replayUrl ?? `https://stream.garagetalk.local/replays/${input.assetId ?? uuidv7()}`,
      };
    }
    if (event === "fail" && (state === "recording" || state === "uploading")) {
      return { recordingState: "failed", recordingError: input.error ?? "recording_failed" };
    }
    return null;
  }

  private async getSession(sessionId: string) {
    const [session] = await this.db.select().from(liveSessions).where(eq(liveSessions.id, sessionId));
    return session ?? null;
  }

  private async getSessionWithHost(sessionId: string) {
    const [row] = await this.db
      .select({ session: liveSessions, host: users })
      .from(liveSessions)
      .innerJoin(users, eq(liveSessions.hostId, users.id))
      .where(eq(liveSessions.id, sessionId));
    return row ?? null;
  }

  private async getEffectiveRole(sessionId: string, userId: string): Promise<LiveRole> {
    const session = await this.getSession(sessionId);
    if (session?.hostId === userId) return "host";
    const [role] = await this.db
      .select()
      .from(liveRoles)
      .where(and(eq(liveRoles.sessionId, sessionId), eq(liveRoles.userId, userId)))
      .limit(1);
    if (role?.role) return role.role;
    const [approvedGuest] = await this.db
      .select()
      .from(liveGuestRequests)
      .where(
        and(
          eq(liveGuestRequests.sessionId, sessionId),
          eq(liveGuestRequests.userId, userId),
          eq(liveGuestRequests.status, "approved"),
        ),
      )
      .limit(1);
    return approvedGuest ? "guest" : "viewer";
  }

  private async getAuthorizedSession(sessionId: string, actorId: string, minimum: LiveRole) {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    const role = await this.getEffectiveRole(sessionId, actorId);
    return ROLE_RANK[role] >= ROLE_RANK[minimum] ? session : null;
  }
}
