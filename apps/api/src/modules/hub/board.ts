import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { Type, type Static } from '@sinclair/typebox';
import {
  ACHIEVEMENTS,
  CREATURES_BY_ID,
  DEFAULT_CONFIG,
  HUB_QUESTS_BY_ID,
  TOURNAMENT_PRIZES,
  arenaSeason,
  createFighter,
  dailyHubQuests,
  seededRandom,
  simulateDuel,
  type AchievementStat,
  type HubQuestKind,
} from '@nyrgo/shared';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';
import { loadOwned, type OwnedView } from '../creatures/owned.js';
import { gameDay } from '../economy/missions.js';
import { grantReward } from '../progress/rewards.js';

/**
 * The town's long game: the notice board's daily quests, arena seasons, the weekly tournament
 * and achievements. Everything is worked out on the server from what players actually did.
 */

type Q = Db | PoolClient;
const cfg = () => DEFAULT_CONFIG.hub;

// ------------------------------------------------------------------------------------------------
// Quests

/** Moves today's town quests forward for something the player just did. */
export async function bumpHubQuest(q: Q, userId: string, kind: HubQuestKind, n = 1) {
  if (n <= 0) return;
  const day = await gameDay(q, userId);
  for (const quest of dailyHubQuests(userId, day)) {
    if (quest.kind !== kind) continue;
    await q.query(
      `INSERT INTO mission_progress (user_id, mission_id, period_start, progress, completed_at)
       VALUES ($1, $2, $3::date, LEAST($4::int, $5::int), CASE WHEN $4::int >= $5::int THEN now() END)
       ON CONFLICT (user_id, mission_id, period_start) DO UPDATE SET
         progress = LEAST(mission_progress.progress + $4::int, $5::int),
         completed_at = COALESCE(mission_progress.completed_at,
                                 CASE WHEN mission_progress.progress + $4::int >= $5::int THEN now() END)`,
      [userId, quest.id, day, n, quest.target],
    );
  }
}

async function todaysQuests(q: Q, userId: string) {
  const day = await gameDay(q, userId);
  const picked = dailyHubQuests(userId, day);
  const { rows } = await q.query<{
    mission_id: string;
    progress: number;
    completed_at: Date | null;
    rewarded_at: Date | null;
  }>(
    `SELECT mission_id, progress, completed_at, rewarded_at FROM mission_progress
      WHERE user_id = $1 AND period_start = $2::date AND mission_id LIKE 'hub:%'`,
    [userId, day],
  );
  const by = new Map(rows.map((r) => [r.mission_id, r]));
  return {
    day,
    quests: picked.map((p) => ({
      ...p,
      progress: by.get(p.id)?.progress ?? 0,
      completed: Boolean(by.get(p.id)?.completed_at),
      claimed: Boolean(by.get(p.id)?.rewarded_at),
    })),
  };
}

// ------------------------------------------------------------------------------------------------
// Seasons

/**
 * Starts the current arena season for players still in an older one (one player, or everyone):
 * their record is kept in the season's results and their rating carries halfway back to 1000.
 * The sweep over everyone skips players who never entered a season (they join one on first use).
 */
export async function rollSeason(q: Q, userId?: string): Promise<number> {
  const cur = arenaSeason();
  const only = userId ? 'AND p.user_id = $2' : '';
  const params = userId ? [cur, userId] : [cur];
  await q.query(
    `INSERT INTO arena_season_results (season, user_id, adult, rating, wins, losses)
     SELECT p.arena_season, p.user_id, u.age_band = '18+', p.arena_rating, p.arena_wins, p.arena_losses
       FROM players p JOIN users u ON u.id = p.user_id
      WHERE p.arena_season <> $1 AND p.arena_season <> ''
        AND p.arena_wins + p.arena_losses > 0 ${only}
     ON CONFLICT DO NOTHING`,
    params,
  );
  const res = await q.query(
    `UPDATE players p SET
        arena_rating = CASE WHEN p.arena_season = '' THEN p.arena_rating
                            ELSE round(1000 + (p.arena_rating - 1000) / 2.0) END,
        arena_wins = 0, arena_losses = 0, arena_season = $1
      WHERE p.arena_season <> $1 ${userId ? only : "AND p.arena_season <> ''"}`,
    params,
  );
  return res.rowCount ?? 0;
}

/** A player's finished seasons with their final place in their age group. */
async function pastSeasons(q: Q, userId: string) {
  const { rows } = await q.query<{
    season: string;
    rating: number;
    wins: number;
    losses: number;
    rank: number;
  }>(
    `SELECT season, rating, wins, losses, rank::int FROM (
       SELECT r.*, rank() OVER (PARTITION BY season, adult ORDER BY rating DESC, wins DESC) AS rank
         FROM arena_season_results r) x
      WHERE user_id = $1 ORDER BY season DESC LIMIT 12`,
    [userId],
  );
  return rows;
}

// ------------------------------------------------------------------------------------------------
// Tournaments

/** Next Saturday at 18:00 UTC (a week later if that moment has passed). */
export function nextTournamentStart(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 18));
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  if (d <= now) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

/** There is always one open tournament per age group to sign up for. */
export async function ensureTournaments(q: Q) {
  for (const adult of [true, false]) {
    await q.query(
      `INSERT INTO hub_tournaments (adult, starts_at) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [adult, nextTournamentStart()],
    );
  }
}

interface Match {
  a: string | null;
  b: string | null;
  winner: string | null;
  turns: number;
}

function fighterOf(o: OwnedView) {
  const def = CREATURES_BY_ID.get(o.creatureId)!;
  return createFighter({
    creatureId: o.creatureId,
    element: def.element,
    level: o.level,
    stats: o.stats,
    skills: def.skills,
    passive: def.passive,
  });
}

/** Plays one tournament out: a seeded single-elimination bracket, prizes for the top four. */
async function playTournament(c: PoolClient, t: { id: string }) {
  const { rows: entries } = await c.query<{ user_id: string; creature_id: string }>(
    `SELECT user_id, creature_id FROM hub_tournament_entries WHERE tournament_id = $1 ORDER BY joined_at`,
    [t.id],
  );
  if (entries.length < cfg().tournamentMin) {
    await c.query(
      `UPDATE hub_tournaments SET status = 'cancelled', finished_at = now() WHERE id = $1`,
      [t.id],
    );
    return { id: t.id, status: 'cancelled', entrants: entries.length };
  }
  const seed = randomBytes(8).toString('hex');
  const rand = seededRandom(seed);
  const creature = new Map(entries.map((e) => [e.user_id, e.creature_id]));
  const order = [...entries.map((e) => e.user_id)];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  let size = 1;
  while (size < order.length) size *= 2;
  // byes go to the first seeds, one per match, so no match is two byes
  const slots: (string | null)[] = [];
  const byes = size - order.length;
  for (let i = 0, k = 0; i < size / 2; i++) {
    slots.push(order[k++] ?? null);
    slots.push(i < byes ? null : (order[k++] ?? null));
  }

  const fighters = new Map<string, OwnedView | null>();
  for (const u of order) fighters.set(u, await loadOwned(c, u, creature.get(u)!));
  const rounds: Match[][] = [];
  const lostIn = new Map<string, number>();
  let finalFight: unknown = null;
  let alive = slots;
  while (alive.length > 1) {
    const round: Match[] = [];
    const next: (string | null)[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i] ?? null;
      const b = alive[i + 1] ?? null;
      let winner: string | null;
      let turns = 0;
      const fa = a ? fighters.get(a) : null;
      const fb = b ? fighters.get(b) : null;
      if (!a || !fa) winner = b && fb ? b : null;
      else if (!b || !fb) winner = a;
      else {
        const fight = simulateDuel(fighterOf(fa), fighterOf(fb), rand);
        turns = fight.turns.length - 1;
        winner =
          fight.winner === 'player'
            ? a
            : fight.winner === 'foe'
              ? b
              : // a draw: the lower level wins (the bolder pick), then a coin
                fa.level !== fb.level
                ? fa.level < fb.level
                  ? a
                  : b
                : rand() < 0.5
                  ? a
                  : b;
        if (alive.length === 2) finalFight = { a: fa.creatureId, b: fb.creatureId, ...fight };
      }
      for (const p of [a, b]) if (p && p !== winner) lostIn.set(p, rounds.length);
      round.push({ a, b, winner, turns });
      next.push(winner);
    }
    rounds.push(round);
    alive = next;
  }
  const champion = alive[0] ?? null;
  const last = rounds.length - 1;
  const place = (u: string) =>
    u === champion ? 1 : lostIn.get(u) === last ? 2 : lostIn.get(u) === last - 1 ? 3 : null;
  for (const u of order) {
    const p = place(u);
    const prize = p ? (TOURNAMENT_PRIZES[p - 1] ?? 0) : 0;
    await c.query(
      `UPDATE hub_tournament_entries SET place = $3, prize = $4 WHERE tournament_id = $1 AND user_id = $2`,
      [t.id, u, p, prize],
    );
    if (prize > 0) {
      await c.query(
        `INSERT INTO gold_ledger (user_id, amount, reason, ref_id) VALUES ($1, $2, 'tournament_prize', $3)`,
        [u, prize, randomUUID()],
      );
      await c.query(
        `UPDATE players SET gold = gold + $2, version = version + 1, updated_at = now() WHERE user_id = $1`,
        [u, prize],
      );
    }
  }
  await c.query(
    `UPDATE hub_tournaments SET status = 'done', bracket = $2, seed = $3, finished_at = now()
      WHERE id = $1`,
    [t.id, JSON.stringify({ rounds, final: finalFight }), seed],
  );
  return { id: t.id, status: 'done', entrants: order.length, champion };
}

/** Runs the tournaments whose time has come, then opens the next ones. */
export async function runTournaments(db: Db) {
  const played: unknown[] = [];
  for (;;) {
    const r = await withTx(db, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM hub_tournaments WHERE status = 'open' AND starts_at <= now()
          ORDER BY starts_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      return rows[0] ? playTournament(c, rows[0]) : null;
    });
    if (!r) break;
    played.push(r);
  }
  await ensureTournaments(db);
  return { played };
}

// ------------------------------------------------------------------------------------------------
// Routes

const QuestParams = Type.Object({ id: Type.String({ maxLength: 60 }) });
const JoinBody = Type.Object(
  { creature: Type.String({ format: 'uuid' }) },
  { additionalProperties: false },
);

export async function boardRoutes(
  app: FastifyInstance,
  { db, inRoom }: { db: Db; inRoom: (userId: string, room: string) => boolean },
) {
  app.get('/v1/hub/quests', async (req) => {
    const auth = requireAuth(req);
    return todaysQuests(db, auth.userId);
  });

  /** Collects a finished quest's reward (once). */
  app.post<{ Params: Static<typeof QuestParams> }>(
    '/v1/hub/quests/:id/claim',
    { schema: { params: QuestParams }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      const quest = HUB_QUESTS_BY_ID.get(req.params.id);
      if (!quest) throw new HttpProblem('not_found', 'Unknown quest');
      return withTx(db, async (c) => {
        const day = await gameDay(c, auth.userId);
        if (!dailyHubQuests(auth.userId, day).some((q) => q.id === quest.id))
          throw new HttpProblem('not_found', 'Not one of today’s quests');
        const res = await c.query(
          `UPDATE mission_progress SET rewarded_at = now()
            WHERE user_id = $1 AND mission_id = $2 AND period_start = $3::date
              AND completed_at IS NOT NULL AND rewarded_at IS NULL`,
          [auth.userId, quest.id, day],
        );
        if (!res.rowCount)
          throw new HttpProblem('quest_not_done', 'Not finished, or already claimed');
        const reward = await grantReward(c, auth.userId, {
          xp: quest.xp,
          gold: quest.gold,
          reason: 'hub_quest',
          refId: randomUUID(),
          source: 'hub',
        });
        return { reward, ...(await todaysQuests(c, auth.userId)) };
      });
    },
  );

  /** What a player has achieved in the town, with progress towards the rest. */
  app.get('/v1/hub/achievements', async (req) => {
    const auth = requireAuth(req);
    const { rows } = await db.query<Record<Exclude<AchievementStat, 'bestSeasonRank'>, number>>(
      `SELECT
         (SELECT count(*) FROM hub_activities WHERE user_id = $1 AND kind = 'training')::int AS trainings,
         (SELECT count(*) FROM hub_activities WHERE user_id = $1 AND kind = 'arena_ranked' AND won)::int AS "rankedWins",
         (SELECT count(*) FROM hub_listings WHERE seller_id = $1 AND status = 'sold')::int AS sales,
         (SELECT count(*) FROM hub_listings WHERE buyer_id = $1)::int AS purchases,
         coalesce((SELECT jsonb_array_length(layout) FROM hub_houses WHERE owner_id = $1), 0)::int AS furniture,
         (SELECT count(*) FROM mission_progress WHERE user_id = $1 AND mission_id LIKE 'hub:%' AND rewarded_at IS NOT NULL)::int AS quests,
         (SELECT count(*) FROM hub_tournament_entries e JOIN hub_tournaments t ON t.id = e.tournament_id
           WHERE e.user_id = $1 AND t.status = 'done')::int AS tournaments,
         (SELECT count(*) FROM hub_tournament_entries WHERE user_id = $1 AND place = 1)::int AS "tournamentWins"`,
      [auth.userId],
    );
    const seasons = await pastSeasons(db, auth.userId);
    const stats = {
      ...rows[0]!,
      bestSeasonRank: seasons.length ? Math.min(...seasons.map((s) => s.rank)) : null,
    };
    return {
      achievements: ACHIEVEMENTS.map((a) => {
        const v = stats[a.stat];
        const done = a.stat === 'bestSeasonRank' ? v !== null && v <= a.goal : (v ?? 0) >= a.goal;
        return { id: a.id, goal: a.goal, value: v, done };
      }),
    };
  });

  /** The open tournament of your age group, and the last one played. */
  app.get('/v1/hub/tournament', async (req) => {
    const auth = requireAuth(req);
    await ensureTournaments(db);
    const { rows: me } = await db.query<{ adult: boolean }>(
      `SELECT age_band = '18+' AS adult FROM users WHERE id = $1`,
      [auth.userId],
    );
    const adult = me[0]?.adult ?? false;
    const open = await db.query<{ id: string; starts_at: Date; entrants: number }>(
      `SELECT t.id, t.starts_at,
              (SELECT count(*) FROM hub_tournament_entries e WHERE e.tournament_id = t.id)::int AS entrants
         FROM hub_tournaments t WHERE t.status = 'open' AND t.adult = $1`,
      [adult],
    );
    const cur = open.rows[0]!;
    const mine = await db.query<{ creature_id: string }>(
      `SELECT creature_id FROM hub_tournament_entries WHERE tournament_id = $1 AND user_id = $2`,
      [cur.id, auth.userId],
    );
    const last = await db.query<{
      id: string;
      finished_at: Date;
      bracket: { rounds: Match[][]; final: unknown };
    }>(
      `SELECT id, finished_at, bracket FROM hub_tournaments
        WHERE status = 'done' AND adult = $1 ORDER BY finished_at DESC LIMIT 1`,
      [adult],
    );
    let lastView = null;
    const l = last.rows[0];
    if (l) {
      const e = await db.query<{
        user_id: string;
        name: string;
        place: number | null;
        prize: number;
      }>(
        `SELECT e.user_id, p.display_name AS name, e.place, e.prize
           FROM hub_tournament_entries e JOIN players p ON p.user_id = e.user_id
          WHERE e.tournament_id = $1`,
        [l.id],
      );
      const name = new Map(e.rows.map((r) => [r.user_id, r.name]));
      const n = (u: string | null) => (u ? (name.get(u) ?? '?') : null);
      const my = e.rows.find((r) => r.user_id === auth.userId);
      lastView = {
        id: l.id,
        finishedAt: l.finished_at.toISOString(),
        champion: n(e.rows.find((r) => r.place === 1)?.user_id ?? null),
        rounds: l.bracket.rounds.map((r) =>
          r.map((m) => ({ a: n(m.a), b: n(m.b), winner: n(m.winner), turns: m.turns })),
        ),
        myPlace: my ? my.place : null,
        myPrize: my ? my.prize : 0,
        entered: Boolean(my),
      };
    }
    return {
      current: {
        id: cur.id,
        startsAt: cur.starts_at.toISOString(),
        entrants: cur.entrants,
        min: cfg().tournamentMin,
        max: cfg().tournamentMax,
        myCreature: mine.rows[0]?.creature_id ?? null,
      },
      last: lastView,
      prizes: TOURNAMENT_PRIZES,
    };
  });

  /** Signs up (or changes creature) for the open tournament, from inside the arena. */
  app.post<{ Body: Static<typeof JoinBody> }>(
    '/v1/hub/tournament/join',
    { schema: { body: JoinBody }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      if (!inRoom(auth.userId, 'arena'))
        throw new HttpProblem('hub_not_here', 'Sign up in the arena');
      await ensureTournaments(db);
      return withTx(db, async (c) => {
        const { rows } = await c.query<{ id: string; entrants: number; joined: boolean }>(
          `SELECT t.id,
                  (SELECT count(*) FROM hub_tournament_entries e WHERE e.tournament_id = t.id)::int AS entrants,
                  EXISTS (SELECT 1 FROM hub_tournament_entries e WHERE e.tournament_id = t.id AND e.user_id = $1) AS joined
             FROM hub_tournaments t JOIN users u ON u.id = $1
            WHERE t.status = 'open' AND t.adult = (u.age_band = '18+') AND t.starts_at > now()
            FOR UPDATE OF t`,
          [auth.userId],
        );
        const t = rows[0];
        if (!t) throw new HttpProblem('tournament_closed', 'Sign-ups are closed');
        if (!t.joined && t.entrants >= cfg().tournamentMax)
          throw new HttpProblem('tournament_closed', 'The tournament is full');
        if (!(await loadOwned(c, auth.userId, req.body.creature)))
          throw new HttpProblem('not_found', 'Unknown creature');
        await c.query(
          `INSERT INTO hub_tournament_entries (tournament_id, user_id, creature_id) VALUES ($1, $2, $3)
           ON CONFLICT (tournament_id, user_id) DO UPDATE SET creature_id = $3`,
          [t.id, auth.userId, req.body.creature],
        );
        if (!t.joined) await bumpHubQuest(c, auth.userId, 'tournament_join');
        return { joined: true, tournament: t.id };
      });
    },
  );

  app.delete('/v1/hub/tournament/join', async (req, reply) => {
    const auth = requireAuth(req);
    await db.query(
      `DELETE FROM hub_tournament_entries e USING hub_tournaments t
        WHERE e.tournament_id = t.id AND t.status = 'open' AND e.user_id = $1`,
      [auth.userId],
    );
    return reply.code(204).send();
  });

  /** Arena seasons: the current one and how this player finished the earlier ones. */
  app.get('/v1/hub/seasons', async (req) => {
    const auth = requireAuth(req);
    await rollSeason(db, auth.userId);
    return { current: arenaSeason(), past: await pastSeasons(db, auth.userId) };
  });
}
