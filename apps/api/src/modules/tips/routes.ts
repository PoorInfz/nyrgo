import type { FastifyInstance } from 'fastify';
import { DEFAULT_CONFIG } from '@nyrgo/shared';
import type { Db } from '../../db.js';
import { requireAuth } from '../auth/sessions.js';
import { PLAYER_TZ_SQL } from '../progress/rewards.js';
import { nearString } from './award.js';

/** NEAR tips: the player's own, and the public state of the reward pot. */
export async function tipsRoutes(
  app: FastifyInstance,
  { db, network, treasury }: { db: Db; network: string; treasury: string | null },
) {
  const cfg = DEFAULT_CONFIG.tips;
  const rules = {
    amountNear: nearString(BigInt(cfg.amountMilliNear) * 10n ** 21n),
    maxPerDay: cfg.maxPerDay,
    minIntervalMin: cfg.minIntervalMin,
    minDistanceM: cfg.minDistanceM,
  };

  /** Public: where rewards come from and what today may still pay. */
  app.get('/v1/rewards', async () => {
    const { rows } = await db.query<{ budget: string; spent: string; treasury: string }>(
      `SELECT budget_yocto::text AS budget, spent_yocto::text AS spent, treasury_yocto::text AS treasury
         FROM tips_pool WHERE day = (now() AT TIME ZONE 'UTC')::date`,
    );
    const { rows: paid } = await db.query<{ n: string; total: string }>(
      `SELECT count(*) AS n, coalesce(sum(amount_yocto), 0)::text AS total FROM tips WHERE status = 'sent'`,
    );
    const p = rows[0];
    return {
      network,
      treasury,
      enabled: treasury !== null,
      rules,
      today: p
        ? {
            budgetNear: nearString(BigInt(p.budget)),
            spentNear: nearString(BigInt(p.spent)),
            treasuryNear: nearString(BigInt(p.treasury)),
          }
        : null,
      tipsPaid: Number(paid[0]!.n),
      totalPaidNear: nearString(BigInt(paid[0]!.total)),
    };
  });

  app.get('/v1/me/tips', async (req) => {
    const auth = requireAuth(req);
    const { rows } = await db.query<{
      id: string;
      amount: string;
      status: string;
      tx_hash: string | null;
      created_at: Date;
    }>(
      `SELECT id, amount_yocto::text AS amount, status, tx_hash, created_at FROM tips
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [auth.userId],
    );
    const { rows: today } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tips
        WHERE user_id = $1 AND status <> 'failed'
          AND created_at >= (date_trunc('day', now() AT TIME ZONE ${PLAYER_TZ_SQL}) AT TIME ZONE ${PLAYER_TZ_SQL})`,
      [auth.userId],
    );
    const last = rows.find((r) => r.status !== 'failed');
    const nextAt = last ? new Date(last.created_at.getTime() + cfg.minIntervalMin * 60_000) : null;
    return {
      enabled: treasury !== null,
      network,
      rules,
      today: today[0]!.n,
      nextTipAt: nextAt && nextAt.getTime() > Date.now() ? nextAt.toISOString() : null,
      tips: rows.map((r) => ({
        id: r.id,
        amountNear: nearString(BigInt(r.amount)),
        status: r.status,
        txHash: r.tx_hash,
        createdAt: r.created_at.toISOString(),
      })),
    };
  });
}
