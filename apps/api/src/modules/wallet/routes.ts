import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import { canUseWeb3, type AgeBand } from '@nyrgo/shared';
import type { AppConfig } from '../../config.js';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';
import { isNearAccountId, parsePublicKey, verifyNep413 } from './nep413.js';
import { RpcUnavailable, type NearRpc } from './rpc.js';

/**
 * Linking a NEAR account (Phase 3). The player's wallet signs a one-time message (NEP-413); the
 * API checks the signature and asks a NEAR RPC node that the signing key is a full-access key of
 * that account. Nothing secret ever reaches the server: no seed phrase, no private key, no
 * transaction. Adults only, testnet only until the Phase 6 gates.
 */

const LinkBody = Type.Object(
  {
    accountId: Type.String({ minLength: 2, maxLength: 64 }),
    publicKey: Type.String({ minLength: 10, maxLength: 120 }),
    signature: Type.String({ minLength: 40, maxLength: 200 }),
    nonce: Type.String({ minLength: 40, maxLength: 48 }),
  },
  { additionalProperties: false },
);

interface WalletView {
  accountId: string;
  network: string;
  linkedAt: string;
}

export async function walletRoutes(
  app: FastifyInstance,
  { db, config, rpc }: { db: Db; config: AppConfig; rpc: NearRpc },
) {
  const near = config.near;

  async function requireAdult(userId: string) {
    const { rows } = await db.query<{ age_band: AgeBand }>(
      `SELECT age_band FROM users WHERE id = $1`,
      [userId],
    );
    if (!rows[0] || !canUseWeb3(rows[0].age_band)) {
      throw new HttpProblem('web3_restricted', 'Wallets are for players aged 18 or over');
    }
  }

  async function current(userId: string): Promise<WalletView | null> {
    const { rows } = await db.query<{ account_id: string; network: string; linked_at: Date }>(
      `SELECT account_id, network, linked_at FROM wallet_links WHERE user_id = $1`,
      [userId],
    );
    const r = rows[0];
    return r
      ? { accountId: r.account_id, network: r.network, linkedAt: r.linked_at.toISOString() }
      : null;
  }

  app.get('/v1/me/wallet', async (req) => {
    const auth = requireAuth(req);
    await requireAdult(auth.userId);
    return { network: near.network, wallet: await current(auth.userId) };
  });

  /** A fresh message for the wallet to sign; valid for a few minutes, once. */
  app.post(
    '/v1/me/wallet/challenge',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      await requireAdult(auth.userId);
      const nonce = randomBytes(32);
      const code = nonce.subarray(0, 4).toString('hex');
      const message = `nyrGo!: vincular esta cuenta de NEAR a tu jugador (${near.network}). Código ${code}.`;
      const { rows } = await db.query<{ expires_at: Date }>(
        `INSERT INTO wallet_challenges (user_id, nonce, message, network, expires_at)
         VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5)) RETURNING expires_at`,
        [auth.userId, nonce, message, near.network, near.challengeTtlMin],
      );
      return {
        message,
        recipient: near.recipient,
        nonce: nonce.toString('base64'),
        network: near.network,
        expiresAt: rows[0]!.expires_at.toISOString(),
      };
    },
  );

  app.post<{ Body: Static<typeof LinkBody> }>(
    '/v1/me/wallet/link',
    { schema: { body: LinkBody }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      await requireAdult(auth.userId);
      const { accountId, publicKey, signature } = req.body;
      if (!isNearAccountId(accountId)) {
        throw new HttpProblem('validation_failed', 'Not a NEAR account id');
      }
      if (!parsePublicKey(publicKey)) {
        throw new HttpProblem('wallet_signature_invalid', 'Only ed25519 keys are supported');
      }
      const nonce = Buffer.from(req.body.nonce, 'base64');
      if (nonce.length !== 32) throw new HttpProblem('wallet_challenge_invalid', 'Bad nonce');

      // 1. The challenge: this player's, unused, not expired.
      const { rows } = await db.query<{ id: string; message: string; network: string }>(
        `SELECT id, message, network FROM wallet_challenges
          WHERE nonce = $1 AND user_id = $2 AND used_at IS NULL AND expires_at > now()`,
        [nonce, auth.userId],
      );
      const challenge = rows[0];
      if (!challenge) {
        throw new HttpProblem(
          'wallet_challenge_invalid',
          'This signing request has expired or was already used; start again',
        );
      }

      // 2. The signature, over exactly the message, nonce and recipient we issued.
      const ok = verifyNep413(
        { message: challenge.message, nonce, recipient: near.recipient },
        publicKey,
        signature,
      );
      if (!ok) throw new HttpProblem('wallet_signature_invalid', 'The signature does not match');

      // 3. The key belongs to the account, with full access.
      let access;
      try {
        access = await rpc.accessKey(accountId, publicKey);
      } catch (e) {
        if (e instanceof RpcUnavailable) {
          req.log.warn({ err: e.message }, 'near rpc unavailable');
          throw new HttpProblem('wallet_unavailable', 'NEAR could not be reached; try again');
        }
        throw e;
      }
      if (access !== 'full') {
        throw new HttpProblem(
          'wallet_key_not_full_access',
          access === 'missing'
            ? 'That key does not belong to this account'
            : 'Sign with the account itself, not an app key',
        );
      }

      // 4. Consume the challenge and link, atomically. Proof of the key wins: an account linked
      //    to another player (say, a lost guest account) moves to whoever proves it now.
      return withTx(db, async (c) => {
        const used = await c.query(
          `UPDATE wallet_challenges SET used_at = now()
            WHERE id = $1 AND used_at IS NULL AND expires_at > now()`,
          [challenge.id],
        );
        if (used.rowCount === 0) {
          throw new HttpProblem(
            'wallet_challenge_invalid',
            'This signing request was already used',
          );
        }
        await c.query(
          `DELETE FROM wallet_links WHERE network = $1 AND account_id = $2 AND user_id <> $3`,
          [challenge.network, accountId, auth.userId],
        );
        const { rows: linked } = await c.query<{ linked_at: Date }>(
          `INSERT INTO wallet_links (user_id, network, account_id, public_key)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE
             SET network = EXCLUDED.network, account_id = EXCLUDED.account_id,
                 public_key = EXCLUDED.public_key, linked_at = now()
           RETURNING linked_at`,
          [auth.userId, challenge.network, accountId, publicKey],
        );
        return {
          wallet: {
            accountId,
            network: challenge.network,
            linkedAt: linked[0]!.linked_at.toISOString(),
          },
        };
      });
    },
  );

  app.delete('/v1/me/wallet', async (req, reply) => {
    const auth = requireAuth(req);
    // unlinking is always allowed, whatever the age band
    await db.query(`DELETE FROM wallet_links WHERE user_id = $1`, [auth.userId]);
    return reply.code(204).send();
  });
}
