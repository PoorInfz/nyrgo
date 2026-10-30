import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { Type, type Static } from '@sinclair/typebox';
import { DEFAULT_CONFIG, nftGrade, type AgeBand, type Ivs } from '@nyrgo/shared';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';
import { PLAYER_TZ_SQL } from '../progress/rewards.js';
import { markDex } from '../capture/routes.js';

/**
 * Friends and face-to-face trades. Friends are added by code and only within the same age group
 * (adults with adults, under-18s with under-18s); there is no free text between players. A trade
 * swaps one in-game creature for another, and only when both players stand within 100 m of each
 * other: trading is something you do together, which keeps it from feeding farm accounts.
 */

const cfg = () => DEFAULT_CONFIG.social;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const adult = (b: AgeBand) => b === '18+';

const CodeBody = Type.Object(
  { code: Type.String({ minLength: 6, maxLength: 12 }) },
  { additionalProperties: false },
);
const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
const TradeBody = Type.Object(
  {
    to: Type.String({ format: 'uuid' }),
    give: Type.String({ format: 'uuid' }),
    want: Type.String({ format: 'uuid' }),
  },
  { additionalProperties: false },
);

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

async function myCode(c: Db | PoolClient, userId: string): Promise<string> {
  const { rows } = await c.query<{ friend_code: string | null }>(
    `SELECT friend_code FROM players WHERE user_id = $1`,
    [userId],
  );
  if (rows[0]?.friend_code) return rows[0].friend_code;
  for (;;) {
    const code = [...randomBytes(8)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    const res = await c
      .query(`UPDATE players SET friend_code = $2 WHERE user_id = $1 AND friend_code IS NULL`, [
        userId,
        code,
      ])
      .catch((e: { code?: string }) => {
        if (e.code === '23505') return null; // taken: draw again
        throw e;
      });
    if (res) {
      const again = await c.query<{ friend_code: string }>(
        `SELECT friend_code FROM players WHERE user_id = $1`,
        [userId],
      );
      return again.rows[0]!.friend_code;
    }
  }
}

export async function areFriends(q: Db | PoolClient, a: string, b: string): Promise<boolean> {
  const [x, y] = pair(a, b);
  const { rows } = await q.query(
    `SELECT 1 FROM friendships WHERE user_a = $1 AND user_b = $2 AND status = 'accepted'`,
    [x, y],
  );
  return rows.length > 0;
}

/** A creature that can change hands: in-game (not an NFT), not fighting, not the last one. */
async function tradeable(c: PoolClient, owner: string, id: string) {
  const { rows } = await c.query<{ ok: boolean; definition_id: string; total: number }>(
    `SELECT (ci.onchain_status IS NULL
             AND NOT EXISTS (SELECT 1 FROM battles b WHERE b.instance_id = ci.id AND b.result IS NULL)) AS ok,
            ci.definition_id,
            (SELECT count(*)::int FROM creature_instances x
              WHERE x.owner_id = $1 AND x.onchain_status IS NULL) AS total
       FROM creature_instances ci WHERE ci.id = $2 AND ci.owner_id = $1 FOR UPDATE`,
    [owner, id],
  );
  const r = rows[0];
  return r && r.ok && r.total > 1 ? r : null;
}

/**
 * Both players have sent a location in the last two minutes and stand within 100 m of each
 * other: what trades and duels need. Throws `trade_too_far` otherwise.
 */
export async function assertTogether(c: PoolClient, a: string, b: string): Promise<void> {
  const { rows } = await c.query<{ metres: number | null }>(
    `SELECT ST_Distance(a.geom, b.geom) AS metres
       FROM (SELECT geom FROM location_samples WHERE user_id = $1 AND geom IS NOT NULL
               AND created_at > now() - make_interval(secs => $3) ORDER BY created_at DESC LIMIT 1) a,
            (SELECT geom FROM location_samples WHERE user_id = $2 AND geom IS NOT NULL
               AND created_at > now() - make_interval(secs => $3) ORDER BY created_at DESC LIMIT 1) b`,
    [a, b, cfg().tradeFixMaxAgeS],
  );
  if (!rows[0] || rows[0].metres === null || rows[0].metres > cfg().tradeMaxDistanceM) {
    throw new HttpProblem('trade_too_far', 'Side by side only: both players within 100 m');
  }
}

export async function socialRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // ------------------------------------------------------------------ friends

  app.get('/v1/friends', async (req) => {
    const auth = requireAuth(req);
    const code = await myCode(db, auth.userId);
    const { rows } = await db.query<{
      id: string;
      name: string;
      level: number;
      status: string;
      incoming: boolean;
      caught: number;
    }>(
      `SELECT o.id, p.display_name AS name, p.level, f.status,
              (f.requested_by <> $1) AS incoming,
              (SELECT count(*)::int FROM dex_entries d WHERE d.user_id = o.id AND d.caught_at IS NOT NULL) AS caught
         FROM friendships f
         JOIN users o ON o.id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
         JOIN players p ON p.user_id = o.id
        WHERE (f.user_a = $1 OR f.user_b = $1) AND o.status = 'active'
        ORDER BY f.status, p.display_name`,
      [auth.userId],
    );
    return {
      code,
      friends: rows
        .filter((r) => r.status === 'accepted')
        .map(({ status: _s, incoming: _i, ...f }) => f),
      incoming: rows
        .filter((r) => r.status === 'pending' && r.incoming)
        .map((r) => ({ id: r.id, name: r.name, level: r.level })),
      outgoing: rows
        .filter((r) => r.status === 'pending' && !r.incoming)
        .map((r) => ({ id: r.id, name: r.name, level: r.level })),
    };
  });

  /** Sends a friend request to the player with this code (or accepts theirs, if they sent one). */
  app.post<{ Body: Static<typeof CodeBody> }>(
    '/v1/friends',
    { schema: { body: CodeBody }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      return withTx(db, async (c) => {
        const { rows } = await c.query<{ id: string; band: AgeBand; mine: AgeBand }>(
          `SELECT u.id, u.age_band AS band, (SELECT age_band FROM users WHERE id = $2) AS mine
             FROM players p JOIN users u ON u.id = p.user_id
            WHERE p.friend_code = upper($1) AND u.status = 'active'`,
          [req.body.code.trim(), auth.userId],
        );
        const other = rows[0];
        if (!other || other.id === auth.userId) {
          throw new HttpProblem('friend_code_unknown', 'No player has that code');
        }
        if (adult(other.band) !== adult(other.mine)) {
          throw new HttpProblem('friend_age_mismatch', 'Friends must be in the same age group');
        }
        const [a, b] = pair(auth.userId, other.id);
        const { rows: existing } = await c.query<{ status: string; requested_by: string }>(
          `SELECT status, requested_by FROM friendships WHERE user_a = $1 AND user_b = $2 FOR UPDATE`,
          [a, b],
        );
        const e = existing[0];
        if (e?.status === 'accepted') return { status: 'friends' };
        if (e && e.requested_by !== auth.userId) {
          await c.query(
            `UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE user_a = $1 AND user_b = $2`,
            [a, b],
          );
          return { status: 'friends' };
        }
        if (e) return { status: 'requested' };
        const { rows: counts } = await c.query<{ friends: number; today: number }>(
          `SELECT (SELECT count(*)::int FROM friendships WHERE (user_a = $1 OR user_b = $1)) AS friends,
                  (SELECT count(*)::int FROM friendships WHERE requested_by = $1
                     AND created_at > now() - interval '1 day') AS today`,
          [auth.userId],
        );
        if (
          counts[0]!.friends >= cfg().maxFriends ||
          counts[0]!.today >= cfg().friendRequestsPerDay
        ) {
          throw new HttpProblem('friend_limit', 'Too many friends or requests');
        }
        await c.query(
          `INSERT INTO friendships (user_a, user_b, requested_by, status) VALUES ($1, $2, $3, 'pending')`,
          [a, b, auth.userId],
        );
        return { status: 'requested' };
      });
    },
  );

  app.post<{ Params: Static<typeof IdParams> }>(
    '/v1/friends/:id/accept',
    { schema: { params: IdParams } },
    async (req) => {
      const auth = requireAuth(req);
      const [a, b] = pair(auth.userId, req.params.id);
      const res = await db.query(
        `UPDATE friendships SET status = 'accepted', accepted_at = now()
          WHERE user_a = $1 AND user_b = $2 AND status = 'pending' AND requested_by <> $3`,
        [a, b, auth.userId],
      );
      if (!res.rowCount) throw new HttpProblem('not_found', 'No such request');
      return { status: 'friends' };
    },
  );

  /** Declines a request, cancels one's own, or ends a friendship. */
  app.delete<{ Params: Static<typeof IdParams> }>(
    '/v1/friends/:id',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const auth = requireAuth(req);
      const [a, b] = pair(auth.userId, req.params.id);
      await withTx(db, async (c) => {
        await c.query(`DELETE FROM friendships WHERE user_a = $1 AND user_b = $2`, [a, b]);
        await c.query(
          `UPDATE trades SET status = 'cancelled', finished_at = now()
            WHERE status = 'pending' AND ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))`,
          [auth.userId, req.params.id],
        );
      });
      return reply.code(204).send();
    },
  );

  /** A friend's creatures that can be traded (species, level, grade; nothing personal). */
  app.get<{ Params: Static<typeof IdParams> }>(
    '/v1/friends/:id/creatures',
    { schema: { params: IdParams } },
    async (req) => {
      const auth = requireAuth(req);
      if (!(await areFriends(db, auth.userId, req.params.id))) {
        throw new HttpProblem('not_friends', 'Only friends can trade');
      }
      const { rows } = await db.query<{
        id: string;
        definition_id: string;
        level: number;
        ivs: Ivs;
      }>(
        `SELECT id, definition_id, level, ivs FROM creature_instances ci
          WHERE owner_id = $1 AND onchain_status IS NULL
            AND NOT EXISTS (SELECT 1 FROM battles b WHERE b.instance_id = ci.id AND b.result IS NULL)
          ORDER BY definition_id, level DESC`,
        [req.params.id],
      );
      return {
        creatures: rows.map((r) => ({
          id: r.id,
          creatureId: r.definition_id,
          level: r.level,
          grade: nftGrade(r.ivs),
        })),
      };
    },
  );

  // ------------------------------------------------------------------ trades

  app.get('/v1/trades', async (req) => {
    const auth = requireAuth(req);
    await db.query(
      `UPDATE trades SET status = 'expired', finished_at = now()
        WHERE status = 'pending' AND expires_at <= now() AND (from_user = $1 OR to_user = $1)`,
      [auth.userId],
    );
    const { rows } = await db.query(
      `SELECT t.id, t.status, t.from_user = $1 AS mine, t.expires_at AS "expiresAt",
              CASE WHEN t.from_user = $1 THEN t.to_user ELSE t.from_user END AS "friendId",
              p.display_name AS "friendName",
              g.definition_id AS "giveCreatureId", g.level AS "giveLevel",
              w.definition_id AS "wantCreatureId", w.level AS "wantLevel"
         FROM trades t
         JOIN players p ON p.user_id = CASE WHEN t.from_user = $1 THEN t.to_user ELSE t.from_user END
         JOIN creature_instances g ON g.id = t.give_creature
         JOIN creature_instances w ON w.id = t.want_creature
        WHERE (t.from_user = $1 OR t.to_user = $1) AND (t.status = 'pending' OR t.finished_at > now() - interval '1 day')
        ORDER BY t.created_at DESC LIMIT 20`,
      [auth.userId],
    );
    return { trades: rows };
  });

  /** Proposes giving one of your creatures for one of a friend's. */
  app.post<{ Body: Static<typeof TradeBody> }>(
    '/v1/trades',
    { schema: { body: TradeBody }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      const { to, give, want } = req.body;
      return withTx(db, async (c) => {
        if (!(await areFriends(c, auth.userId, to)))
          throw new HttpProblem('not_friends', 'Only friends can trade');
        if (!(await tradeable(c, auth.userId, give)) || !(await tradeable(c, to, want))) {
          throw new HttpProblem('trade_unavailable', 'One of these creatures cannot be traded now');
        }
        await c.query(
          `UPDATE trades SET status = 'cancelled', finished_at = now()
            WHERE status = 'pending' AND from_user = $1 AND to_user = $2`,
          [auth.userId, to],
        );
        const { rows } = await c.query<{ id: string; expires_at: Date }>(
          `INSERT INTO trades (from_user, to_user, give_creature, want_creature, status, expires_at)
           VALUES ($1, $2, $3, $4, 'pending', now() + make_interval(mins => $5))
           RETURNING id, expires_at`,
          [auth.userId, to, give, want, cfg().tradeTtlMin],
        );
        return { id: rows[0]!.id, status: 'pending', expiresAt: rows[0]!.expires_at.toISOString() };
      });
    },
  );

  /** Accepts a trade: both players must be together right now. The swap is atomic. */
  app.post<{ Params: Static<typeof IdParams> }>(
    '/v1/trades/:id/accept',
    { schema: { params: IdParams } },
    async (req) => {
      const auth = requireAuth(req);
      return withTx(db, async (c) => {
        const { rows } = await c.query<{
          from_user: string;
          give_creature: string;
          want_creature: string;
          open: boolean;
        }>(
          `SELECT from_user, give_creature, want_creature, expires_at > now() AS open
             FROM trades WHERE id = $1 AND to_user = $2 AND status = 'pending' FOR UPDATE`,
          [req.params.id, auth.userId],
        );
        const t = rows[0];
        if (!t || !t.open) throw new HttpProblem('not_found', 'No such trade, or it lapsed');
        if (!(await areFriends(c, auth.userId, t.from_user)))
          throw new HttpProblem('not_friends', 'Only friends can trade');

        // together: both have a recent fix, close to each other
        await assertTogether(c, auth.userId, t.from_user);

        // daily limit, each player in their own local day
        for (const who of [auth.userId, t.from_user]) {
          const { rows: n } = await c.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM trades
              WHERE status = 'done' AND (from_user = $1 OR to_user = $1)
                AND finished_at >= (date_trunc('day', now() AT TIME ZONE ${PLAYER_TZ_SQL}) AT TIME ZONE ${PLAYER_TZ_SQL})`,
            [who],
          );
          if (n[0]!.n >= cfg().tradesPerDay)
            throw new HttpProblem('trade_limit', 'Daily trade limit reached');
        }

        if (
          !(await tradeable(c, t.from_user, t.give_creature)) ||
          !(await tradeable(c, auth.userId, t.want_creature))
        ) {
          await c.query(
            `UPDATE trades SET status = 'cancelled', finished_at = now() WHERE id = $1`,
            [req.params.id],
          );
          throw new HttpProblem('trade_unavailable', 'One of these creatures cannot be traded now');
        }
        // the swap: each creature starts fresh with its new trainer (evolution timers restart)
        await c.query(
          `UPDATE creature_instances SET owner_id = $2, acquired_via = 'trade', acquired_ref = $3, acquired_at = now()
            WHERE id = $1`,
          [t.give_creature, auth.userId, req.params.id],
        );
        await c.query(
          `UPDATE creature_instances SET owner_id = $2, acquired_via = 'trade', acquired_ref = $3, acquired_at = now()
            WHERE id = $1`,
          [t.want_creature, t.from_user, req.params.id],
        );
        await c.query(`UPDATE trades SET status = 'done', finished_at = now() WHERE id = $1`, [
          req.params.id,
        ]);
        // each player now has the other's species in the Dex
        const { rows: species } = await c.query<{ id: string; def: string }>(
          `SELECT id, definition_id AS def FROM creature_instances WHERE id = ANY($1::uuid[])`,
          [[t.give_creature, t.want_creature]],
        );
        const defOf = new Map(species.map((s) => [s.id, s.def]));
        await markDex(c, auth.userId, defOf.get(t.give_creature)!, true);
        await markDex(c, t.from_user, defOf.get(t.want_creature)!, true);
        // any other pending trade involving these two creatures is off
        await c.query(
          `UPDATE trades SET status = 'cancelled', finished_at = now()
            WHERE status = 'pending' AND id <> $1
              AND (give_creature = ANY($2::uuid[]) OR want_creature = ANY($2::uuid[]))`,
          [req.params.id, [t.give_creature, t.want_creature]],
        );
        return { status: 'done' };
      });
    },
  );

  app.post<{ Params: Static<typeof IdParams> }>(
    '/v1/trades/:id/decline',
    { schema: { params: IdParams } },
    async (req) => {
      const auth = requireAuth(req);
      const res = await db.query(
        `UPDATE trades SET status = CASE WHEN from_user = $2 THEN 'cancelled' ELSE 'declined' END,
                finished_at = now()
          WHERE id = $1 AND status = 'pending' AND (from_user = $2 OR to_user = $2)`,
        [req.params.id, auth.userId],
      );
      if (!res.rowCount) throw new HttpProblem('not_found', 'No such trade');
      return { status: 'closed' };
    },
  );
}
