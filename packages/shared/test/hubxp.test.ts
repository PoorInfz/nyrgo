import { describe, expect, it } from 'vitest';
import {
  MAX_PLAYER_LEVEL,
  countedXp,
  hubXpCounted,
  levelForXp,
  progressBreakdown,
  xpForLevel,
} from '../src/index.js';

describe('the hub counts for at most half of the progression', () => {
  it('counts hub XP only up to the XP earned outdoors', () => {
    expect(hubXpCounted(1000, 400)).toBe(400);
    expect(hubXpCounted(1000, 5000)).toBe(1000);
    expect(hubXpCounted(0, 5000)).toBe(0);
    expect(countedXp(1000, 5000)).toBe(2000);
  });

  it('never lets the hub be more than half of the counted XP, at any level of the curve', () => {
    for (let main = 0; main <= xpForLevel(MAX_PLAYER_LEVEL); main += 977) {
      for (const hub of [0, 1, main / 2, main, main * 3, 1e7]) {
        const b = progressBreakdown(main, Math.floor(hub));
        expect(b.hubCounted).toBeLessThanOrEqual(b.xp - b.hubCounted);
        expect(b.hubShare).toBeLessThanOrEqual(0.5);
        expect(b.hubCounted + b.hubWaiting).toBe(Math.floor(hub));
      }
    }
  });

  it('cannot level up with the hub alone', () => {
    expect(levelForXp(countedXp(0, 1_000_000))).toBe(1);
    // reaching level 20 needs at least half its XP from outdoors
    const need = xpForLevel(20);
    expect(levelForXp(countedXp(need / 2 - 1, need))).toBeLessThan(20);
    expect(levelForXp(countedXp(need / 2, need))).toBe(20);
  });

  it('follows another share when configured', () => {
    expect(hubXpCounted(900, 10_000, 0.25)).toBe(300);
    expect(hubXpCounted(900, 10_000, 0)).toBe(0);
  });
});
