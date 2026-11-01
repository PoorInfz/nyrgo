import type { Db } from '../../db.js';

/**
 * Playtest metrics for the admin panel, all counted from what the game already stores plus one
 * row per player per active day. Days are UTC. Deleted accounts are left out.
 */
export async function playtestMetrics(db: Db, days: number) {
  const q = async <T>(sql: string, params: unknown[] = []) =>
    (await db.query<T & Record<string, unknown>>(sql, params)).rows;

  const [totals] = await q<{
    players: number;
    registered: number;
    adults: number;
    today: number;
    week: number;
  }>(
    `SELECT count(*)::int AS players,
            count(*) FILTER (WHERE kind = 'registered')::int AS registered,
            count(*) FILTER (WHERE age_band = '18+')::int AS adults,
            (SELECT count(*)::int FROM player_days WHERE day = (now() AT TIME ZONE 'UTC')::date) AS today,
            (SELECT count(DISTINCT user_id)::int FROM player_days
              WHERE day > (now() AT TIME ZONE 'UTC')::date - 7) AS week
       FROM users WHERE status = 'active'`,
  );

  // one row per day: who played, who joined, and what they did
  const daily = await q<{
    day: string;
    active: number;
    new: number;
    encounters: number;
    throws: number;
    catches: number;
    battles: number;
    town: number;
    feedback: number;
  }>(
    `WITH d AS (
       SELECT generate_series((now() AT TIME ZONE 'UTC')::date - ($1::int - 1),
                              (now() AT TIME ZONE 'UTC')::date, interval '1 day')::date AS day),
     act AS (SELECT p.day, count(*) AS n FROM player_days p
              WHERE p.day >= (now() AT TIME ZONE 'UTC')::date - ($1::int - 1) GROUP BY p.day),
     joined AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n FROM users
                 WHERE status = 'active' AND created_at >= now() - make_interval(days => $1) GROUP BY 1),
     enc AS (SELECT (started_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n FROM encounters
              WHERE started_at >= now() - make_interval(days => $1) GROUP BY 1),
     thr AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n,
                    count(*) FILTER (WHERE success) AS caught FROM capture_attempts
              WHERE created_at >= now() - make_interval(days => $1) GROUP BY 1),
     bat AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n FROM battles
              WHERE created_at >= now() - make_interval(days => $1) GROUP BY 1),
     town AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n FROM hub_activities
               WHERE created_at >= now() - make_interval(days => $1) GROUP BY 1),
     fb AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n FROM feedback
             WHERE created_at >= now() - make_interval(days => $1) GROUP BY 1)
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            coalesce(act.n, 0)::int AS active, coalesce(joined.n, 0)::int AS new,
            coalesce(enc.n, 0)::int AS encounters, coalesce(thr.n, 0)::int AS throws,
            coalesce(thr.caught, 0)::int AS catches, coalesce(bat.n, 0)::int AS battles,
            coalesce(town.n, 0)::int AS town, coalesce(fb.n, 0)::int AS feedback
       FROM d
       LEFT JOIN act ON act.day = d.day
       LEFT JOIN joined ON joined.day = d.day
       LEFT JOIN enc ON enc.day = d.day
       LEFT JOIN thr ON thr.day = d.day
       LEFT JOIN bat ON bat.day = d.day
       LEFT JOIN town ON town.day = d.day
       LEFT JOIN fb ON fb.day = d.day
      ORDER BY d.day`,
    [days],
  );

  // classic retention: of the players who joined on a day, the share who came back on day N
  const cohorts = await q<{
    day: string;
    size: number;
    d1: number | null;
    d3: number | null;
    d7: number | null;
  }>(
    `WITH c AS (
       SELECT id, (created_at AT TIME ZONE 'UTC')::date AS day FROM users
        WHERE status = 'active'
          AND created_at > now() - make_interval(days => $1))
     SELECT to_char(c.day, 'YYYY-MM-DD') AS day, count(*)::int AS size,
            CASE WHEN c.day + 1 <= (now() AT TIME ZONE 'UTC')::date THEN
              round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM player_days p
                WHERE p.user_id = c.id AND p.day = c.day + 1)) / count(*))::int END AS d1,
            CASE WHEN c.day + 3 <= (now() AT TIME ZONE 'UTC')::date THEN
              round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM player_days p
                WHERE p.user_id = c.id AND p.day = c.day + 3)) / count(*))::int END AS d3,
            CASE WHEN c.day + 7 <= (now() AT TIME ZONE 'UTC')::date THEN
              round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM player_days p
                WHERE p.user_id = c.id AND p.day = c.day + 7)) / count(*))::int END AS d7
       FROM c GROUP BY c.day ORDER BY c.day DESC`,
    [days],
  );

  // the first steps of the players who joined in the window: where do they stop?
  const [funnel] = await q<{
    joined: number;
    starter: number;
    encounter: number;
    threw: number;
    caught: number;
    returned: number;
    week: number;
  }>(
    `WITH c AS (
       SELECT id, (created_at AT TIME ZONE 'UTC')::date AS day FROM users
        WHERE status = 'active' AND created_at > now() - make_interval(days => $1))
     SELECT count(*)::int AS joined,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM creature_instances i
              WHERE i.owner_id = c.id AND i.acquired_via = 'starter'))::int AS starter,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM encounters e WHERE e.user_id = c.id))::int AS encounter,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM capture_attempts a WHERE a.user_id = c.id))::int AS threw,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM capture_attempts a
              WHERE a.user_id = c.id AND a.success))::int AS caught,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM player_days p
              WHERE p.user_id = c.id AND p.day > c.day))::int AS returned,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM player_days p
              WHERE p.user_id = c.id AND p.day >= c.day + 7))::int AS week
       FROM c`,
    [days],
  );

  // the capture mini-game: how well people throw, and how often a throw catches
  const [throws] = await q<{
    throws: number;
    avg_skill: number | null;
    perfect: number;
    b0: number;
    b1: number;
    b2: number;
    b3: number;
    b4: number;
    catch_rate: number | null;
  }>(
    `SELECT count(*)::int AS throws,
            round(avg(skill_score)::numeric, 2)::float AS avg_skill,
            count(*) FILTER (WHERE skill_score >= 1)::int AS perfect,
            count(*) FILTER (WHERE skill_score < 0.2)::int AS b0,
            count(*) FILTER (WHERE skill_score >= 0.2 AND skill_score < 0.4)::int AS b1,
            count(*) FILTER (WHERE skill_score >= 0.4 AND skill_score < 0.6)::int AS b2,
            count(*) FILTER (WHERE skill_score >= 0.6 AND skill_score < 0.8)::int AS b3,
            count(*) FILTER (WHERE skill_score >= 0.8)::int AS b4,
            round(100.0 * count(*) FILTER (WHERE success) / nullif(count(*), 0))::int AS catch_rate
       FROM capture_attempts WHERE created_at > now() - make_interval(days => $1)`,
    [days],
  );
  const byRarity = await q<{ rarity: string; throws: number; catch_rate: number }>(
    `SELECT d.rarity, count(*)::int AS throws,
            round(100.0 * count(*) FILTER (WHERE a.success) / count(*))::int AS catch_rate
       FROM capture_attempts a
       JOIN spawns s ON s.id = a.spawn_id
       JOIN creature_definitions d ON d.id = s.definition_id
      WHERE a.created_at > now() - make_interval(days => $1)
      GROUP BY d.rarity`,
    [days],
  );

  // how much a player does on a day they play
  const [perDay] = await q<{
    player_days: number;
    catches_per_day: number | null;
    days_per_player: number | null;
  }>(
    `WITH pd AS (SELECT * FROM player_days WHERE day > (now() AT TIME ZONE 'UTC')::date - $1::int)
     SELECT (SELECT count(*)::int FROM pd) AS player_days,
            round((SELECT count(*) FROM capture_attempts WHERE success
                    AND created_at > now() - make_interval(days => $1))::numeric
                  / nullif((SELECT count(*) FROM pd), 0), 1)::float AS catches_per_day,
            round((SELECT count(*) FROM pd)::numeric
                  / nullif((SELECT count(DISTINCT user_id) FROM pd), 0), 1)::float AS days_per_player`,
    [days],
  );

  const [fb] = await q<{ open: number; bugs: number; ideas: number }>(
    `SELECT count(*) FILTER (WHERE status = 'open')::int AS open,
            count(*) FILTER (WHERE status = 'open' AND category = 'bug')::int AS bugs,
            count(*) FILTER (WHERE status = 'open' AND category = 'idea')::int AS ideas
       FROM feedback`,
  );

  return {
    days,
    totals,
    daily,
    cohorts,
    funnel,
    throws: { ...throws, byRarity },
    perDay,
    feedback: fb,
  };
}
