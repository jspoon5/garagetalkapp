import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { liveRoles, liveSessions, users } from "@garagetalk/db";
import type { EmailClient } from "@garagetalk/email";
import { MemoryEmailClient } from "@garagetalk/email";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

export const liveRoleSchema = z.enum(["host", "mod", "viewer"]);
export type LiveRole = z.infer<typeof liveRoleSchema>;

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

const ROLE_RANK: Record<LiveRole, number> = { viewer: 0, mod: 1, host: 2 };
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

function signLiveKitToken(input: {
  apiKey: string;
  secret: string;
  roomName: string;
  role: LiveRole;
  userId: string;
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
      canPublish: input.role !== "viewer",
      canSubscribe: true,
      roomAdmin: input.role === "host",
      roomRecord: input.role === "host" || input.role === "mod",
    },
    metadata: JSON.stringify({ role: input.role }),
  };
  const body = b64(JSON.stringify(payload));
  return `${header}.${body}.${hmac(`${header}.${body}`, input.secret)}`;
}

export class LiveService {
  private readonly emailClient: EmailClient;

  constructor(
    private readonly db: Database,
    opts: { emailClient?: EmailClient } = {},
  ) {
    this.emailClient = opts.emailClient ?? new MemoryEmailClient();
  }

  async createSession(hostId: string, input: LiveSessionInput) {
    const parsed = liveSessionInputSchema.parse(input);
    const sessionId = uuidv7();
    const secret = process.env.LIVEKIT_API_SECRET ?? DEFAULT_SECRET;
    const rtmp = {
      url: process.env.LIVEKIT_RTMP_URL ?? "rtmp://rtmp.livekit.local/live",
      key: `gt_${hmac(sessionId, secret).slice(0, 32)}`,
    };
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
        rtmpEnabled: "true",
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
    return { url: session.rtmpIngestUrl, key: session.rtmpStreamKey };
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
    const token = signLiveKitToken({
      apiKey: process.env.LIVEKIT_API_KEY ?? DEFAULT_KEY,
      secret: process.env.LIVEKIT_API_SECRET ?? DEFAULT_SECRET,
      roomName: session.roomName,
      role,
      userId,
    });
    return { token, role, roomName: session.roomName };
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
    return role?.role ?? "viewer";
  }

  private async getAuthorizedSession(sessionId: string, actorId: string, minimum: LiveRole) {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    const role = await this.getEffectiveRole(sessionId, actorId);
    return ROLE_RANK[role] >= ROLE_RANK[minimum] ? session : null;
  }
}
