import type { PoolClient } from 'pg';
import { DEFAULT_CONFIG } from '@nyrgo/shared';
import type { Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { assess, type Assessment, type Fix } from './plausibility.js';
import { recordSignals } from './risk.js';

type Q = Db | PoolClient;

export interface MovementState {
  speedKmh: number | null;
  interactable: boolean;
  /** Why interactions are paused, if they are. */
  reason: 'speed' | 'teleport_cooldown' | null;
  lockedUntil: string | null;
}

export interface SampleInput {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  clientTs?: number | undefined;
}

/** How fresh the last fix must be for an interaction to be allowed at all. */
export const FIX_MAX_AGE_S = 60;

/**
 * Checks a new fix against the previous one, stores it, records any signals and updates the
 * player's movement state. Returns the stored sample's H3 cell and the movement verdict.
 */
export async function recordFix(
  q: Q,
  userId: string,
  input: SampleInput,
): Promise<{ cell: string; movement: MovementState; assessment: Assessment }> {
  const { world, antiCheat: ac } = DEFAULT_CONFIG;

  const { rows: recent } = await q.query<{
    lat: number | null;
    lng: number | null;
    accuracy_m: number | null;
    at: Date;
  }>(
    `SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng, accuracy_m, created_at AS at
       FROM location_samples WHERE user_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [userId, ac.constantAccuracyRun - 1],
  );
  const last = recent[0];
  const prev: Fix | null =
    last && last.lat !== null && last.lng !== null
      ? { lat: last.lat, lng: last.lng, accuracy: last.accuracy_m ?? 0, at: last.at.getTime() }
      : null;
  const accuracies = recent
    .map((r) => r.accuracy_m)
    .filter((a): a is number => a !== null)
    .reverse();

  const { rows: nowRows } = await q.query<{ now: Date }>(`SELECT now() AS now`);
  const now = nowRows[0]!.now.getTime();
  const result = assess(
    prev,
    { lat: input.lat, lng: input.lng, accuracy: input.accuracy, at: now, clientTs: input.clientTs },
    accuracies,
    ac,
    world,
  );

  const point = `ST_SetSRID(ST_MakePoint($2, $1), 4326)`;
  const { rows: cellRows } = await q.query<{ cell: string }>(
    `INSERT INTO location_samples (user_id, h3_r9, geom, accuracy_m, speed_ms)
     VALUES ($3, h3_lat_lng_to_cell(${point}, $4), ${point}::geography, $5, $6)
     RETURNING h3_r9::text AS cell`,
    [input.lat, input.lng, userId, world.spawnH3Resolution, input.accuracy, input.speed],
  );

  const lockMin = result.verdict === 'teleport' ? ac.teleportLockMin : null;
  const { rows: state } = await q.query<{ locked_until: Date | null }>(
    `INSERT INTO player_movement (user_id, last_fix_at, last_speed_kmh, locked_until, lock_reason, updated_at)
     VALUES ($1, now(), $2,
             CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(mins => $3::int) END,
             CASE WHEN $3::int IS NULL THEN NULL ELSE 'teleport' END, now())
     ON CONFLICT (user_id) DO UPDATE SET
       last_fix_at = now(),
       last_speed_kmh = EXCLUDED.last_speed_kmh,
       locked_until = CASE WHEN $3::int IS NULL THEN player_movement.locked_until
                           ELSE EXCLUDED.locked_until END,
       lock_reason = CASE WHEN $3::int IS NULL THEN player_movement.lock_reason
                          ELSE EXCLUDED.lock_reason END,
       updated_at = now()
     RETURNING locked_until`,
    [userId, result.speedKmh, lockMin],
  );

  if (result.signals.length > 0) await recordSignals(q, userId, result.signals);

  const lockedUntil = state[0]?.locked_until ?? null;
  const locked = lockedUntil !== null && lockedUntil.getTime() > now;
  return {
    cell: cellRows[0]!.cell,
    assessment: result,
    movement: {
      speedKmh: result.speedKmh === null ? null : Math.round(result.speedKmh * 10) / 10,
      interactable: !locked && result.verdict === 'ok',
      reason: locked ? 'teleport_cooldown' : result.verdict === 'too_fast' ? 'speed' : null,
      lockedUntil: locked ? lockedUntil!.toISOString() : null,
    },
  };
}

/**
 * Guard for every gameplay interaction (captures, POI rewards, battles): a recent fix, at a
 * walking pace, with no active cooldown. Throws a problem the client can explain.
 */
export async function requireInteractable(q: Q, userId: string): Promise<void> {
  const { world } = DEFAULT_CONFIG;
  const { rows } = await q.query<{
    fresh: boolean;
    speed: number | null;
    locked: boolean;
  }>(
    `SELECT last_fix_at > now() - make_interval(secs => $2) AS fresh,
            last_speed_kmh AS speed,
            COALESCE(locked_until > now(), false) AS locked
       FROM player_movement WHERE user_id = $1`,
    [userId, FIX_MAX_AGE_S],
  );
  const m = rows[0];
  if (!m || !m.fresh) throw new HttpProblem('location_required', 'Need a recent location fix');
  if (m.locked) throw new HttpProblem('cooldown_active', 'Interactions are paused for a moment');
  if (m.speed !== null && m.speed > world.maxRewardSpeedKmh) {
    throw new HttpProblem('speed_implausible', 'Moving too fast to interact');
  }
}
