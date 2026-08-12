import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { passkeys } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import type { AuthService } from "./auth-service.js";

type AuthenticatorTransportFuture = "usb" | "nfc" | "ble" | "internal" | "hybrid" | "smart-card";

export type PasskeyConfig = {
  rpName: string;
  rpID: string;
  origin: string;
};

type ChallengeKind = "register" | "login";

type ChallengeEntry = {
  challenge: string;
  kind: ChallengeKind;
  userId?: string;
};

export interface ChallengeStore {
  set(key: string, entry: ChallengeEntry): void;
  get(key: string): ChallengeEntry | undefined;
  delete(key: string): void;
}

export class MemoryChallengeStore implements ChallengeStore {
  private readonly entries = new Map<string, ChallengeEntry>();

  set(key: string, entry: ChallengeEntry): void {
    this.entries.set(key, entry);
  }

  get(key: string): ChallengeEntry | undefined {
    return this.entries.get(key);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }
}

export type PasskeyVerifyHooks = {
  verifyRegistration?: typeof verifyRegistrationResponse;
  verifyAuthentication?: typeof verifyAuthenticationResponse;
};

const registrationResponseSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  response: z.object({
    clientDataJSON: z.string(),
    attestationObject: z.string(),
    transports: z.array(z.string()).optional(),
  }),
  type: z.literal("public-key"),
  clientExtensionResults: z.record(z.unknown()).optional(),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
});

const authenticationResponseSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  response: z.object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }),
  type: z.literal("public-key"),
  clientExtensionResults: z.record(z.unknown()).optional(),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
});

function challengeFromClientData(clientDataJSON: string): string {
  const parsed = JSON.parse(
    Buffer.from(clientDataJSON, "base64url").toString("utf8"),
  ) as { challenge?: string };
  if (!parsed.challenge) throw new Error("missing_challenge");
  return parsed.challenge;
}

export class PasskeyService {
  private readonly verifyRegistrationFn: typeof verifyRegistrationResponse;
  private readonly verifyAuthenticationFn: typeof verifyAuthenticationResponse;

  constructor(
    private readonly db: Database,
    private readonly auth: AuthService,
    private readonly config: PasskeyConfig,
    private readonly challenges: ChallengeStore,
    hooks: PasskeyVerifyHooks = {},
  ) {
    this.verifyRegistrationFn = hooks.verifyRegistration ?? verifyRegistrationResponse;
    this.verifyAuthenticationFn = hooks.verifyAuthentication ?? verifyAuthenticationResponse;
  }

  async registrationOptions(userId: string, username: string, email: string) {
    const existing = await this.db.select().from(passkeys).where(eq(passkeys.userId, userId));
    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpID,
      userName: email,
      userDisplayName: username,
      userID: Buffer.from(userId, "utf8"),
      excludeCredentials: existing.map((row) => ({
        id: row.credentialId,
        transports: row.transports as AuthenticatorTransportFuture[],
      })),
    });
    this.challenges.set(`reg:${userId}`, {
      challenge: options.challenge,
      kind: "register",
      userId,
    });
    return options;
  }

  async verifyRegistration(userId: string, body: unknown) {
    const response = registrationResponseSchema.parse(body) as RegistrationResponseJSON;
    const pending = this.challenges.get(`reg:${userId}`);
    if (!pending || pending.kind !== "register") {
      throw new Error("challenge_not_found");
    }

    const verification = await this.verifyRegistrationFn({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: this.config.origin,
      expectedRPID: this.config.rpID,
      requireUserVerification: false,
    });
    this.challenges.delete(`reg:${userId}`);

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error("verification_failed");
    }

    const { credential } = verification.registrationInfo;
    await this.db.insert(passkeys).values({
      id: uuidv7(),
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: response.response.transports ?? [],
    });
    return { ok: true as const };
  }

  async loginOptions() {
    const rows = await this.db.select().from(passkeys);
    const options = await generateAuthenticationOptions({
      rpID: this.config.rpID,
      allowCredentials: rows.map((row) => ({
        id: row.credentialId,
        transports: row.transports as AuthenticatorTransportFuture[],
      })),
    });
    this.challenges.set(`login:${options.challenge}`, {
      challenge: options.challenge,
      kind: "login",
    });
    return options;
  }

  async verifyLogin(body: unknown, userAgent?: string, ip?: string) {
    const response = authenticationResponseSchema.parse(body) as AuthenticationResponseJSON;
    const challenge = challengeFromClientData(response.response.clientDataJSON);
    const pending = this.challenges.get(`login:${challenge}`);
    if (!pending || pending.kind !== "login") {
      throw new Error("challenge_not_found");
    }

    const [stored] = await this.db
      .select()
      .from(passkeys)
      .where(eq(passkeys.credentialId, response.id))
      .limit(1);
    if (!stored) throw new Error("credential_not_found");

    const verification = await this.verifyAuthenticationFn({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: this.config.origin,
      expectedRPID: this.config.rpID,
      credential: {
        id: stored.credentialId,
        publicKey: Buffer.from(stored.publicKey, "base64url"),
        counter: stored.counter,
        transports: stored.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: false,
    });
    this.challenges.delete(`login:${challenge}`);

    if (!verification.verified) throw new Error("verification_failed");

    await this.db
      .update(passkeys)
      .set({
        counter: verification.authenticationInfo.newCounter,
        updatedAt: new Date(),
      })
      .where(eq(passkeys.id, stored.id));

    const sessionToken = await this.auth.createSession(stored.userId, userAgent, ip);
    return { sessionToken, userId: stored.userId };
  }
}

/** Test double: validates payload shape then stores a fixture credential without crypto. */
export function stubVerifyRegistration(
  fixture: { credentialId: string; publicKey: string; counter?: number },
): PasskeyVerifyHooks["verifyRegistration"] {
  return async (opts): Promise<VerifiedRegistrationResponse> => {
    registrationResponseSchema.parse(opts.response);
    return {
      verified: true,
      registrationInfo: {
        fmt: "none",
        aaguid: "00000000-0000-0000-0000-000000000000",
        credentialType: "public-key",
        attestationObject: new Uint8Array(),
        userVerified: true,
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        origin: "http://localhost:5173",
        credential: {
          id: fixture.credentialId,
          publicKey: Buffer.from(fixture.publicKey, "base64url"),
          counter: fixture.counter ?? 0,
          transports: [],
        },
      },
    };
  };
}

/** Test double: validates payload shape then accepts login with incremented counter. */
export function stubVerifyAuthentication(
  counter = 1,
): PasskeyVerifyHooks["verifyAuthentication"] {
  return async (opts): Promise<VerifiedAuthenticationResponse> => {
    authenticationResponseSchema.parse(opts.response);
    return {
      verified: true,
      authenticationInfo: {
        credentialID: opts.credential.id,
        newCounter: counter,
        userVerified: true,
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        origin: "http://localhost:5173",
        rpID: "localhost",
      },
    };
  };
}
