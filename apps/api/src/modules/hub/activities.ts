import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { Type, type Static } from '@sinclair/typebox';
import {
  CREATURES,
  CREATURES_BY_ID,
  DEFAULT_CONFIG,
  battleXp,
  createFighter,
  eloUpdate,
  instanceStats,
  seededRandom,
  simulateDuel,
  type DuelResult,
} from '@nyrgo/shared';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';
import { PLAYER_TZ_SQL, grantReward } from '../progress/rewards.js';
import { addCreatureXp, loadOwned, type OwnedView } from '../creatures/owned.js';

/**
 * What the town's buildings do: training against the gym's coach and battles in the arena
 * against other players' defending creatures. Both use the shared duel engine, both only while
 * the player stands inside that building, and both pay town XP (`source: 'hub'`) within a daily
 * cap, so the 50 % rule in `grantReward()` decides how much of it counts.
 */

const cfg = () => DEFAULT_CONFIG.hub;
const COACH_IVS = { hp: 8, atk: 8, def: 8, spd: 8 };
/** The arena host's creature for practice when no other player can be found. */
const HOST_IVS = { hp: 6, atk: 6, def: 6, spd: 6 };
const MAX_LEVEL = 50;
/** Ranked battles one player may have against the same opponent in a day. */
const PAIR_PER_DAY = 3;

const TrainingBody = Type.Object(
  { creature: Type.String({ format: 'uuid' }), tier: Type.Integer({ minimum: 0, maximum: 9 }) },
  { additionalProperties: false },
);
const MatchBody = Type.Object(
  {
    creature: Type.String({ format: 'uuid' }),
    mode: Type.Union([Type.Literal('ranked'), Type.Literal('practice')]),
  },
  { additionalProperties: false },
);
const DefenderBody = Type.Object(
  { creature: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]) },
  { additionalProperties: false },
);

type Kind = 'training' | 'arena_ranked' | 'arena_practice';

function fighter(creatureId: string, level: number, stats: OwnedView['stats']) {
  const def = CREATURES_BY_ID.get(creatureId)!;
  // like friendly duels: everyone fights at full health and nothing is hurt afterwards
  return createFighter({
    creatureId,
    element: def.element,
    level,
    stats,
    skills: def.skills,
    passive: def.passive,
  });
}

/** A wild-type creature picked by the seed (never legendary or mythic). */
function pickCreature(rand: () => number): string {
  const pool = CREATURES.filter((c) => c.wild);
  return pool[Math.floor(rand() * pool.length)]!.id;
}

const clampLevel = (l: number) => Math.max(1, Math.min(MAX_LEVEL, Math.round(l)));

const TODAY = `(date_trunc('day', now() AT TIME ZONE ${PLAYER_TZ_SQL}) AT TIME ZONE ${PLAYER_TZ_SQL})`;

async function today(c: PoolClient | Db, userId: string) {
  const { rows } = await c.query<{ training: number; ranked: number; xp: number }>(
    `SELECT count(*) FILTER (WHERE kind = 'training')::int AS training,
            count(*) FILTER (WHERE kind = 'arena_ranked')::int AS ranked,
            coalesce(sum(hub_xp), 0)::int AS xp
       FROM hub_activities WHERE user_id = $1 AND created_at >= ${TODAY}`,
    [userId],
  );
  return rows[0]!;
}

/** Records an activity and pays its town XP, capped by what is left of today's allowance. */
async function settle(
  c: PoolClient,
  userId: string,
  a: {
    kind: Kind;
    mine: OwnedView;
    tier?: number;
    opponent: { user?: string; name?: string; def: string; level: number };
    won: boolean | null;
    ratingBefore?: number;
    ratingAfter?: number | undefined;
    xp: number;
    creatureXp?: number;
    fight: DuelResult & { seed: string };
  },
) {
  const t = await today(c, userId);
  const hubXp = Math.max(0, Math.min(a.xp, cfg().xpPerDay - t.xp));
  const ins = await c.query<{ id: string }>(
    `INSERT INTO hub_activities
       (user_id, kind, creature_id, creature_def, creature_level, tier, opponent_user,
        opponent_name, opponent_def, opponent_level, won, rating_before, rating_after, hub_xp,
        creature_xp, fight)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING id`,
    [
      userId,
      a.kind,
      a.mine.id,
      a.mine.creatureId,
      a.mine.level,
      a.tier ?? null,
      a.opponent.user ?? null,
      a.opponent.name ?? null,
      a.opponent.def,
      a.opponent.level,
      a.won,
      a.ratingBefore ?? null,
      a.ratingAfter ?? null,
      hubXp,
      a.creatureXp ?? 0,
      JSON.stringify(a.fight),
    ],
  );
  const id = ins.rows[0]!.id;
  const reward =
    hubXp > 0
      ? await grantReward(c, userId, {
          xp: hubXp,
          gold: 0,
          reason: `hub_${a.kind}`,
          // the ledger wants a uuid (level-up Gold can be paid with this reward)
          refId: randomUUID(),
          source: 'hub',
        })
      : null;
  return {
    id,
    hubXp,
    xpCapped: a.xp - hubXp,
    level: reward?.level ?? null,
    leveledUp: reward?.leveledUp ?? false,
  };
}

/** The creature a player defends the arena with: their choice, their companion, or their best. */
async function defenderOf(c: PoolClient, userId: string): Promise<OwnedView | null> {
  const { rows } = await c.query<{ id: string }>(
    `SELECT ci.id FROM players p
       JOIN creature_instances ci ON ci.owner_id = p.user_id
      WHERE p.user_id = $1
      ORDER BY (ci.id = p.arena_defender) DESC NULLS LAST, (ci.id = p.companion_id) DESC NULLS LAST,
               ci.level DESC, ci.acquired_at
      LIMIT 3`,
    [userId],
  );
  // the first one still really theirs (not moved to another NEAR account)
  for (const r of rows) {
    const o = await loadOwned(c, userId, r.id);
    if (o) return o;
  }
  return null;
}

export async function hubActivityRoutes(
  app: FastifyInstance,
  { db, inRoom }: { db: Db; inRoom: (userId: string, room: string) => boolean },
) {
  function mustBeIn(userId: string, room: 'gym' | 'arena') {
    if (!inRoom(userId, room))
      throw new HttpProblem('hub_not_here', `Go into the ${room} in the town first`);
  }

  async function history(userId: string, kinds: Kind[], limit = 15) {
    const { rows } = await db.query(
      `SELECT a.id, a.kind, a.created_at AS "at", a.won, a.tier,
              a.creature_def AS "creatureId", a.creature_level AS "level",
              a.opponent_def AS "opponentCreatureId", a.opponent_level AS "opponentLevel",
              a.opponent_name AS "opponentName", a.rating_before AS "ratingBefore",
              a.rating_after AS "ratingAfter", a.hub_xp AS "hubXp", a.creature_xp AS "creatureXp",
              false AS defended, a.fight
         FROM hub_activities a
        WHERE a.user_id = $1 AND a.kind = ANY($2)
        ORDER BY a.created_at DESC LIMIT $3`,
      [userId, kinds, limit],
    );
    return rows;
  }

  // ----------------------------------------------------------------------------------------------
  // The gym

  app.get('/v1/hub/training', async (req) => {
    const auth = requireAuth(req);
    const t = await today(db, auth.userId);
    return {
      tiers: cfg().trainingTiers,
      left: Math.max(0, cfg().trainingsPerDay - t.training),
      perDay: cfg().trainingsPerDay,
      hubXpToday: t.xp,
      hubXpPerDay: cfg().xpPerDay,
      history: await history(auth.userId, ['training'], 10),
    };
  });

  /** One training bout with the coach, at the difficulty the player chose. */
  app.post<{ Body: Static<typeof TrainingBody> }>(
    '/v1/hub/training',
    { schema: { body: TrainingBody }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      mustBeIn(auth.userId, 'gym');
      const offset = cfg().trainingTiers[req.body.tier];
      if (offset === undefined) throw new HttpProblem('validation_failed', 'Unknown tier');
      return withTx(db, async (c) => {
        // one at a time per player, so the daily limit holds under parallel requests
        await c.query(`SELECT 1 FROM players WHERE user_id = $1 FOR UPDATE`, [auth.userId]);
        const t = await today(c, auth.userId);
        if (t.training >= cfg().trainingsPerDay)
          throw new HttpProblem('hub_limit', 'No more training today');
        const mine = await loadOwned(c, auth.userId, req.body.creature);
        if (!mine) throw new HttpProblem('not_found', 'Unknown creature');

        const seed = randomBytes(8).toString('hex');
        const rand = seededRandom(seed);
        const coachDef = pickCreature(rand);
        const coachLevel = clampLevel(mine.level + offset);
        const coach = fighter(
          coachDef,
          coachLevel,
          instanceStats(CREATURES_BY_ID.get(coachDef)!.stats, coachLevel, COACH_IVS),
        );
        const fight = simulateDuel(fighter(mine.creatureId, mine.level, mine.stats), coach, rand);
        const won = fight.winner === 'player';
        const xp = won
          ? cfg().trainingWinXp + req.body.tier * cfg().trainingTierXp
          : cfg().trainingLossXp;
        // the creature learns from every bout, more from a win
        const cXp = Math.round(battleXp(coachLevel) * (won ? 0.5 : 0.2));
        const grown = await addCreatureXp(c, mine, cXp, mine.hp);
        const s = await settle(c, auth.userId, {
          kind: 'training',
          mine,
          tier: req.body.tier,
          opponent: { def: coachDef, level: coachLevel },
          won: fight.winner === null ? null : won,
          xp,
          creatureXp: cXp,
          fight: { seed, ...fight },
        });
        return {
          ...s,
          won: fight.winner === null ? null : won,
          coach: { creatureId: coachDef, level: coachLevel },
          creature: grown,
          left: cfg().trainingsPerDay - t.training - 1,
          fight,
        };
      });
    },
  );

  // ----------------------------------------------------------------------------------------------
  // The arena

  app.get('/v1/hub/arena', async (req) => {
    const auth = requireAuth(req);
    const t = await today(db, auth.userId);
    const { rows } = await db.query<{
      rating: number;
      wins: number;
      losses: number;
      defender: string | null;
      adult: boolean;
    }>(
      `SELECT p.arena_rating AS rating, p.arena_wins AS wins, p.arena_losses AS losses,
              p.arena_defender AS defender, u.age_band = '18+' AS adult
         FROM players p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1`,
      [auth.userId],
    );
    const me = rows[0];
    if (!me) throw new HttpProblem('unauthenticated', 'Sign in required');
    // the leaderboard only lists players of the same age group, like everything social
    const board = await db.query(
      `SELECT p.user_id = $1 AS me, p.display_name AS name, p.arena_rating AS rating,
              p.arena_wins AS wins, p.arena_losses AS losses
         FROM players p JOIN users u ON u.id = p.user_id
        WHERE u.status = 'active' AND (u.age_band = '18+') = $2
          AND p.arena_wins + p.arena_losses > 0
        ORDER BY p.arena_rating DESC, p.arena_wins DESC LIMIT 20`,
      [auth.userId, me.adult],
    );
    const defended = await db.query(
      `SELECT a.id, a.created_at AS "at", NOT a.won AS won, p.display_name AS "opponentName",
              a.opponent_def AS "creatureId", a.opponent_level AS "level",
              a.creature_def AS "opponentCreatureId", a.creature_level AS "opponentLevel",
              true AS defended
         FROM hub_activities a JOIN players p ON p.user_id = a.user_id
        WHERE a.opponent_user = $1 AND a.kind = 'arena_ranked'
        ORDER BY a.created_at DESC LIMIT 10`,
      [auth.userId],
    );
    return {
      rating: me.rating,
      wins: me.wins,
      losses: me.losses,
      defenderId: me.defender,
      rankedLeft: Math.max(0, cfg().rankedPerDay - t.ranked),
      rankedPerDay: cfg().rankedPerDay,
      hubXpToday: t.xp,
      hubXpPerDay: cfg().xpPerDay,
      history: await history(auth.userId, ['arena_ranked', 'arena_practice'], 15),
      defended: defended.rows,
      leaderboard: board.rows,
    };
  });

  /** Chooses the creature that answers other players' challenges (null = automatic). */
  app.put<{ Body: Static<typeof DefenderBody> }>(
    '/v1/hub/arena/defender',
    { schema: { body: DefenderBody } },
    async (req) => {
      const auth = requireAuth(req);
      return withTx(db, async (c) => {
        if (req.body.creature && !(await loadOwned(c, auth.userId, req.body.creature)))
          throw new HttpProblem('not_found', 'Unknown creature');
        await c.query(`UPDATE players SET arena_defender = $2 WHERE user_id = $1`, [
          auth.userId,
          req.body.creature,
        ]);
        return { defenderId: req.body.creature };
      });
    },
  );

  /**
   * A battle against another player's defender, found by rating. Ranked moves both ratings;
   * practice moves nothing and pays nothing (and falls back to the host when nobody is around).
   */
  app.post<{ Body: Static<typeof MatchBody> }>(
    '/v1/hub/arena/match',
    { schema: { body: MatchBody }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      mustBeIn(auth.userId, 'arena');
      const ranked = req.body.mode === 'ranked';
      return withTx(db, async (c) => {
        const { rows } = await c.query<{ rating: number; adult: boolean }>(
          `SELECT p.arena_rating AS rating, u.age_band = '18+' AS adult
             FROM players p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1 FOR UPDATE OF p`,
          [auth.userId],
        );
        const me = rows[0]!;
        const t = await today(c, auth.userId);
        if (ranked && t.ranked >= cfg().rankedPerDay)
          throw new HttpProblem('hub_limit', 'No more ranked battles today');
        const mine = await loadOwned(c, auth.userId, req.body.creature);
        if (!mine) throw new HttpProblem('not_found', 'Unknown creature');

        const opp = await findOpponent(c, auth.userId, me.rating, me.adult);
        const seed = randomBytes(8).toString('hex');
        const rand = seededRandom(seed);
        let foe: { user?: string; name?: string; def: string; level: number; rating?: number };
        let foeFighter;
        if (opp) {
          const d = await defenderOf(c, opp.user_id);
          if (!d) throw new HttpProblem('no_opponent', 'Nobody to fight right now');
          foe = {
            user: opp.user_id,
            name: opp.name,
            def: d.creatureId,
            level: d.level,
            rating: opp.rating,
          };
          foeFighter = fighter(d.creatureId, d.level, d.stats);
        } else if (!ranked) {
          const def = pickCreature(rand);
          const level = clampLevel(mine.level);
          foe = { def, level };
          foeFighter = fighter(
            def,
            level,
            instanceStats(CREATURES_BY_ID.get(def)!.stats, level, HOST_IVS),
          );
        } else {
          throw new HttpProblem('no_opponent', 'Nobody to fight in your range right now');
        }

        const fight = simulateDuel(
          fighter(mine.creatureId, mine.level, mine.stats),
          foeFighter,
          rand,
        );
        const won = fight.winner === null ? null : fight.winner === 'player';
        let ratingAfter: number | undefined;
        if (ranked && foe.user) {
          const score = won === null ? 0.5 : won ? 1 : 0;
          const r = eloUpdate(me.rating, foe.rating!, score, cfg().eloK);
          ratingAfter = r.challenger;
          await c.query(
            `UPDATE players SET arena_rating = $2,
                    arena_wins = arena_wins + $3, arena_losses = arena_losses + $4
              WHERE user_id = $1`,
            [auth.userId, r.challenger, won === true ? 1 : 0, won === false ? 1 : 0],
          );
          await c.query(
            `UPDATE players SET arena_rating = $2,
                    arena_wins = arena_wins + $3, arena_losses = arena_losses + $4
              WHERE user_id = $1`,
            [foe.user, r.defender, won === false ? 1 : 0, won === true ? 1 : 0],
          );
        }
        const xp = !ranked ? 0 : won ? cfg().rankedWinXp : cfg().rankedLossXp;
        const s = await settle(c, auth.userId, {
          kind: ranked ? 'arena_ranked' : 'arena_practice',
          mine,
          opponent: foe,
          won,
          ...(ranked ? { ratingBefore: me.rating, ratingAfter } : {}),
          xp,
          fight: { seed, ...fight },
        });
        return {
          ...s,
          mode: req.body.mode,
          won,
          opponent: { name: foe.name ?? null, creatureId: foe.def, level: foe.level },
          ratingBefore: ranked ? me.rating : null,
          ratingAfter: ratingAfter ?? null,
          rankedLeft: Math.max(0, cfg().rankedPerDay - t.ranked - (ranked ? 1 : 0)),
          fight,
        };
      });
    },
  );
}

/**
 * Another active player of the same age group with a creature, in a widening rating window,
 * not blocked either way. Someone not faced recently comes first, and one pair fights at most
 * `PAIR_PER_DAY` ranked battles a day, so two friends cannot farm each other's rating.
 */
async function findOpponent(c: PoolClient, userId: string, rating: number, adult: boolean) {
  for (const w of DEFAULT_CONFIG.hub.matchWindows) {
    const { rows } = await c.query<{ user_id: string; name: string; rating: number }>(
      `SELECT p.user_id, p.display_name AS name, p.arena_rating AS rating
         FROM players p JOIN users u ON u.id = p.user_id
        WHERE p.user_id <> $1 AND u.status = 'active' AND (u.age_band = '18+') = $2
          AND abs(p.arena_rating - $3) <= $4
          AND EXISTS (SELECT 1 FROM creature_instances ci WHERE ci.owner_id = p.user_id)
          AND NOT EXISTS (SELECT 1 FROM hub_blocks b
                           WHERE (b.user_id = $1 AND b.blocked_id = p.user_id)
                              OR (b.user_id = p.user_id AND b.blocked_id = $1))
          AND (SELECT count(*) FROM hub_activities a
                WHERE a.user_id = $1 AND a.kind = 'arena_ranked' AND a.opponent_user = p.user_id
                  AND a.created_at >= ${TODAY}) < ${PAIR_PER_DAY}
        ORDER BY (SELECT max(a.created_at) FROM hub_activities a
                   WHERE a.user_id = $1 AND a.opponent_user = p.user_id) ASC NULLS FIRST,
                 random()
        LIMIT 1`,
      [userId, adult, rating, w],
    );
    if (rows[0]) return rows[0];
  }
  return null;
}
