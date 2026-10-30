import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { Type, type Static } from '@sinclair/typebox';
import {
  CREATURES_BY_ID,
  DEFAULT_CONFIG,
  createFighter,
  seededRandom,
  simulateDuel,
  type DuelResult,
} from '@nyrgo/shared';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';
import { PLAYER_TZ_SQL } from '../progress/rewards.js';
import { loadOwned, type OwnedView } from '../creatures/owned.js';
import { areFriends, assertTogether } from './routes.js';

/**
 * Friendly duels: a player challenges a friend with one creature, the friend answers with one of
 * theirs while both stand within 100 m, and the game fights it out. Creatures fight at full HP
 * and nothing is lost or won except the record, so there is nothing to farm.
 */

const cfg = () => DEFAULT_CONFIG.social;
const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
const ChallengeBody = Type.Object(
  { to: Type.String({ format: 'uuid' }), creature: Type.String({ format: 'uuid' }) },
  { additionalProperties: false },
);
const AnswerBody = Type.Object(
  { creature: Type.String({ format: 'uuid' }) },
  { additionalProperties: false },
);

function fighterOf(o: OwnedView) {
  const def = CREATURES_BY_ID.get(o.creatureId)!;
  // a friendly duel: full health, whatever the creature went through today
  return createFighter({
    creatureId: o.creatureId,
    element: def.element,
    level: o.level,
    stats: o.stats,
    skills: def.skills,
    passive: def.passive,
  });
}

async function duelsToday(c: PoolClient, userId: string): Promise<number> {
  const { rows } = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM duels
      WHERE status = 'done' AND (from_user = $1 OR to_user = $1)
        AND finished_at >= (date_trunc('day', now() AT TIME ZONE ${PLAYER_TZ_SQL}) AT TIME ZONE ${PLAYER_TZ_SQL})`,
    [userId],
  );
  return rows[0]!.n;
}

export async function duelRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /** Open challenges and the last day's results, with the fight for finished ones. */
  app.get('/v1/duels', async (req) => {
    const auth = requireAuth(req);
    await db.query(
      `UPDATE duels SET status = 'expired', finished_at = now()
        WHERE status = 'pending' AND expires_at <= now() AND (from_user = $1 OR to_user = $1)`,
      [auth.userId],
    );
    const { rows } = await db.query(
      `SELECT d.id, d.status, d.from_user = $1 AS mine, d.expires_at AS "expiresAt",
              d.finished_at AS "finishedAt",
              CASE WHEN d.from_user = $1 THEN d.to_user ELSE d.from_user END AS "friendId",
              p.display_name AS "friendName",
              CASE WHEN d.winner IS NULL THEN NULL
                   WHEN (d.winner = 'from') = (d.from_user = $1) THEN 'me' ELSE 'friend' END AS winner,
              fc.definition_id AS "fromCreatureId", fc.level AS "fromLevel",
              tc.definition_id AS "toCreatureId", tc.level AS "toLevel",
              d.fight
         FROM duels d
         JOIN players p ON p.user_id = CASE WHEN d.from_user = $1 THEN d.to_user ELSE d.from_user END
         JOIN creature_instances fc ON fc.id = d.from_creature
         LEFT JOIN creature_instances tc ON tc.id = d.to_creature
        WHERE (d.from_user = $1 OR d.to_user = $1)
          AND (d.status = 'pending' OR d.finished_at > now() - interval '1 day')
        ORDER BY d.created_at DESC LIMIT 20`,
      [auth.userId],
    );
    return { duels: rows };
  });

  /** Challenges a friend with one of your creatures. */
  app.post<{ Body: Static<typeof ChallengeBody> }>(
    '/v1/duels',
    { schema: { body: ChallengeBody }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      return withTx(db, async (c) => {
        if (!(await areFriends(c, auth.userId, req.body.to)))
          throw new HttpProblem('not_friends', 'Only friends can duel');
        if (!(await loadOwned(c, auth.userId, req.body.creature)))
          throw new HttpProblem('not_found', 'Unknown creature');
        // one open challenge per pair: a new one replaces it
        await c.query(
          `UPDATE duels SET status = 'cancelled', finished_at = now()
            WHERE status = 'pending' AND from_user = $1 AND to_user = $2`,
          [auth.userId, req.body.to],
        );
        const { rows } = await c.query<{ id: string; expires_at: Date }>(
          `INSERT INTO duels (from_user, to_user, from_creature, status, expires_at)
           VALUES ($1, $2, $3, 'pending', now() + make_interval(mins => $4))
           RETURNING id, expires_at`,
          [auth.userId, req.body.to, req.body.creature, cfg().duelTtlMin],
        );
        return { id: rows[0]!.id, status: 'pending', expiresAt: rows[0]!.expires_at.toISOString() };
      });
    },
  );

  /** The friend answers with a creature while both stand together; the game fights it out. */
  app.post<{ Params: Static<typeof IdParams>; Body: Static<typeof AnswerBody> }>(
    '/v1/duels/:id/accept',
    {
      schema: { params: IdParams, body: AnswerBody },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req) => {
      const auth = requireAuth(req);
      return withTx(db, async (c) => {
        const { rows } = await c.query<{ from_user: string; from_creature: string; open: boolean }>(
          `SELECT from_user, from_creature, expires_at > now() AS open
             FROM duels WHERE id = $1 AND to_user = $2 AND status = 'pending' FOR UPDATE`,
          [req.params.id, auth.userId],
        );
        const d = rows[0];
        if (!d || !d.open) throw new HttpProblem('not_found', 'No such challenge, or it lapsed');
        if (!(await areFriends(c, auth.userId, d.from_user)))
          throw new HttpProblem('not_friends', 'Only friends can duel');
        await assertTogether(c, auth.userId, d.from_user);
        for (const who of [auth.userId, d.from_user]) {
          if ((await duelsToday(c, who)) >= cfg().duelsPerDay)
            throw new HttpProblem('duel_limit', 'Daily duel limit reached');
        }
        const theirs = await loadOwned(c, d.from_user, d.from_creature);
        const mine = await loadOwned(c, auth.userId, req.body.creature);
        if (!mine) throw new HttpProblem('not_found', 'Unknown creature');
        if (!theirs) {
          await c.query(
            `UPDATE duels SET status = 'cancelled', finished_at = now() WHERE id = $1`,
            [req.params.id],
          );
          throw new HttpProblem('not_found', 'Their creature is no longer theirs');
        }

        const seed = randomBytes(8).toString('hex');
        const fight: DuelResult = simulateDuel(
          fighterOf(theirs),
          fighterOf(mine),
          seededRandom(seed),
        );
        const winner = fight.winner === 'player' ? 'from' : fight.winner === 'foe' ? 'to' : null;
        await c.query(
          `UPDATE duels SET status = 'done', to_creature = $2, winner = $3, fight = $4,
                  finished_at = now()
            WHERE id = $1`,
          [req.params.id, mine.id, winner, JSON.stringify({ seed, ...fight })],
        );
        return {
          id: req.params.id,
          status: 'done',
          winner: winner === null ? null : winner === 'to' ? 'me' : 'friend',
          fight,
        };
      });
    },
  );

  /** Declines a challenge (or withdraws your own). */
  app.post<{ Params: Static<typeof IdParams> }>(
    '/v1/duels/:id/decline',
    { schema: { params: IdParams } },
    async (req) => {
      const auth = requireAuth(req);
      const res = await db.query(
        `UPDATE duels SET status = CASE WHEN from_user = $2 THEN 'cancelled' ELSE 'declined' END,
                finished_at = now()
          WHERE id = $1 AND status = 'pending' AND (from_user = $2 OR to_user = $2)`,
        [req.params.id, auth.userId],
      );
      if (!res.rowCount) throw new HttpProblem('not_found', 'No such challenge');
      return { status: 'closed' };
    },
  );
}
