import type { AntiCheatConfig, WorldConfig } from '@nyrgo/shared';

/**
 * Movement plausibility. Pure: given the previous fix, the new one and recent history, it says
 * how fast the player moved and which weak signals to record. It never decides a punishment.
 *
 * Times are SERVER receive times; the client's own timestamp is only compared for clock skew,
 * because a client can send whatever timestamp it likes.
 */

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  /** Server receive time, ms since epoch. */
  at: number;
}

export interface Incoming extends Fix {
  /** Client-reported time, ms since epoch, if sent. */
  clientTs?: number | undefined;
}

export type SignalKind = 'teleport' | 'impossible_speed' | 'clock_skew' | 'constant_accuracy';

export interface Signal {
  kind: SignalKind;
  score: number;
  detail: Record<string, number>;
}

export type Verdict = 'ok' | 'too_fast' | 'teleport';

export interface Assessment {
  distanceM: number;
  /** Distance left after subtracting both accuracy radii: movement we are sure of. */
  certainM: number;
  dtS: number;
  /** Null when the fixes are too close in time to give a meaningful speed. */
  speedKmh: number | null;
  verdict: Verdict;
  signals: Signal[];
}

/** Faster than any airliner: no honest device reports this. */
export const IMPOSSIBLE_SPEED_KMH = 1200;
const IMPOSSIBLE_MIN_DISTANCE_M = 2_000;

const SCORES: Record<SignalKind, number> = {
  // A jump can be honest (a train, a long tunnel, GPS reacquiring), so it weighs little alone.
  teleport: 15,
  impossible_speed: 30,
  clock_skew: 3,
  constant_accuracy: 5,
};

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function assess(
  prev: Fix | null,
  cur: Incoming,
  recentAccuracies: number[],
  ac: AntiCheatConfig,
  world: WorldConfig,
): Assessment {
  const signals: Signal[] = [];
  const add = (kind: SignalKind, detail: Record<string, number>) =>
    signals.push({ kind, score: SCORES[kind], detail });

  if (cur.clientTs !== undefined) {
    const skewS = Math.abs(cur.clientTs - cur.at) / 1000;
    if (skewS > ac.clockSkewToleranceS) add('clock_skew', { skewS: Math.round(skewS) });
  }

  const run = [...recentAccuracies, cur.accuracy].slice(-ac.constantAccuracyRun);
  if (
    run.length >= ac.constantAccuracyRun &&
    cur.accuracy <= 10 &&
    run.every((a) => a === cur.accuracy)
  ) {
    add('constant_accuracy', { accuracy: cur.accuracy, run: run.length });
  }

  if (!prev) {
    return { distanceM: 0, certainM: 0, dtS: 0, speedKmh: null, verdict: 'ok', signals };
  }

  const distanceM = haversineM(prev, cur);
  const certainM = Math.max(0, distanceM - prev.accuracy - cur.accuracy);
  const dtS = Math.max(0, (cur.at - prev.at) / 1000);

  let speedKmh: number | null = null;
  if (dtS >= ac.minSpeedIntervalS) {
    speedKmh = (certainM / dtS) * 3.6;
  } else if (certainM >= ac.teleportMinDistanceM) {
    // A long jump inside a couple of seconds: treat the interval as the minimum one.
    speedKmh = (certainM / ac.minSpeedIntervalS) * 3.6;
  }

  let verdict: Verdict = 'ok';
  if (speedKmh !== null && certainM >= ac.teleportMinDistanceM && speedKmh > ac.teleportSpeedKmh) {
    verdict = 'teleport';
    if (speedKmh > IMPOSSIBLE_SPEED_KMH && certainM >= IMPOSSIBLE_MIN_DISTANCE_M) {
      add('impossible_speed', { speedKmh: Math.round(speedKmh), distanceM: Math.round(certainM) });
    } else {
      add('teleport', { speedKmh: Math.round(speedKmh), distanceM: Math.round(certainM) });
    }
  } else if (speedKmh !== null && speedKmh > world.maxRewardSpeedKmh) {
    // Driving or riding is legitimate travel; it only pauses interactions, with no signal.
    verdict = 'too_fast';
  }

  return { distanceM, certainM, dtS, speedKmh, verdict, signals };
}
