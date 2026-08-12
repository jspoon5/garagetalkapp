import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { sessions, users } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";

const ARGON2_OPTS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
};

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

export class AuthService {
  constructor(private readonly db: Database) {}

  async register(input: {
    email: string;
    username: string;
    password: string;
  }): Promise<{ user: PublicUser; sessionToken: string }> {
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTS);

    const [user] = await this.db
      .insert(users)
      .values({
        id: uuidv7(),
        email,
        username,
        passwordHash,
        roles: ["user"],
      })
      .returning();

    if (!user) throw new Error("failed to create user");
    const sessionToken = await this.createSession(user.id);
    return { user: toPublic(user), sessionToken };
  }

  async login(input: {
    email: string;
    password: string;
    userAgent?: string;
    ip?: string;
  }): Promise<{ user: PublicUser; sessionToken: string } | null> {
    const email = input.email.trim().toLowerCase();
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
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
    if (!row) {
      // debug: fall through
      return null;
    }
    if (row.session.expiresAt.getTime() < Date.now()) return null;

    // rolling expiry
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
}
