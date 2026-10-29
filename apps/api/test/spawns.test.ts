import { describe, expect, it } from 'vitest';
import { CREATURES_BY_ID, DEFAULT_CONFIG, type Biome } from '@nyrgo/shared';
import { cellWindow, generateCell, sfc32 } from '../src/modules/spawns/generate.js';

const cfg = DEFAULT_CONFIG.spawns;
const LIFETIME = DEFAULT_CONFIG.world.spawnLifetimeMin * 60_000;
const cell = (i: number) => `89390ca${(0x3000 + i).toString(16)}fffff`;
const info = (i: number, biome: Biome = 'park') => ({
  cell: cell(i),
  lat: 37.88,
  lng: -4.78,
  biome,
});

/** Metres between two points close together. */
const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

/** JSON with bigint seeds. */
const json = (v: unknown) =>
  JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x));

describe('spawn generation', () => {
  it('is deterministic for the same secret, cell and window', () => {
    const a = generateCell('secret-one-0000000', info(1), 1_000_000, cfg);
    const b = generateCell('secret-one-0000000', info(1), 1_000_000, cfg);
    expect(a).toEqual(b);
  });

  it('changes with the secret and with the window, so clients cannot predict it', () => {
    let sameSecret = 0;
    let sameWindow = 0;
    for (let i = 0; i < 200; i++) {
      const base = json(generateCell('secret-one-0000000', info(i), 0, cfg));
      if (base === json(generateCell('secret-two-0000000', info(i), 0, cfg))) sameSecret++;
      if (base === json(generateCell('secret-one-0000000', info(i), LIFETIME, cfg))) sameWindow++;
    }
    // empty cells match by chance; anything more would mean the inputs are ignored
    expect(sameSecret).toBeLessThan(20);
    expect(sameWindow).toBeLessThan(20);
  });

  it('respects the slots per biome, the offset limit and the level ranges', () => {
    for (let i = 0; i < 500; i++) {
      for (const biome of ['urban', 'park', 'historic', 'culture'] as const) {
        const out = generateCell('s'.repeat(20), info(i, biome), i * LIFETIME, cfg);
        expect(out.length).toBeLessThanOrEqual(cfg.slotsByBiome[biome]);
        expect(new Set(out.map((s) => s.seed)).size).toBe(out.length);
        for (const s of out) {
          expect(metres(s, info(i))).toBeLessThanOrEqual(cfg.maxOffsetM + 0.01);
          const def = CREATURES_BY_ID.get(s.definitionId)!;
          const [min, max] = cfg.levelByStage[def.stage];
          expect(s.level).toBeGreaterThanOrEqual(min);
          expect(s.level).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it('never spawns legendary or mythic creatures and follows the rarity weights', () => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (let i = 0; i < 4000; i++) {
      for (const s of generateCell('weights-secret-000', info(i), 0, cfg)) {
        const r = CREATURES_BY_ID.get(s.definitionId)!.rarity;
        counts[r] = (counts[r] ?? 0) + 1;
        total++;
      }
    }
    expect(counts.legendary ?? 0).toBe(0);
    expect(counts.mythic ?? 0).toBe(0);
    const weights = cfg.rarityWeights;
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [r, w] of Object.entries(weights)) {
      expect(Math.abs((counts[r] ?? 0) / total - w / sum)).toBeLessThan(0.03);
    }
    // about slotChance of the slots are filled
    expect(total / (4000 * cfg.slotsByBiome.park)).toBeCloseTo(cfg.slotChance, 1);
  });

  it('prefers creatures that live in the biome', () => {
    let local = 0;
    let all = 0;
    for (let i = 0; i < 2000; i++) {
      for (const s of generateCell('biome-secret-00000', info(i, 'historic'), 0, cfg)) {
        all++;
        if (CREATURES_BY_ID.get(s.definitionId)!.biomes.includes('historic')) local++;
      }
    }
    expect(local / all).toBeGreaterThan(0.9);
  });

  it('staggers windows per cell and always contains "now"', () => {
    const now = 1_761_700_000_000;
    const starts = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const w = cellWindow(cell(i), now, LIFETIME);
      expect(w.start).toBeLessThanOrEqual(now);
      expect(w.end).toBeGreaterThan(now);
      expect(w.end - w.start).toBe(LIFETIME);
      starts.add(w.start);
      // stable inside the window, next one right after
      expect(cellWindow(cell(i), w.end - 1, LIFETIME)).toEqual(w);
      expect(cellWindow(cell(i), w.end, LIFETIME).start).toBe(w.end);
    }
    expect(starts.size).toBeGreaterThan(40);
  });

  it('uses a PRNG with values in [0, 1)', () => {
    const r = sfc32(1, 2, 3, 4);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
