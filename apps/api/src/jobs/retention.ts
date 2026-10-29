import { DEFAULT_CONFIG } from '@nyrgo/shared';
import type { Db } from '../db.js';

/**
 * Data retention. Each step is one bounded statement so a large backlog is worked off over
 * several runs instead of one long lock. The numbers come from config (privacy commitments
 * shown to players: exact positions 24 h, location history 30 days).
 */

export const RISK_SIGNAL_RETENTION_D = 90;
/** Expired or revoked sessions and used links are kept a little while for support questions. */
export const AUTH_GRACE_D = 7;
const BATCH = 10_000;

export interface RetentionReport {
  preciseLocationsCleared: number;
  locationSamplesDeleted: number;
  sessionsDeleted: number;
  magicLinksDeleted: number;
  idempotencyKeysDeleted: number;
  riskSignalsDeleted: number;
}

async function batched(db: Db, sql: string, params: unknown[]): Promise<number> {
  let total = 0;
  for (;;) {
    const res = await db.query(sql, params);
    const n = res.rowCount ?? 0;
    total += n;
    if (n < BATCH) return total;
  }
}

export async function runRetention(db: Db): Promise<RetentionReport> {
  const w = DEFAULT_CONFIG.world;
  return {
    preciseLocationsCleared: await batched(
      db,
      `UPDATE location_samples SET geom = NULL
        WHERE id IN (SELECT id FROM location_samples
                      WHERE geom IS NOT NULL AND created_at < now() - make_interval(hours => $1)
                      LIMIT ${BATCH})`,
      [w.preciseLocationRetentionH],
    ),
    locationSamplesDeleted: await batched(
      db,
      `DELETE FROM location_samples
        WHERE id IN (SELECT id FROM location_samples
                      WHERE created_at < now() - make_interval(days => $1) LIMIT ${BATCH})`,
      [w.locationSampleRetentionD],
    ),
    sessionsDeleted: await batched(
      db,
      `DELETE FROM sessions WHERE id IN (
         SELECT id FROM sessions
          WHERE expires_at < now() - make_interval(days => $1)
             OR revoked_at < now() - make_interval(days => $1)
          LIMIT ${BATCH})`,
      [AUTH_GRACE_D],
    ),
    magicLinksDeleted: await batched(
      db,
      `DELETE FROM magic_links WHERE id IN (
         SELECT id FROM magic_links WHERE expires_at < now() - interval '1 day' LIMIT ${BATCH})`,
      [],
    ),
    idempotencyKeysDeleted: await batched(
      db,
      `DELETE FROM idempotency_keys WHERE (user_id, key) IN (
         SELECT user_id, key FROM idempotency_keys WHERE expires_at < now() LIMIT ${BATCH})`,
      [],
    ),
    riskSignalsDeleted: await batched(
      db,
      `DELETE FROM risk_signals WHERE id IN (
         SELECT id FROM risk_signals
          WHERE created_at < now() - make_interval(days => $1) LIMIT ${BATCH})`,
      [RISK_SIGNAL_RETENTION_D],
    ),
  };
}
