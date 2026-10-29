import type { PoolClient } from 'pg';
import { DEFAULT_CONFIG, levelForXp } from '@nyrgo/shared';

/**
 * Grants XP and Gold for gameplay. Gold goes through the append-only ledger and respects the
 * daily gameplay cap (counted per calendar day in Europe/Madrid, the pilot city's time zone).
 * Levelling up pays `levelUpGoldPerLevel × new level`, also within the cap.
 */
export interface RewardResult {
  xp: number;
  gold: number;
  level: number;
  leveledUp: boolean;
  /** Gold that would have been paid but was cut by the daily cap. */
  goldCapped: number;
}

export const GAME_TZ = 'Europe/Madrid';

export async function grantReward(
  c: PoolClient,
  userId: string,
  reward: { xp: number; gold: number; reason: string; refId: string },
): Promise<RewardResult> {
  const eco = DEFAULT_CONFIG.economy;
  const { rows } = await c.query<{ xp: string; level: number }>(
    `SELECT xp, level FROM players WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  const before = rows[0]!;
  const xp = Number(before.xp) + reward.xp;
  const level = Math.max(before.level, levelForXp(xp));
  let levelGold = 0;
  for (let l = before.level + 1; l <= level; l++) levelGold += eco.rewards.levelUpGoldPerLevel * l;

  const { rows: earned } = await c.query<{ sum: string }>(
    `SELECT COALESCE(sum(amount), 0) AS sum FROM gold_ledger
      WHERE user_id = $1 AND amount > 0
        AND created_at >= (date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2)`,
    [userId, GAME_TZ],
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
    `UPDATE players SET xp = $2, level = $3, gold = gold + $4, version = version + 1, updated_at = now()
      WHERE user_id = $1`,
    [userId, xp, level, paid],
  );
  return {
    xp: reward.xp,
    gold: paid,
    level,
    leveledUp: level > before.level,
    goldCapped: reward.gold + levelGold - paid,
  };
}
