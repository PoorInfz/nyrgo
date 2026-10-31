import type { PoolClient } from 'pg';
import tzLookup from '@photostructure/tz-lookup';
import { DEFAULT_CONFIG, countedXp, levelForXp } from '@nyrgo/shared';
import type { Db } from '../../db.js';

/**
 * Grants XP and Gold for gameplay. Gold goes through the append-only ledger and respects the
 * daily gameplay cap (counted per calendar day in the player's local time zone).
 * Levelling up pays `levelUpGoldPerLevel × new level`, also within the cap.
 *
 * XP is kept by source: `main` (the outdoor game, the default) and `hub` (the town). The level
 * follows the counted XP, where hub XP counts only up to its configured share (see
 * `countedXp`), so the town can never carry a player more than half way.
 */
export interface RewardResult {
  xp: number;
  gold: number;
  level: number;
  leveledUp: boolean;
  /** Gold that would have been paid but was cut by the daily cap. */
  goldCapped: number;
}

/** Players who have not shared a location yet count days in the pilot city's zone. */
export const DEFAULT_TZ = 'Europe/Madrid';

/** SQL for "the player's time zone", with the player id as `$1`. */
export const PLAYER_TZ_SQL = `coalesce((SELECT time_zone FROM players WHERE user_id = $1), '${DEFAULT_TZ}')`;

/** The IANA time zone at a point (offline lookup), or null if unknown to this runtime. */
export function timeZoneAt(lat: number, lng: number): string | null {
  try {
    const tz = tzLookup(lat, lng);
    new Intl.DateTimeFormat('en', { timeZone: tz }); // throws for a zone the runtime lacks
    return tz;
  } catch {
    return null;
  }
}

/** Keeps the player's zone in step with where they play (a no-op when unchanged). */
export async function updateTimeZone(
  q: Db | PoolClient,
  userId: string,
  lat: number,
  lng: number,
): Promise<void> {
  const tz = timeZoneAt(lat, lng);
  if (!tz) return;
  await q.query(`UPDATE players SET time_zone = $2 WHERE user_id = $1 AND time_zone <> $2`, [
    userId,
    tz,
  ]);
}

export async function grantReward(
  c: PoolClient,
  userId: string,
  reward: {
    xp: number;
    gold: number;
    reason: string;
    refId: string;
    source?: 'main' | 'hub';
  },
): Promise<RewardResult> {
  const eco = DEFAULT_CONFIG.economy;
  const { rows } = await c.query<{ main_xp: string; hub_xp: string; level: number }>(
    `SELECT main_xp, hub_xp, level FROM players WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  const before = rows[0]!;
  const gain = Math.max(0, Math.floor(reward.xp));
  const mainXp = Number(before.main_xp) + (reward.source === 'hub' ? 0 : gain);
  const hubXp = Number(before.hub_xp) + (reward.source === 'hub' ? gain : 0);
  const xp = countedXp(mainXp, hubXp, DEFAULT_CONFIG.hub.maxXpShare);
  const level = Math.max(before.level, levelForXp(xp));
  let levelGold = 0;
  for (let l = before.level + 1; l <= level; l++) levelGold += eco.rewards.levelUpGoldPerLevel * l;

  const { rows: earned } = await c.query<{ sum: string }>(
    `SELECT COALESCE(sum(amount), 0) AS sum FROM gold_ledger
      WHERE user_id = $1 AND amount > 0 AND reason NOT LIKE 'market%'
        AND created_at >= (date_trunc('day', now() AT TIME ZONE ${PLAYER_TZ_SQL}) AT TIME ZONE ${PLAYER_TZ_SQL})`,
    [userId],
  );
  const room = Math.max(0, eco.dailyGameplayGoldCap - Number(earned[0]!.sum));
  const wanted = [
    { amount: reward.gold, reason: reward.reason },
    { amount: levelGold, reason: 'level_up' },
  ];
  let left = room;
  let paid = 0;
  for (const w of wanted) {
    const amount = Math.min(w.amount, left);
    if (amount <= 0) continue;
    await c.query(
      `INSERT INTO gold_ledger (user_id, amount, reason, ref_id) VALUES ($1, $2, $3, $4)`,
      [userId, amount, w.reason, reward.refId],
    );
    left -= amount;
    paid += amount;
  }
  await c.query(
    `UPDATE players SET xp = $2, level = $3, gold = gold + $4, main_xp = $5, hub_xp = $6,
            version = version + 1, updated_at = now()
      WHERE user_id = $1`,
    [userId, xp, level, paid, mainXp, hubXp],
  );
  return {
    xp: reward.xp,
    gold: paid,
    level,
    leveledUp: level > before.level,
    goldCapped: reward.gold + levelGold - paid,
  };
}
