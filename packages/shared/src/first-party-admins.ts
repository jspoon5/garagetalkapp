/** First-party operators who may open /admin after normal app sign-in. */
export const FIRST_PARTY_ADMIN_EMAILS = [
  "spoon.jeremy@gmail.com", // Jeremy Spoon
] as const;

export const FIRST_PARTY_ADMIN_USERNAMES = [
  "jeremy",
  "jspoon5",
  "joe",
  "joseph",
  "josephbeaver",
  "jbeaver",
] as const;

function partsFromEnvValue(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0 && !part.startsWith("replace-with") && !part.startsWith("change-me"));
}

function emailsFromEnvValue(value: string | undefined): string[] {
  return partsFromEnvValue(value).filter((part) => part.includes("@"));
}

/** Merge hardcoded operators with `ADMIN_EMAIL` / `ADMIN_EMAILS` (comma-separated). */
export function parseAdminEmailAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  const fromEnv = [...emailsFromEnvValue(env.ADMIN_EMAIL), ...emailsFromEnvValue(env.ADMIN_EMAILS)];
  return [...new Set([...FIRST_PARTY_ADMIN_EMAILS.map((email) => email.toLowerCase()), ...fromEnv])];
}

export function parseAdminUsernameAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  const fromEnv = partsFromEnvValue(env.ADMIN_USERNAMES).filter((part) => !part.includes("@"));
  return [...new Set([...FIRST_PARTY_ADMIN_USERNAMES.map((name) => name.toLowerCase()), ...fromEnv])];
}

export function isFirstPartyAdminEmail(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return parseAdminEmailAllowlist(env).includes(email.trim().toLowerCase());
}

export function isFirstPartyAdminUsername(username: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return parseAdminUsernameAllowlist(env).includes(username.trim().toLowerCase());
}

export function isFirstPartyAdmin(
  input: { email?: string | null; username?: string | null },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (input.email && isFirstPartyAdminEmail(input.email, env)) return true;
  if (input.username && isFirstPartyAdminUsername(input.username, env)) return true;
  return false;
}
