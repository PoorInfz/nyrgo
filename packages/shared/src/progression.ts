import type { Stats } from './content/creatures.js';
import { DEFAULT_CONFIG, type EconomyConfig } from './config.js';

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

export const MAX_CREATURE_LEVEL = 50;

/** Total XP a creature needs for a level: 0, 40, 120, 240, … (20·L·(L−1)). */
export function creatureXpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_CREATURE_LEVEL, Math.floor(level)));
  return 20 * l * (l - 1);
}

export function creatureLevelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_CREATURE_LEVEL && xp >= creatureXpForLevel(level + 1)) level++;
  return level;
}

/** XP a creature earns for wearing out a wild creature of `foeLevel`. */
export function battleXp(
  foeLevel: number,
  economy: Pick<EconomyConfig, 'creatureBattleXp'> = DEFAULT_CONFIG.economy,
): number {
  const x = economy.creatureBattleXp;
  return x.base + foeLevel * x.perFoeLevel;
}

/**
 * Creatures recover outside battle: this fraction of their maximum HP every `minutes`, even
 * from zero, so nobody is stuck without a shop.
 */
export const REST_HEAL = { fraction: 0.1, minutes: 5 } as const;

export function restedHp(stored: number, max: number, minutesSince: number): number {
  const steps = Math.floor(Math.max(0, minutesSince) / REST_HEAL.minutes);
  return Math.min(max, stored + Math.ceil(steps * REST_HEAL.fraction * max));
}

/**
 * Capture bonus for a creature worn down in battle: ×1 at full HP up to ×2 at zero.
 */
export function weaknessFactor(hp: number, max: number): number {
  if (max <= 0) return 1;
  return 1 + (1 - Math.min(1, Math.max(0, hp / max)));
}
