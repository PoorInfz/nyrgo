import { DEFAULT_CONFIG } from '@nyrgo/shared';
import type { Db } from '../../db.js';
import { ChainNoAnswer, type TipChain } from './chain.js';

/**
 * Sets today's budget once per UTC day from the treasury: a small share of what is in it beyond
 * the reserve, so trading fees pay tips steadily and the pot never empties in a day.
 */
export async function ensureTodaysPool(db: Db, chain: TipChain): Promise<boolean> {
  const exists = await db.query(
    `SELECT 1 FROM tips_pool WHERE day = (now() AT TIME ZONE 'UTC')::date`,
  );
  if (exists.rowCount) return false;
  const cfg = DEFAULT_CONFIG.tips;
  const balance = await chain.balance();
  const reserve = BigInt(cfg.poolReserveMilliNear) * 10n ** 21n;
  const spare = balance > reserve ? balance - reserve : 0n;
  const budget = (spare * BigInt(Math.round(cfg.poolDailyShare * 10_000))) / 10_000n;
  const res = await db.query(
    `INSERT INTO tips_pool (day, treasury_yocto, budget_yocto)
     VALUES ((now() AT TIME ZONE 'UTC')::date, $1, $2) ON CONFLICT DO NOTHING`,
    [balance.toString(), budget.toString()],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Sends pending tips, one at a time. A refused transfer gives its budget back; a transfer with
 * no answer is marked `unknown` for a person to check, so nothing is ever paid twice.
 */
export async function sendTips(
  db: Db,
  chain: TipChain,
  max = 20,
): Promise<{ sent: number; failed: number; unknown: number }> {
  const out = { sent: 0, failed: 0, unknown: 0 };
  for (let i = 0; i < max; i++) {
    const { rows } = await db.query<{
      id: string;
      account_id: string;
      amount: string;
      day: string;
    }>(
      `UPDATE tips SET status = 'sending'
        WHERE id = (SELECT id FROM tips WHERE status = 'pending'
                     ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id, account_id, amount_yocto::text AS amount,
                  (created_at AT TIME ZONE 'UTC')::date::text AS day`,
    );
    const tip = rows[0];
    if (!tip) break;
    try {
      const { txHash } = await chain.send(tip.account_id, BigInt(tip.amount));
      await db.query(
        `UPDATE tips SET status = 'sent', tx_hash = $2, finished_at = now() WHERE id = $1`,
        [tip.id, txHash],
      );
      out.sent++;
    } catch (e) {
      const error = (e as Error).message.slice(0, 500);
      if (e instanceof ChainNoAnswer) {
        await db.query(
          `UPDATE tips SET status = 'unknown', error = $2, finished_at = now() WHERE id = $1`,
          [tip.id, error],
        );
        out.unknown++;
      } else {
        await db.query(
          `UPDATE tips SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`,
          [tip.id, error],
        );
        await db.query(
          `UPDATE tips_pool SET spent_yocto = greatest(0, spent_yocto - $2) WHERE day = $1::date`,
          [tip.day, tip.amount],
        );
        out.failed++;
      }
    }
  }
  return out;
}

/** The job: today's budget, then the queue. */
export async function runTips(db: Db, chain: TipChain | null) {
  if (!chain) return { skipped: 'tips are off' };
  const pool = await ensureTodaysPool(db, chain).catch(() => false);
  const sent = await sendTips(db, chain);
  return { poolSet: pool, ...sent };
}
