import { describe, expect, it } from 'vitest';
import {
  CREATURES,
  DEFAULT_CONFIG,
  MAX_PLAYER_LEVEL,
  captureChance,
  captureFactor,
  instanceStats,
  levelForXp,
  xpForLevel,
} from '../src/index.js';

describe('progression', () => {
  it('uses the level curve 0, 100, 300, 600, 1000 and inverts it', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(350)).toBe(3);
    expect(levelForXp(10 ** 9)).toBe(MAX_PLAYER_LEVEL);
    for (let l = 1; l <= MAX_PLAYER_LEVEL; l++) expect(levelForXp(xpForLevel(l))).toBe(l);
  });

  it('grows creature stats with level and individual values', () => {
    const base = CREATURES[0]!.stats;
    const zero = { hp: 0, atk: 0, def: 0, spd: 0 };
    const max = { hp: 15, atk: 15, def: 15, spd: 15 };
    const l5 = instanceStats(base, 5, zero);
    const l30 = instanceStats(base, 30, zero);
    for (const k of ['hp', 'atk', 'def', 'spd'] as const) {
      expect(l30[k]).toBeGreaterThan(l5[k]);
      expect(instanceStats(base, 5, max)[k] - l5[k]).toBe(15);
    }
  });

  it('keeps the creature factor within 0.48–1.2 and capture chances within the configured bounds', () => {
    const cap = DEFAULT_CONFIG.capture;
    for (const c of CREATURES) {
      for (const level of [1, 10, 35, 100]) {
        const f = captureFactor(c.captureDifficulty, level);
        expect(f).toBeGreaterThanOrEqual(0.48);
        expect(f).toBeLessThanOrEqual(1.2);
        for (const mult of [1, 1.5, 2]) {
          for (const skill of [0, 1]) {
            const p = captureChance(cap, c.rarity, mult, f, skill);
            expect(p).toBeGreaterThanOrEqual(cap.minChance);
            expect(p).toBeLessThanOrEqual(cap.maxChance);
          }
        }
      }
    }
    // better vaults and better throws never make things worse
    const f = captureFactor(50, 10);
    expect(captureChance(cap, 'rare', 2, f, 0)).toBeGreaterThan(
      captureChance(cap, 'rare', 1, f, 0),
    );
    expect(captureChance(cap, 'rare', 1, f, 1)).toBeGreaterThan(
      captureChance(cap, 'rare', 1, f, 0),
    );
  });

  it('starts every player with a kit that only holds known items', () => {
    expect(Object.keys(DEFAULT_CONFIG.capture.starterKit)).toEqual(['vault-basic', 'patch']);
  });
});
