export const USERNAME_MIN_LENGTH = 1;
export const USERNAME_MAX_LENGTH = 64;

/** Any non-empty trimmed string within length bounds is allowed. */
export function isValidUsername(username: string): boolean {
  const trimmed = username.trim();
  return trimmed.length >= USERNAME_MIN_LENGTH && trimmed.length <= USERNAME_MAX_LENGTH;
}

/** Prefill suggestion: use the email as-is (usernames may include @, ., etc.). */
export function suggestUsernameFromEmail(email: string): string {
  return email.trim().slice(0, USERNAME_MAX_LENGTH);
}
