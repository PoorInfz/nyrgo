import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { AppConfig } from '../../config.js';
import type { Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { hashToken, looksLikeToken, newToken } from './tokens.js';

export const SESSION_COOKIE = 'nyrgo_session';

export interface AuthContext {
  userId: string;
  sessionId: string;
  sessionCreatedAt: Date;
  kind: 'guest' | 'registered';
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Null when creature NFTs are switched off. */
    nftSyncer: import('../nft/service.js').Syncer | null;
    /** Null when NEAR tips are switched off. */
    tipChain: import('../tips/chain.js').TipChain | null;
    nearRpc: import('../wallet/rpc.js').NearRpc;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
    /** Set by the admin routes' hook from a bearer token; never from a player session. */
    admin?: import('../../config.js').AdminAccount;
  }
}

type Queryable = Db | PoolClient;

export async function createSession(
  q: Queryable,
  userId: string,
  ttlDays: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const { rows } = await q.query<{ expires_at: Date }>(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3)) RETURNING expires_at`,
    [userId, hashToken(token), ttlDays],
  );
  return { token, expiresAt: rows[0]!.expires_at };
}

export async function revokeSession(q: Queryable, sessionId: string): Promise<void> {
  await q.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [
    sessionId,
  ]);
}

export function setSessionCookie(
  reply: FastifyReply,
  config: AppConfig,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax',
    path: '/',
  });
}

/** Players already counted as active today, so the day is written once per player and process. */
const seenToday = new Map<string, string>();

/** Counts the player as active today (UTC) for the playtest metrics: one row a day, no more. */
async function markActiveToday(db: Db, userId: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  if (seenToday.get(userId) === day) return;
  if (seenToday.size > 50_000) seenToday.clear();
  seenToday.set(userId, day);
  await db
    .query(`INSERT INTO player_days (user_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      userId,
      day,
    ])
    .catch(() => seenToday.delete(userId)); // metrics never block a request
}

/** Resolves the session cookie into `request.auth` (null when absent, invalid or expired). */
export function sessionLoader(db: Db) {
  return async (req: FastifyRequest): Promise<void> => {
    req.auth = null;
    const token = req.cookies[SESSION_COOKIE];
    if (!looksLikeToken(token)) return;
    const { rows } = await db.query<{
      id: string;
      user_id: string;
      created_at: Date;
      kind: 'guest' | 'registered';
    }>(
      `UPDATE sessions s SET last_seen_at = now()
         FROM users u
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
          AND u.id = s.user_id AND u.status = 'active'
       RETURNING s.id, s.user_id, s.created_at, u.kind`,
      [hashToken(token)],
    );
    const row = rows[0];
    if (row) {
      await markActiveToday(db, row.user_id);
      req.auth = {
        userId: row.user_id,
        sessionId: row.id,
        sessionCreatedAt: row.created_at,
        kind: row.kind,
      };
    }
  };
}

export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw new HttpProblem('unauthenticated', 'Sign in required');
  return req.auth;
}
