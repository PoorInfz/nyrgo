import type { FastifyInstance } from 'fastify';
import { DEFAULT_CONFIG, canUseWeb3, type AgeBand } from '@nyrgo/shared';
import type { AppConfig } from '../../config.js';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import type { ErrorCode } from '@nyrgo/shared';
import { requireAuth } from '../auth/sessions.js';
import { ChainNoAnswer, type FtChain } from './chain.js';
import { earnedToday, tokenBalance } from './earn.js';

/**
 * NYRGO for players: what they earned and claiming it to their linked NEAR account (testnet).
 * A claim takes the balance out of the ledger first, then transfers on chain; if NEAR refuses,
 * the balance comes back; if NEAR does not answer, the claim waits for a person to check, so
 * nothing is ever paid twice.
 */
export async function tokenRoutes(
  app: FastifyInstance,
  { db, config, chain }: { db: Db; config: AppConfig; chain: FtChain | null },
) {
  const cfg = DEFAULT_CONFIG.token;
  const network = config.near.network;

  /** Why the player cannot claim right now, or null. */
  async function blocker(
    userId: string,
    balance: number,
  ): Promise<{ code: ErrorCode; until: Date | null } | null> {
    const { rows } = await db.query<{
      age_band: AgeBand;
      account_id: string | null;
      days: number;
      risk: number;
      review: boolean;
      last: Date | null;
    }>(
      `SELECT u.age_band, w.account_id,
              extract(epoch FROM now() - u.created_at) / 86400 AS days,
              u.risk_level AS risk,
              EXISTS (SELECT 1 FROM review_cases r WHERE r.user_id = u.id AND r.status = 'open') AS review,
              (SELECT max(created_at) FROM token_claims c
                WHERE c.user_id = u.id AND c.status <> 'failed') AS last
         FROM users u
         LEFT JOIN wallet_links w ON w.user_id = u.id AND w.network = $2
        WHERE u.id = $1`,
      [userId, network],
    );
    const u = rows[0];
    if (!u || !canUseWeb3(u.age_band)) return { code: 'web3_restricted', until: null };
    if (!chain) return { code: 'token_unavailable', until: null };
    if (!u.account_id) return { code: 'wallet_required', until: null };
    if (u.review || u.risk >= cfg.maxRiskToClaim) return { code: 'token_review', until: null };
    if (u.days < cfg.minAccountAgeDays) {
      const until = new Date(Date.now() + (cfg.minAccountAgeDays - u.days) * 86_400_000);
      return { code: 'token_account_too_new', until };
    }
    if (u.last && Date.now() - u.last.getTime() < cfg.claimCooldownH * 3_600_000) {
      return {
        code: 'token_cooldown',
        until: new Date(u.last.getTime() + cfg.claimCooldownH * 3_600_000),
      };
    }
    if (balance < cfg.minClaim) return { code: 'token_below_minimum', until: null };
    return null;
  }

  app.get('/v1/me/token', async (req) => {
    const auth = requireAuth(req);
    const balance = await tokenBalance(db, auth.userId);
    const block = await blocker(auth.userId, balance);
    const { rows: claims } = await db.query<{
      id: string;
      amount: string;
      status: string;
      tx_hash: string | null;
      created_at: Date;
    }>(
      `SELECT id, amount, status, tx_hash, created_at FROM token_claims
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [auth.userId],
    );
    return {
      symbol: cfg.symbol,
      enabled: chain !== null,
      contractId: chain?.contractId ?? null,
      network,
      balance,
      earnedToday: await earnedToday(db, auth.userId),
      dailyCap: cfg.dailyCapPerPlayer,
      minClaim: cfg.minClaim,
      canClaim: block === null,
      blockedBy: block?.code ?? null,
      claimableAt: block?.until?.toISOString() ?? null,
      claims: claims.map((c) => ({
        id: c.id,
        amount: Number(c.amount),
        status: c.status,
        txHash: c.tx_hash,
        createdAt: c.created_at.toISOString(),
      })),
    };
  });

  app.post(
    '/v1/me/token/claim',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      // 1. Take the whole balance out of the ledger, under a per-player lock.
      const claim = await withTx(db, async (c) => {
        await c.query(`SELECT pg_advisory_xact_lock(hashtext('nyrgo-claim:' || $1))`, [
          auth.userId,
        ]);
        const balance = await tokenBalance(c, auth.userId);
        const block = await blocker(auth.userId, balance);
        if (block) {
          throw new HttpProblem(block.code, 'Cannot claim NYRGO now', block.until?.toISOString());
        }
        const { rows } = await c.query<{ account_id: string }>(
          `SELECT account_id FROM wallet_links WHERE user_id = $1 AND network = $2`,
          [auth.userId, network],
        );
        const account = rows[0]!.account_id;
        const { rows: made } = await c.query<{ id: string }>(
          `INSERT INTO token_claims (user_id, network, account_id, amount, status)
           VALUES ($1, $2, $3, $4, 'sending') RETURNING id`,
          [auth.userId, network, account, balance],
        );
        const id = made[0]!.id;
        await c.query(
          `INSERT INTO token_ledger (user_id, amount, reason, ref_id) VALUES ($1, $2, 'claim', $3)`,
          [auth.userId, -balance, id],
        );
        return { id, account, amount: balance };
      });

      // 2. Send it on chain.
      try {
        if (!(await chain!.isRegistered(claim.account))) await chain!.register(claim.account);
        const { txHash } = await chain!.transfer(
          claim.account,
          claim.amount,
          `nyrGo! claim ${claim.id}`,
        );
        await db.query(
          `UPDATE token_claims SET status = 'sent', tx_hash = $2, finished_at = now() WHERE id = $1`,
          [claim.id, txHash],
        );
        return { ...claim, status: 'sent', txHash };
      } catch (e) {
        const error = (e as Error).message.slice(0, 500);
        req.log.warn({ err: error, claim: claim.id }, 'token claim failed');
        if (e instanceof ChainNoAnswer) {
          await db.query(
            `UPDATE token_claims SET status = 'unknown', error = $2, finished_at = now() WHERE id = $1`,
            [claim.id, error],
          );
          throw new HttpProblem(
            'token_claim_unknown',
            'NEAR did not answer; the claim will be checked before anything is sent again',
          );
        }
        await withTx(db, async (c) => {
          await c.query(
            `UPDATE token_claims SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`,
            [claim.id, error],
          );
          await c.query(
            `INSERT INTO token_ledger (user_id, amount, reason, ref_id)
             VALUES ($1, $2, 'claim_refund', $3)`,
            [auth.userId, claim.amount, claim.id],
          );
        });
        throw new HttpProblem(
          'token_claim_failed',
          'NEAR refused the transfer; your NYRGO are back',
        );
      }
    },
  );
}
