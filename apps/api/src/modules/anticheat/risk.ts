import type { PoolClient } from 'pg';
import { DEFAULT_CONFIG } from '@nyrgo/shared';
import type { Db } from '../../db.js';
import type { Signal } from './plausibility.js';

type Q = Db | PoolClient;

/** The same kind of signal is recorded at most once per hour per player. */
const DEDUPE_MINUTES = 60;

/**
 * Stores signals, refreshes the player's decayed risk score and opens a review case when it
 * crosses the threshold. Never restricts the account: that is a human decision.
 */
export async function recordSignals(q: Q, userId: string, signals: Signal[]): Promise<number> {
  const ac = DEFAULT_CONFIG.antiCheat;
  let stored = 0;
  for (const s of signals) {
    const res = await q.query(
      `INSERT INTO risk_signals (user_id, kind, score, detail)
       SELECT $1, $2, $3, $4
        WHERE NOT EXISTS (
          SELECT 1 FROM risk_signals
           WHERE user_id = $1 AND kind = $2
             AND created_at > now() - make_interval(mins => $5))`,
      [userId, s.kind, s.score, s.detail, DEDUPE_MINUTES],
    );
    stored += res.rowCount ?? 0;
  }
  if (stored === 0) return currentRisk(q, userId);

  const { rows } = await q.query<{ risk: number }>(
    `UPDATE users SET risk_level = risk_score($1, $2) WHERE id = $1 RETURNING risk_level AS risk`,
    [userId, ac.riskHalfLifeH],
  );
  const risk = rows[0]?.risk ?? 0;
  if (risk >= ac.reviewThreshold) {
    await q.query(
      `INSERT INTO review_cases (user_id, reason, risk_at_open)
       VALUES ($1, 'risk_threshold', $2)
       ON CONFLICT (user_id) WHERE status = 'open' DO NOTHING`,
      [userId, risk],
    );
  }
  return risk;
}

async function currentRisk(q: Q, userId: string): Promise<number> {
  const { rows } = await q.query<{ r: number }>(`SELECT risk_level AS r FROM users WHERE id = $1`, [
    userId,
  ]);
  return rows[0]?.r ?? 0;
}

/** Nightly: let old signals fade for everyone who still has a score. */
export async function decayAllRisk(db: Db): Promise<number> {
  const res = await db.query(
    `UPDATE users u SET risk_level = risk_score(u.id, $1)
      WHERE u.risk_level > 0 AND u.risk_level <> risk_score(u.id, $1)`,
    [DEFAULT_CONFIG.antiCheat.riskHalfLifeH],
  );
  return res.rowCount ?? 0;
}
