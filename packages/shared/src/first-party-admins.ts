/** First-party operators who may open /admin after normal app sign-in. */
export const FIRST_PARTY_ADMIN_EMAILS = [
  "spoon.jeremy@gmail.com", // Jeremy Spoon
] as const;

function emailsFromEnvValue(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.includes("@") && !part.startsWith("replace-with") && !part.startsWith("change-me"));
}

/** Merge hardcoded operators with `ADMIN_EMAIL` / `ADMIN_EMAILS` (comma-separated). */
export function parseAdminEmailAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  const fromEnv = [...emailsFromEnvValue(env.ADMIN_EMAIL), ...emailsFromEnvValue(env.ADMIN_EMAILS)];
  return [...new Set([...FIRST_PARTY_ADMIN_EMAILS.map((email) => email.toLowerCase()), ...fromEnv])];
}

export function isFirstPartyAdminEmail(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return parseAdminEmailAllowlist(env).includes(email.trim().toLowerCase());
}
