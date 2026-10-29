import type { AgeBand } from './domain.js';

/**
 * Minimum age for a child to consent to data processing on their own (GDPR art. 8).
 * Spain sets 14 (LOPDGDD art. 7); 16 is the GDPR default for regions not listed.
 * Not legal advice: review per market before launching there.
 */
export const MIN_AGE_BY_REGION: Readonly<Record<string, number>> = {
  ES: 14,
};
export const DEFAULT_MIN_AGE = 16;

export function minAgeFor(region: string | null | undefined): number {
  return (region && MIN_AGE_BY_REGION[region.toUpperCase()]) || DEFAULT_MIN_AGE;
}

/**
 * Completed years of age for someone born in the given year and month, as of `now`.
 * With only a month known we assume the last day of it, so the age is never overstated.
 */
export function ageFrom(birthYear: number, birthMonth: number, now: Date): number {
  const years = now.getUTCFullYear() - birthYear;
  const thisMonth = now.getUTCMonth() + 1;
  return thisMonth > birthMonth ? years : years - 1;
}

export type AgeCheck = { ok: true; band: AgeBand } | { ok: false; minAge: number };

/**
 * Decides whether someone may create an account and which band to store.
 * Only the band is kept; the birth date itself is never stored.
 */
export function checkAge(
  birthYear: number,
  birthMonth: number,
  region: string | null | undefined,
  now: Date = new Date(),
): AgeCheck {
  const age = ageFrom(birthYear, birthMonth, now);
  const minAge = minAgeFor(region);
  if (!Number.isFinite(age) || age < minAge || age > 120) return { ok: false, minAge };
  if (age >= 18) return { ok: true, band: '18+' };
  if (age >= 16) return { ok: true, band: '16-17' };
  return { ok: true, band: '13-15' };
}
