import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import type { PoolClient } from 'pg';
import type { Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';
import { recordSignals } from '../anticheat/risk.js';
import { SCORES } from '../anticheat/plausibility.js';
import type { IntegrityDecoder } from './google.js';
import { judge } from './verdict.js';

/** A passed check counts for this long. */
export const ATTESTATION_TTL_H = 24;
const NONCE_TTL_MIN = 5;

export interface AttestConfig {
  packageName: string;
  /** Google Cloud project number the app sends with its request (public). */
  cloudProjectNumber: string;
  allowUnrecognizedApp: boolean;
}

/** Whether the player passed a device check recently. */
export async function isAttested(q: Db | PoolClient, userId: string): Promise<boolean> {
  const { rows } = await q.query(
    `SELECT 1 FROM device_attestations WHERE user_id = $1 AND ok AND expires_at > now() LIMIT 1`,
    [userId],
  );
  return (rows.length ?? 0) > 0;
}

const AttestBody = Type.Object(
  {
    nonce: Type.String({ minLength: 16, maxLength: 100 }),
    token: Type.String({ minLength: 10, maxLength: 20_000 }),
  },
  { additionalProperties: false },
);

/**
 * Device attestation for the Android app: a single-use nonce, then the app's Play Integrity
 * token, decoded by Google and judged here. Failures add risk (a modified app or device), they
 * never ban by themselves.
 */
export async function attestRoutes(
  app: FastifyInstance,
  { db, cfg, decode }: { db: Db; cfg: AttestConfig | null; decode: IntegrityDecoder | null },
) {
  app.get('/v1/me/attest', async (req) => {
    const auth = requireAuth(req);
    const { rows } = await db.query<{
      ok: boolean;
      reason: string | null;
      created_at: Date;
      expires_at: Date;
    }>(
      `SELECT ok, reason, created_at, expires_at FROM device_attestations
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [auth.userId],
    );
    const last = rows[0];
    return {
      enabled: cfg !== null,
      verified: last ? last.ok && last.expires_at.getTime() > Date.now() : false,
      until: last?.ok ? last.expires_at.toISOString() : null,
      lastReason: last && !last.ok ? last.reason : null,
    };
  });

  app.post(
    '/v1/me/attest/nonce',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      if (!cfg || !decode) throw new HttpProblem('attest_unavailable', 'Device checks are off');
      const nonce = randomBytes(24).toString('base64url');
      await db.query(`DELETE FROM attest_nonces WHERE expires_at < now()`);
      await db.query(
        `INSERT INTO attest_nonces (nonce, user_id, expires_at)
         VALUES ($1, $2, now() + make_interval(mins => $3))`,
        [nonce, auth.userId, NONCE_TTL_MIN],
      );
      return { nonce, cloudProjectNumber: cfg.cloudProjectNumber, packageName: cfg.packageName };
    },
  );

  app.post<{ Body: Static<typeof AttestBody> }>(
    '/v1/me/attest',
    { schema: { body: AttestBody }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      if (!cfg || !decode) throw new HttpProblem('attest_unavailable', 'Device checks are off');
      const used = await db.query(
        `DELETE FROM attest_nonces WHERE nonce = $1 AND user_id = $2 AND expires_at > now()`,
        [req.body.nonce, auth.userId],
      );
      if (!used.rowCount)
        throw new HttpProblem('attest_failed', 'Unknown or expired check', 'nonce');

      let payload;
      try {
        payload = await decode(cfg.packageName, req.body.token);
      } catch (e) {
        req.log.warn({ err: (e as Error).message }, 'integrity decode failed');
        throw new HttpProblem('attest_unavailable', 'Google could not check the device; try again');
      }
      const { reason, summary } = judge(payload, {
        packageName: cfg.packageName,
        nonce: req.body.nonce,
        allowUnrecognizedApp: cfg.allowUnrecognizedApp,
        nowMs: Date.now(),
      });
      await db.query(
        `INSERT INTO device_attestations (user_id, ok, verdict, reason, expires_at)
         VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))`,
        [auth.userId, reason === null, summary, reason, ATTESTATION_TTL_H],
      );
      if (reason && reason !== 'stale') {
        // a modified app or device is a strong signal, but a person decides what follows
        await recordSignals(db, auth.userId, [
          { kind: 'attestation_failed', score: SCORES.attestation_failed, detail: {} },
        ]);
      }
      if (reason)
        throw new HttpProblem('attest_failed', 'This device did not pass the check', reason);
      return {
        verified: true,
        until: new Date(Date.now() + ATTESTATION_TTL_H * 3_600_000).toISOString(),
      };
    },
  );
}
