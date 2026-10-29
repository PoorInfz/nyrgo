import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { HttpProblem } from './problem.js';

/** Replayed responses are kept for a day; after that the same key starts a new action. */
export const IDEMPOTENCY_TTL_H = 24;

const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

export function readIdempotencyKey(header: string | string[] | undefined): string {
  const key = Array.isArray(header) ? header[0] : header;
  if (!key || !KEY_RE.test(key)) {
    throw new HttpProblem(
      'validation_failed',
      'Idempotency-Key header required',
      '8–128 characters: letters, digits, "-" or "_"',
    );
  }
  return key;
}

/**
 * Runs `fn` at most once per (player, key) inside the caller's transaction. A retry with the
 * same key and body gets the stored response; the same key with a different body is refused.
 * If `fn` throws, the transaction rolls back and the key is free to be retried.
 */
export async function idempotent<T>(
  c: PoolClient,
  userId: string,
  key: string,
  endpoint: string,
  body: unknown,
  fn: () => Promise<T>,
): Promise<{ replayed: boolean; response: T }> {
  const hash = createHash('sha256')
    .update(`${endpoint}\n${JSON.stringify(body)}`)
    .digest();
  const inserted = await c.query(
    `INSERT INTO idempotency_keys (user_id, key, endpoint, request_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))
     ON CONFLICT (user_id, key) DO UPDATE
       SET endpoint = EXCLUDED.endpoint, request_hash = EXCLUDED.request_hash,
           status_code = NULL, response = NULL, expires_at = EXCLUDED.expires_at
       WHERE idempotency_keys.expires_at <= now()
     RETURNING key`,
    [userId, key, endpoint, hash, IDEMPOTENCY_TTL_H],
  );
  if (inserted.rowCount === 0) {
    // Someone used this key already (possibly a concurrent request: FOR UPDATE waits for it).
    const { rows } = await c.query<{ endpoint: string; request_hash: Buffer; response: T | null }>(
      `SELECT endpoint, request_hash, response FROM idempotency_keys
        WHERE user_id = $1 AND key = $2 FOR UPDATE`,
      [userId, key],
    );
    const row = rows[0];
    if (!row || row.endpoint !== endpoint || !row.request_hash.equals(hash)) {
      throw new HttpProblem(
        'idempotency_mismatch',
        'Idempotency-Key was used for a different request',
      );
    }
    if (row.response !== null) return { replayed: true, response: row.response };
  }
  const response = await fn();
  await c.query(
    `UPDATE idempotency_keys SET status_code = 200, response = $3 WHERE user_id = $1 AND key = $2`,
    [userId, key, JSON.stringify(response)],
  );
  return { replayed: false, response };
}
