/** Valid signup body for API tests (13+ age gate). */
export function registerBody(input: {
  email: string;
  username: string;
  password?: string;
  birthYear?: number;
}) {
  return {
    email: input.email,
    username: input.username,
    password: input.password ?? "correct-horse-battery",
    birthYear: input.birthYear ?? 1995,
    ageConfirmed: true as const,
  };
}
