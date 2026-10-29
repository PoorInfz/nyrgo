import type { Stats } from './content/creatures.js';

/**
 * Player and creature progression shared by the API (authoritative) and the client (display).
 */

export const MAX_PLAYER_LEVEL = 50;

/** Total XP needed to reach a player level: 0, 100, 300, 600, 1000, … (50·L·(L−1)). */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_PLAYER_LEVEL, Math.floor(level)));
  return 50 * l * (l - 1);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_PLAYER_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** Individual values: 0–15 per stat, rolled once when a creature joins a collection. */
export type Ivs = Stats;
export const MAX_IV = 15;

/** Stats of one creature at a level. Grows linearly: half the base at level 0, double at 75. */
export function instanceStats(base: Stats, level: number, ivs: Ivs): Stats {
  const k = (1 + level / 25) / 2;
  return {
    hp: Math.round(base.hp * k + ivs.hp + level),
    atk: Math.round(base.atk * k + ivs.atk),
    def: Math.round(base.def * k + ivs.def),
    spd: Math.round(base.spd * k + ivs.spd),
  };
}

/**
 * Multiplier on the capture chance from the creature itself: harder designs and higher levels
 * are harder to store. Difficulty is 1–100; the result stays between 0.48 and 1.2.
 */
export function captureFactor(difficulty: number, level: number): number {
  const d = 1.2 - (0.4 * Math.min(100, Math.max(1, difficulty))) / 100;
  const l = Math.max(0.6, 1 - (Math.max(1, level) - 1) * 0.01);
  return d * l;
}
