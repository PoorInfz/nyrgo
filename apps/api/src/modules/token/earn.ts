import type { PoolClient } from 'pg';
import { DEFAULT_CONFIG, canUseWeb3, type AgeBand } from '@nyrgo/shared';
import type { Db } from '../../db.js';
import { PLAYER_TZ_SQL } from '../progress/rewards.js';

type Q = Db | PoolClient;

/** Start of the player's local day, as SQL with the player id as `$1`. */
const localDayStart = () =>
  `(date_trunc('day', now() AT TIME ZONE ${PLAYER_TZ_SQL}) AT TIME ZONE ${PLAYER_TZ_SQL})`;

/** NYRGO earned today (player's local day). */
export async function earnedToday(q: Q, userId: string): Promise<number> {
  const { rows } = await q.query<{ n: string }>(
    `SELECT coalesce(sum(amount), 0) AS n FROM token_ledger
      WHERE user_id = $1 AND amount > 0 AND reason <> 'claim_refund'
        AND created_at >= ${localDayStart()}`,
    [userId],
  );
  return Number(rows[0]!.n);
}

/**
 * Credits NYRGO for a rewarded game event (inside the event's transaction). Only adults earn;
 * the player's daily cap and the game's daily budget both apply. Returns what was credited.
 */
export async function earnToken(
  c: PoolClient,
  userId: string,
  reason: string,
  refId: string,
): Promise<number> {
  const cfg = DEFAULT_CONFIG.token;
  const want = cfg.rewards[reason] ?? 0;
  if (want <= 0) return 0;
  const { rows: who } = await c.query<{ age_band: AgeBand }>(
    `SELECT age_band FROM users WHERE id = $1`,
    [userId],
  );
  if (!who[0] || !canUseWeb3(who[0].age_band)) return 0;

  const mine = Math.max(0, cfg.dailyCapPerPlayer - (await earnedToday(c, userId)));
  if (mine === 0) return 0;
  // the game-wide budget is shared: take turns on it
  await c.query(`SELECT pg_advisory_xact_lock(hashtext('nyrgo-token-budget'))`);
  const { rows } = await c.query<{ n: string }>(
    `SELECT coalesce(sum(amount), 0) AS n FROM token_ledger
      WHERE amount > 0 AND reason <> 'claim_refund'
        AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
  );
  const game = Math.max(0, cfg.dailyCapGlobal - Number(rows[0]!.n));
  const amount = Math.min(want, mine, game);
  if (amount <= 0) return 0;
  await c.query(
    `INSERT INTO token_ledger (user_id, amount, reason, ref_id) VALUES ($1, $2, $3, $4)`,
    [userId, amount, reason, refId],
  );
  return amount;
}

/** Unclaimed NYRGO. */
export async function tokenBalance(q: Q, userId: string): Promise<number> {
  const { rows } = await q.query<{ n: string }>(
    `SELECT coalesce(sum(amount), 0) AS n FROM token_ledger WHERE user_id = $1`,
    [userId],
  );
  return Number(rows[0]!.n);
}
