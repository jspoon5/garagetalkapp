export const MIN_USER_AGE = 13;

/** Simple year-of-birth gate (used at signup). */
export function meetsMinimumAge(birthYear: number, minAge = MIN_USER_AGE, now = new Date()): boolean {
  if (!Number.isInteger(birthYear)) return false;
  const currentYear = now.getUTCFullYear();
  if (birthYear < currentYear - 120 || birthYear > currentYear) return false;
  return currentYear - birthYear >= minAge;
}

export function maxBirthYearForMinAge(minAge = MIN_USER_AGE, now = new Date()): number {
  return now.getUTCFullYear() - minAge;
}
