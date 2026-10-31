import type { FastifyInstance } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import { arenaSeason, normaliseLook } from '@nyrgo/shared';
import type { Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';

/**
 * Player leaderboards: level, creatures caught, species caught and the arena's current season.
 * Like everything social, a player only ever sees players of their own age group. The top of
 * each board is cached for a minute; the player's own place is always fresh.
 */

const BOARDS = {
  level: { value: 's.level', tie: 's.xp DESC' },
  captures: { value: 's.captures', tie: 's.species DESC' },
  species: { value: 's.species', tie: 's.captures DESC' },
  arena: { value: 's.rating', tie: 's.wins DESC' },
} as const;
type Board = keyof typeof BOARDS;

const Query = Type.Object(
  { by: Type.Union(Object.keys(BOARDS).map((b) => Type.Literal(b))) },
  { additionalProperties: false },
);

const TOP = 50;
const CACHE_MS = 60_000;

/** One row per active player with what the boards rank by. */
const STATS = `
  SELECT p.user_id, p.display_name AS name, p.avatar, p.level, p.xp,
         coalesce(d.captures, 0)::int AS captures, coalesce(d.species, 0)::int AS species,
         CASE WHEN p.arena_season = $2 AND p.arena_wins + p.arena_losses > 0
              THEN p.arena_rating ELSE 0 END AS rating,
         p.arena_wins AS wins
    FROM players p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (SELECT user_id, sum(caught_count) AS captures,
                      count(*) FILTER (WHERE caught_at IS NOT NULL) AS species
                 FROM dex_entries GROUP BY user_id) d ON d.user_id = p.user_id
   WHERE u.status = 'active' AND (u.age_band = '18+') = $1`;

export async function leaderboardRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const cache = new Map<string, { at: number; rows: unknown[] }>();

  app.get<{ Querystring: Static<typeof Query> }>(
    '/v1/leaderboards',
    { schema: { querystring: Query }, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      const by = req.query.by as Board;
      const { value, tie } = BOARDS[by];
      const { rows: me } = await db.query<{ adult: boolean }>(
        `SELECT age_band = '18+' AS adult FROM users WHERE id = $1`,
        [auth.userId],
      );
      if (!me[0]) throw new HttpProblem('unauthenticated', 'Sign in required');
      const adult = me[0].adult;
      const season = arenaSeason();

      const key = `${by}:${adult}`;
      let top = cache.get(key);
      if (!top || Date.now() - top.at > CACHE_MS) {
        const { rows } = await db.query<{
          user_id: string;
          name: string;
          avatar: unknown;
          level: number;
          value: number;
          rank: number;
        }>(
          `SELECT s.user_id, s.name, s.avatar, s.level, ${value} AS value,
                  rank() OVER (ORDER BY ${value} DESC)::int AS rank
             FROM (${STATS}) s
            WHERE ${value} > 0
            ORDER BY ${value} DESC, ${tie}, s.name
            LIMIT ${TOP}`,
          [adult, season],
        );
        top = {
          at: Date.now(),
          rows: rows.map((r) => ({
            rank: r.rank,
            id: r.user_id,
            name: r.name,
            level: r.level,
            value: Number(r.value),
            look: normaliseLook(r.avatar),
          })),
        };
        cache.set(key, top);
      }

      const { rows: mine } = await db.query<{ value: number; rank: number }>(
        `WITH s AS (${STATS})
         SELECT ${value} AS value,
                CASE WHEN ${value} > 0
                     THEN (SELECT count(*) FROM s o WHERE o.${value.slice(2)} > s.${value.slice(2)})::int + 1
                END AS rank
           FROM s WHERE s.user_id = $3`,
        [adult, season, auth.userId],
      );
      return {
        by,
        season: by === 'arena' ? season : null,
        top: (top.rows as { id: string }[]).map((r) => ({ ...r, me: r.id === auth.userId })),
        me: mine[0] ? { value: Number(mine[0].value), rank: mine[0].rank } : null,
      };
    },
  );
}
