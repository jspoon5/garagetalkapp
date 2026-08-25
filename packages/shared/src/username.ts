export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

export function isValidUsername(username: string): boolean {
  const trimmed = username.trim();
  return (
    trimmed.length >= USERNAME_MIN_LENGTH &&
    trimmed.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(trimmed)
  );
}

/** Derive a valid username suggestion from an email local-part. */
export function suggestUsernameFromEmail(email: string): string {
  const local = email.trim().split("@")[0] ?? "";
  let suggested = local
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (suggested.length < USERNAME_MIN_LENGTH) {
    suggested = `${suggested || "garage"}user`.slice(0, USERNAME_MAX_LENGTH);
  }
  return suggested.slice(0, USERNAME_MAX_LENGTH);
}
