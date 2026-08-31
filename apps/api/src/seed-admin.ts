import type { AuthService } from "./services/auth-service.js";

function sanitizeUsername(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  return cleaned.length >= 3 ? cleaned : "admin";
}

/**
 * Boot-time admin operator from Render/dashboard secrets.
 * No-op when ADMIN_EMAIL or ADMIN_PASSWORD is missing.
 */
export async function seedAdminFromEnv(auth: AuthService): Promise<string | null> {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 10) return null;

  const username =
    process.env.ADMIN_USERNAME?.trim() ||
    sanitizeUsername(email.includes("@") ? email.slice(0, email.indexOf("@")) : "admin");

  const user = await auth.ensureAdminFromEnv({ email, username, password });
  return user.username;
}
