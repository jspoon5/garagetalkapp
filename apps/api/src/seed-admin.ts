import type { AuthService } from "./services/auth-service.js";

/** Standard operator Joe does not need to register. Password still comes from ADMIN_PASSWORD. */
export const DEFAULT_ADMIN_EMAIL = "joe@garagetalk.app";
export const DEFAULT_ADMIN_USERNAME = "joe";

function sanitizeUsername(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  return cleaned.length >= 3 ? cleaned : DEFAULT_ADMIN_USERNAME;
}

/**
 * Boot-time admin operator from Render/dashboard secrets.
 * No-op when ADMIN_PASSWORD is missing or shorter than 10 characters.
 * Defaults to Joe (`joe` / `joe@garagetalk.app`) so he does not self-register.
 */
export async function seedAdminFromEnv(auth: AuthService): Promise<string | null> {
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (password.length < 10) return null;

  const email = process.env.ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;
  const username =
    process.env.ADMIN_USERNAME?.trim() ||
    (process.env.ADMIN_EMAIL?.trim()
      ? sanitizeUsername(email.includes("@") ? email.slice(0, email.indexOf("@")) : DEFAULT_ADMIN_USERNAME)
      : DEFAULT_ADMIN_USERNAME);

  const user = await auth.ensureAdminFromEnv({ email, username, password });
  return user.username;
}
