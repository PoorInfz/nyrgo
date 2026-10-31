import { DEFAULT_CONFIG } from '@nyrgo/shared';
import { withTx, type Db } from '../db.js';
import { rollSeason } from '../modules/hub/board.js';
import { expireListings } from '../modules/hub/market.js';

/**
 * Data retention. Each step is one bounded statement so a large backlog is worked off over
 * several runs instead of one long lock. The numbers come from config (privacy commitments
 * shown to players: exact positions 24 h, location history 30 days).
 */

export const RISK_SIGNAL_RETENTION_D = 90;
/** Spawns are kept this long after they expire; their capture attempts and encounters go with them. */
export const SPAWN_RETENTION_D = 90;
/** Generation markers are only needed while their window is live. */
export const SPAWN_GENERATION_RETENTION_H = 24;
/** Expired or revoked sessions and used links are kept a little while for support questions. */
export const AUTH_GRACE_D = 7;
/** Hub chat is kept for moderation only; reports keep their own copy of the message. */
export const HUB_CHAT_RETENTION_D = 30;
const BATCH = 10_000;

export interface RetentionReport {
  preciseLocationsCleared: number;
  locationSamplesDeleted: number;
  sessionsDeleted: number;
  magicLinksDeleted: number;
  walletChallengesDeleted: number;
  idempotencyKeysDeleted: number;
  riskSignalsDeleted: number;
  spawnsDeleted: number;
  spawnGenerationsDeleted: number;
  battlesDeleted: number;
  hubChatDeleted: number;
  /** Market listings that lapsed: their items went back to the sellers. */
  listingsExpired: number;
  /** Players moved into the new arena season (their old record kept). */
  seasonRolled: number;
  /** Coarse catch marks for the website's globe, after 90 days. */
  captureMarksDeleted: number;
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
    walletChallengesDeleted: await batched(
      db,
      `DELETE FROM wallet_challenges WHERE id IN (
         SELECT id FROM wallet_challenges WHERE expires_at < now() - interval '1 day' LIMIT ${BATCH})`,
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
    spawnsDeleted: await batched(
      db,
      `DELETE FROM spawns WHERE id IN (
         SELECT id FROM spawns WHERE expires_at < now() - make_interval(days => $1) LIMIT ${BATCH})`,
      [SPAWN_RETENTION_D],
    ),
    battlesDeleted: await batched(
      db,
      `DELETE FROM battles WHERE id IN (
         SELECT id FROM battles WHERE created_at < now() - make_interval(days => $1) LIMIT ${BATCH})`,
      [SPAWN_RETENTION_D],
    ),
    listingsExpired: await withTx(db, (c) => expireListings(c)),
    seasonRolled: await rollSeason(db),
    captureMarksDeleted: await batched(
      db,
      `DELETE FROM capture_marks WHERE id IN (
         SELECT id FROM capture_marks WHERE created_at < now() - interval '90 days' LIMIT ${BATCH})`,
      [],
    ),
    hubChatDeleted: await batched(
      db,
      `DELETE FROM hub_chat WHERE id IN (
         SELECT id FROM hub_chat WHERE created_at < now() - make_interval(days => $1) LIMIT ${BATCH})`,
      [HUB_CHAT_RETENTION_D],
    ),
    spawnGenerationsDeleted: await batched(
      db,
      `DELETE FROM spawn_generations WHERE (h3_r9, window_start) IN (
         SELECT h3_r9, window_start FROM spawn_generations
          WHERE window_start < now() - make_interval(hours => $1) LIMIT ${BATCH})`,
      [SPAWN_GENERATION_RETENTION_H],
    ),
  };
}
