import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { and, eq, isNull, or } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { authTokens, sessions, users } from "@garagetalk/db";
import {
  MemoryEmailClient,
  passwordResetEmailHtml,
  verificationEmailHtml,
  type EmailClient,
} from "@garagetalk/email";
import { uuidv7 } from "uuidv7";
import { meetsMinimumAge } from "@garagetalk/shared";

const ARGON2_OPTS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
};

const TOKEN_TTL_MS = 60 * 60 * 1000;

export type PublicUser = {
  id: string;
  email: string;
  username: string;
  bio: string | null;
  cityText: string | null;
  avatarType: "color" | "image" | "animated";
  avatarValue: string;
  tier: "amateur" | "gearhead" | "racing_pro" | "pro";
  emailVerifiedAt: Date | null;
};

function toPublic(u: typeof users.$inferSelect): PublicUser {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    bio: u.bio,
    cityText: u.cityText,
    avatarType: u.avatarType,
    avatarValue: u.avatarValue,
    tier: u.tier,
    emailVerifiedAt: u.emailVerifiedAt,
  };
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type AuthServiceOptions = {
  emailClient?: EmailClient;
  appBaseUrl?: string;
};

export class AuthService {
  private readonly emailClient: EmailClient;
  private readonly appBaseUrl: string;

  constructor(
    private readonly db: Database,
    opts: AuthServiceOptions = {},
  ) {
    this.emailClient = opts.emailClient ?? new MemoryEmailClient();
    this.appBaseUrl = opts.appBaseUrl ?? "http://localhost:5173";
  }

  /**
   * Create or repair a non-admin amateur tester. If the username or email already
   * exists, reset the password hash so a known login cannot stay broken.
   */
  async ensureAmateurTester(input: {
    email: string;
    username: string;
    password: string;
  }): Promise<PublicUser> {
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();
    const [existing] = await this.db
      .select()
      .from(users)
      .where(or(eq(users.username, username), eq(users.email, email)))
      .limit(1);

    const passwordHash = await argon2.hash(input.password, ARGON2_OPTS);
    if (!existing) {
      const [user] = await this.db
        .insert(users)
        .values({
          id: uuidv7(),
          email,
          username,
          passwordHash,
          roles: ["user"],
          tier: "amateur",
          birthYear: 1990,
          ageVerifiedAt: new Date(),
          privacyPolicyAcceptedAt: new Date(),
        })
        .returning();
      if (!user) throw new Error("failed to create tester");
      return toPublic(user);
    }

    const passwordOk = existing.passwordHash
      ? await argon2.verify(existing.passwordHash, input.password).catch(() => false)
      : false;
    const alreadyGood =
      passwordOk &&
      existing.username === username &&
      existing.email === email &&
      existing.tier === "amateur" &&
      !existing.roles.includes("admin") &&
      existing.deletedAt == null;
    if (alreadyGood) return toPublic(existing);

    const [user] = await this.db
      .update(users)
      .set({
        passwordHash,
        email,
        username,
        roles: ["user"],
        tier: "amateur",
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    if (!user) throw new Error("failed to repair tester");
    return toPublic(user);
  }

  async register(input: {
    email: string;
    username: string;
    password: string;
    birthYear: number;
    ageConfirmed: true;
  }): Promise<{ user: PublicUser; sessionToken: string }> {
    if (!input.ageConfirmed || !meetsMinimumAge(input.birthYear)) {
      throw new Error("underage");
    }
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTS);

    const now = new Date();
    const [user] = await this.db
      .insert(users)
      .values({
        id: uuidv7(),
        email,
        username,
        passwordHash,
        roles: ["user"],
        birthYear: input.birthYear,
        ageVerifiedAt: now,
        privacyPolicyAcceptedAt: now,
      })
      .returning();

    if (!user) throw new Error("failed to create user");
    const sessionToken = await this.createSession(user.id);
    return { user: toPublic(user), sessionToken };
  }

  async login(input: {
    username: string;
    password: string;
    userAgent?: string;
    ip?: string;
  }): Promise<{ user: PublicUser; sessionToken: string } | null> {
    const identifier = input.username.trim();
    if (!identifier) return null;
    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          or(eq(users.username, identifier), eq(users.email, identifier.toLowerCase())),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    if (!user?.passwordHash) return null;

    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) return null;

    const sessionToken = await this.createSession(user.id, input.userAgent, input.ip);
    return { user: toPublic(user), sessionToken };
  }

  async createSession(userId: string, userAgent?: string, ip?: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db.insert(sessions).values({
      id: uuidv7(),
      userId,
      token,
      expiresAt,
      userAgent: userAgent ?? null,
      ipHash: ip ? hashIp(ip) : null,
    });
    return token;
  }

  async getUserBySession(token: string): Promise<PublicUser | null> {
    const [row] = await this.db
      .select({ user: users, session: sessions })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.token, token), isNull(users.deletedAt)))
      .limit(1);
    if (!row) return null;
    if (row.session.expiresAt.getTime() < Date.now()) return null;

    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db
      .update(sessions)
      .set({ expiresAt: newExpiry, updatedAt: new Date() })
      .where(eq(sessions.id, row.session.id));

    return toPublic(row.user);
  }

  async logout(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.token, token));
  }

  async logoutEverywhere(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }

  async updateProfile(
    userId: string,
    patch: Partial<{
      bio: string | null;
      cityText: string | null;
      avatarType: "color" | "image" | "animated";
      avatarValue: string;
      username: string;
    }>,
  ): Promise<PublicUser | null> {
    const [user] = await this.db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning();
    return user ? toPublic(user) : null;
  }

  async softDeleteAccount(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
    await this.logoutEverywhere(userId);
  }

  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error("not found");
    return {
      exportedAt: new Date().toISOString(),
      user: toPublic(user),
      note: "Full zip export of media/objects lands in later phase job; JSON core export available now.",
    };
  }

  async requestEmailVerification(userId: string): Promise<void> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user) throw new Error("not found");
    if (user.emailVerifiedAt) return;

    const rawToken = randomBytes(32).toString("base64url");
    await this.db.insert(authTokens).values({
      id: uuidv7(),
      userId,
      type: "verify_email",
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });

    const link = `${this.appBaseUrl}/verify-email?token=${rawToken}`;
    await this.emailClient.send({
      to: user.email,
      subject: "Verify your Garage Talk email",
      html: verificationEmailHtml(link),
    });
  }

  async confirmEmailVerification(token: string): Promise<PublicUser | null> {
    const tokenHash = hashToken(token);
    const [row] = await this.db
      .select()
      .from(authTokens)
      .where(
        and(
          eq(authTokens.tokenHash, tokenHash),
          eq(authTokens.type, "verify_email"),
          isNull(authTokens.usedAt),
        ),
      )
      .limit(1);
    if (!row || !row.userId || row.expiresAt.getTime() < Date.now()) return null;
    const userId = row.userId;

    await this.db
      .update(authTokens)
      .set({ usedAt: new Date(), updatedAt: new Date() })
      .where(eq(authTokens.id, row.id));

    const [user] = await this.db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning();
    return user ? toPublic(user) : null;
  }

  async requestPasswordReset(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, normalized), isNull(users.deletedAt)))
      .limit(1);
    if (!user) return;

    const rawToken = randomBytes(32).toString("base64url");
    await this.db.insert(authTokens).values({
      id: uuidv7(),
      userId: user.id,
      type: "password_reset",
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });

    const link = `${this.appBaseUrl}/reset-password?token=${rawToken}`;
    await this.emailClient.send({
      to: user.email,
      subject: "Reset your Garage Talk password",
      html: passwordResetEmailHtml(link),
    });
  }

  async confirmPasswordReset(token: string, password: string): Promise<boolean> {
    const tokenHash = hashToken(token);
    const [row] = await this.db
      .select()
      .from(authTokens)
      .where(
        and(
          eq(authTokens.tokenHash, tokenHash),
          eq(authTokens.type, "password_reset"),
          isNull(authTokens.usedAt),
        ),
      )
      .limit(1);
    if (!row || !row.userId || row.expiresAt.getTime() < Date.now()) return false;
    const userId = row.userId;

    const passwordHash = await argon2.hash(password, ARGON2_OPTS);
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    await this.db
      .update(authTokens)
      .set({ usedAt: new Date(), updatedAt: new Date() })
      .where(eq(authTokens.id, row.id));

    await this.logoutEverywhere(userId);
    return true;
  }
}
