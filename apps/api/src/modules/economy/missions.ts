import type { PoolClient } from 'pg';
import { dailyMissions, missionStep, type MissionDef } from '@nyrgo/shared';
import type { Db } from '../../db.js';
import { GAME_TZ } from '../progress/rewards.js';

type Q = Db | PoolClient;
export type MissionEvent =
  { kind: 'catch'; creatureId: string } | { kind: 'win' } | { kind: 'visit' } | { kind: 'throw' };

/** Today's date in the game's time zone, `YYYY-MM-DD`. */
export async function gameDay(q: Q): Promise<string> {
  const { rows } = await q.query<{ day: string }>(
    `SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM-DD') AS day`,
    [GAME_TZ],
  );
  return rows[0]!.day;
}

/** Moves today's missions forward for a game event; extra progress past the target is ignored. */
export async function bumpMissions(
  c: PoolClient,
  userId: string,
  event: MissionEvent,
): Promise<void> {
  const day = await gameDay(c);
  for (const m of dailyMissions(userId, day)) {
    const step = missionStep(m, event);
    if (step === 0) continue;
    await c.query(
      `INSERT INTO mission_progress (user_id, mission_id, period_start, progress, completed_at)
       VALUES ($1, $2, $3::date, LEAST($4::int, $5::int), CASE WHEN $4::int >= $5::int THEN now() END)
       ON CONFLICT (user_id, mission_id, period_start) DO UPDATE SET
         progress = LEAST(mission_progress.progress + $4::int, $5::int),
         completed_at = COALESCE(mission_progress.completed_at,
                                 CASE WHEN mission_progress.progress + $4::int >= $5::int THEN now() END)`,
      [userId, m.id, day, step, m.target],
    );
  }
}

export interface MissionView extends MissionDef {
  progress: number;
  completed: boolean;
  rewarded: boolean;
}

export async function todaysMissions(
  q: Q,
  userId: string,
): Promise<{ day: string; missions: MissionView[] }> {
  const day = await gameDay(q);
  const picked = dailyMissions(userId, day);
  const { rows } = await q.query<{
    mission_id: string;
    progress: number;
    completed_at: Date | null;
    rewarded_at: Date | null;
  }>(
    `SELECT mission_id, progress, completed_at, rewarded_at FROM mission_progress
      WHERE user_id = $1 AND period_start = $2::date`,
    [userId, day],
  );
  const byId = new Map(rows.map((r) => [r.mission_id, r]));
  return {
    day,
    missions: picked.map((m) => {
      const r = byId.get(m.id);
      return {
        ...m,
        progress: r?.progress ?? 0,
        completed: !!r?.completed_at,
        rewarded: !!r?.rewarded_at,
      };
    }),
  };
}
