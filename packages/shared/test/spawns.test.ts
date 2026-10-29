import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, encounterLevel, pickWild, seededRandom } from '../src/index.js';

describe('wild spawns', () => {
  const cfg = DEFAULT_CONFIG.spawns;

  // Weights apply among the candidates of one rarity and biome; rarity already decides most of
  // the stage (uncommons in town are all second forms), so compare with and without them.
  const stageShare = (c: typeof cfg, seed: string) => {
    const rand = seededRandom(seed);
    const n = { 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < 4000; i++) n[pickWild(c, 'urban', rand(), rand(), rand()).def.stage]++;
    return { 1: n[1] / 4000, 3: n[3] / 4000 };
  };

  it('makes evolved forms rarer in the wild than an even pick would', () => {
    const flat = { ...cfg };
    delete flat.stageWeights;
    const weighted = stageShare(cfg, 'stages');
    const even = stageShare(flat, 'stages');
    expect(weighted[1]).toBeGreaterThan(even[1]);
    expect(weighted[3]).toBeLessThan(even[3] / 2);
  });

  it('keeps levels inside the stage range', () => {
    const rand = seededRandom('levels');
    for (let i = 0; i < 500; i++) {
      const { def, level } = pickWild(cfg, 'park', rand(), rand(), rand());
      const [min, max] = cfg.levelByStage[def.stage];
      expect(level).toBeGreaterThanOrEqual(min);
      expect(level).toBeLessThanOrEqual(max);
    }
  });

  it('meets a player at most the configured levels above their own', () => {
    const above = cfg.wildLevelAbovePlayer!;
    expect(encounterLevel(cfg, 30, 1)).toBe(1 + above);
    expect(encounterLevel(cfg, 5, 20)).toBe(5);
    expect(encounterLevel({ ...cfg, wildLevelAbovePlayer: null }, 30, 1)).toBe(30);
  });
});
