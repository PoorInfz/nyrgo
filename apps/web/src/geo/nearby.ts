import { distanceM, type LocationFix } from './location';

/** Ask the server again after moving this far or waiting this long, whichever comes first. */
export const REQUERY_DISTANCE_M = 25;
export const REQUERY_INTERVAL_MS = 15_000;
/** Never ask more often than this, even when moving fast (server allows 30/min). */
export const MIN_INTERVAL_MS = 3_000;
/** Above this speed (m/s ≈ 30 km/h) the game shows a driving warning. */
export const DRIVING_SPEED_MS = 30 / 3.6;

export function shouldQuery(
  last: { fix: LocationFix; at: number } | null,
  fix: LocationFix,
  now: number,
): boolean {
  if (!last) return true;
  const elapsed = now - last.at;
  if (elapsed < MIN_INTERVAL_MS) return false;
  if (elapsed >= REQUERY_INTERVAL_MS) return true;
  return distanceM(last.fix, fix) >= REQUERY_DISTANCE_M;
}

export function looksLikeDriving(fix: LocationFix): boolean {
  return fix.speed !== null && fix.speed > DRIVING_SPEED_MS;
}
