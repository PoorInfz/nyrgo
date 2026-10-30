import type { PoolClient } from 'pg';
import { DEFAULT_CONFIG, canUseWeb3, type AgeBand } from '@nyrgo/shared';
import { PLAYER_TZ_SQL } from '../progress/rewards.js';
import { isAttested } from '../attest/routes.js';

/** A tip in yoctoNEAR. */
export const tipYocto = () => BigInt(DEFAULT_CONFIG.tips.amountMilliNear) * 10n ** 21n;

export type NoTip =
  | 'tips_off'
  | 'not_adult'
  | 'no_wallet'
  | 'under_review'
  | 'daily_limit'
  | 'too_soon'
  | 'too_close'
  | 'pool_empty'
  | 'not_verified';

export interface TipAward {
  id: string;
  amountNear: string;
  status: 'pending';
}

/** "0.005" for 5 milliNEAR. */
export const nearString = (yocto: bigint) => {
  const s = (yocto / 10n ** 18n).toString().padStart(7, '0'); // micro-NEAR
  const whole = s.slice(0, -6);
  const frac = s.slice(-6).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
};

/**
 * Called inside a successful catch's transaction: grants a NEAR tip when the player walked to
 * this creature (far enough from the last tip, long enough after it), within the daily limits
 * and today's budget. The payout job sends it; nothing here waits on the chain.
 */
export async function awardTip(
  c: PoolClient,
  opts: { enabled: boolean; network: string; requireAttestation?: boolean },
  userId: string,
  spawnId: string,
  captureId: string,
): Promise<{ tip: TipAward | null; reason: NoTip | null }> {
  const cfg = DEFAULT_CONFIG.tips;
  const none = (reason: NoTip) => ({ tip: null, reason });
  if (!opts.enabled) return none('tips_off');

  const { rows } = await c.query<{
    age_band: AgeBand;
    account_id: string | null;
    risk: number;
    review: boolean;
    today: number;
    minutes_since: number | null;
    metres_from_last: number | null;
  }>(
    `SELECT u.age_band, w.account_id, u.risk_level AS risk,
            EXISTS (SELECT 1 FROM review_cases r WHERE r.user_id = u.id AND r.status = 'open') AS review,
            (SELECT count(*)::int FROM tips t
              WHERE t.user_id = u.id AND t.status <> 'failed'
                AND t.created_at >= (date_trunc('day', now() AT TIME ZONE ${PLAYER_TZ_SQL}) AT TIME ZONE ${PLAYER_TZ_SQL})
            ) AS today,
            last.minutes_since, last.metres_from_last
       FROM users u
       LEFT JOIN wallet_links w ON w.user_id = u.id AND w.network = $2
       LEFT JOIN LATERAL (
         SELECT extract(epoch FROM now() - t.created_at) / 60 AS minutes_since,
                ST_Distance(t.geom, (SELECT geom FROM spawns WHERE id = $3)) AS metres_from_last
           FROM tips t WHERE t.user_id = u.id AND t.status <> 'failed'
          ORDER BY t.created_at DESC LIMIT 1
       ) last ON true
      WHERE u.id = $1`,
    [userId, opts.network, spawnId],
  );
  const u = rows[0];
  if (!u || !canUseWeb3(u.age_band)) return none('not_adult');
  if (!u.account_id) return none('no_wallet');
  if (u.review || u.risk >= cfg.maxRisk) return none('under_review');
  if (opts.requireAttestation && !(await isAttested(c, userId))) return none('not_verified');
  if (u.today >= cfg.maxPerDay) return none('daily_limit');
  if (u.minutes_since !== null && u.minutes_since < cfg.minIntervalMin) return none('too_soon');
  if (u.metres_from_last !== null && u.metres_from_last < cfg.minDistanceM) {
    return none('too_close');
  }

  // take it out of today's budget (set by the payout job from the treasury's balance)
  const amount = tipYocto();
  const budget = await c.query(
    `UPDATE tips_pool SET spent_yocto = spent_yocto + $1
      WHERE day = (now() AT TIME ZONE 'UTC')::date AND spent_yocto + $1 <= budget_yocto`,
    [amount.toString()],
  );
  if (budget.rowCount === 0) return none('pool_empty');

  const { rows: made } = await c.query<{ id: string }>(
    `INSERT INTO tips (user_id, network, account_id, amount_yocto, geom, capture_id)
     SELECT $1, $2, $3, $4, geom, $6 FROM spawns WHERE id = $5
     RETURNING id`,
    [userId, opts.network, u.account_id, amount.toString(), spawnId, captureId],
  );
  return {
    tip: { id: made[0]!.id, amountNear: nearString(amount), status: 'pending' },
    reason: null,
  };
}
