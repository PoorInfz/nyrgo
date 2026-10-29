import { describe, expect, it } from 'vitest';
import {
  CREATURES,
  CREATURES_BY_ID,
  DEFAULT_CONFIG,
  ITEMS_BY_ID,
  MISSIONS,
  POI_LOOT,
  RECIPES,
  dailyMissions,
  evolutionBlock,
  missionStep,
  rollPoiLoot,
  seededRandom,
} from '../src/index.js';

describe('place loot', () => {
  it('only gives known items, within the configured gold and item counts', () => {
    const r = DEFAULT_CONFIG.economy.rewards.poiInteract;
    for (const id of Object.keys(POI_LOOT)) expect(ITEMS_BY_ID.has(id), id).toBe(true);
    const rand = seededRandom('loot');
    for (let i = 0; i < 500; i++) {
      const l = rollPoiLoot(rand);
      expect(l.gold).toBeGreaterThanOrEqual(r.goldMin);
      expect(l.gold).toBeLessThanOrEqual(r.goldMax);
      const n = Object.values(l.items).reduce((a, b) => a + b, 0);
      expect(n).toBeGreaterThanOrEqual(r.itemsMin);
      expect(n).toBeLessThanOrEqual(r.itemsMax);
    }
  });

  it('gives every evolution material sometimes, and basic vaults most often', () => {
    const rand = seededRandom('loot2');
    const seen: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      for (const [id, n] of Object.entries(rollPoiLoot(rand).items)) seen[id] = (seen[id] ?? 0) + n;
    }
    for (const m of ['hash-shard', 'moon-dust', 'vault-frost', 'yield-seed'])
      expect(seen[m]).toBeGreaterThan(0);
    const top = Object.entries(seen).sort((a, b) => b[1] - a[1])[0]![0];
    expect(top).toBe('vault-basic');
  });
});

describe('daily missions', () => {
  it('picks three missions of different kinds, the same all day', () => {
    const a = dailyMissions('user-1', '2026-10-29');
    expect(a).toHaveLength(DEFAULT_CONFIG.economy.rewards.dailyMission.perDay);
    expect(new Set(a.map((m) => m.kind)).size).toBe(a.length);
    expect(dailyMissions('user-1', '2026-10-29')).toEqual(a);
  });

  it('varies between days and players', () => {
    const days = new Set<string>();
    for (let d = 1; d <= 20; d++) {
      days.add(
        dailyMissions('user-1', `2026-11-${String(d).padStart(2, '0')}`)
          .map((m) => m.id)
          .join(),
      );
    }
    expect(days.size).toBeGreaterThan(10);
    expect(dailyMissions('user-2', '2026-10-29')).not.toEqual(
      dailyMissions('user-3', '2026-10-29'),
    );
  });

  it('counts the right events', () => {
    const byId = new Map(MISSIONS.map((m) => [m.id, m]));
    expect(missionStep(byId.get('catch-3')!, { kind: 'catch', creatureId: 'gwisp' })).toBe(1);
    expect(missionStep(byId.get('catch-3')!, { kind: 'win' })).toBe(0);
    expect(missionStep(byId.get('catch-electric')!, { kind: 'catch', creatureId: 'gwisp' })).toBe(
      1,
    );
    expect(
      missionStep(byId.get('catch-electric')!, { kind: 'catch', creatureId: 'frostkey' }),
    ).toBe(0);
    expect(missionStep(byId.get('visit-3')!, { kind: 'visit' })).toBe(1);
    expect(missionStep(byId.get('throw-10')!, { kind: 'throw' })).toBe(1);
    expect(missionStep(byId.get('win-2')!, { kind: 'win' })).toBe(1);
  });

  it('only asks for elements that can be caught in the wild', () => {
    for (const m of MISSIONS.filter((x) => x.kind === 'catch_element')) {
      expect(
        CREATURES.some((c) => c.wild && c.element === m.element),
        m.id,
      ).toBe(true);
    }
  });
});

describe('evolution conditions', () => {
  it('needs the level for level evolutions and the days for the HODL evolution', () => {
    const gwisp = CREATURES_BY_ID.get('gwisp')!;
    expect(evolutionBlock(gwisp, 15, 100)).toBe('level');
    expect(evolutionBlock(gwisp, 16, 0)).toBeNull();
    const paper = CREATURES_BY_ID.get('paperpaw')!;
    expect(evolutionBlock(paper, 50, 29.9)).toBe('hold_days');
    expect(evolutionBlock(paper, 1, 30)).toBeNull();
    expect(evolutionBlock(CREATURES_BY_ID.get('gaswarlord')!, 50, 999)).toBe('no_evolution');
  });

  it('asks only for materials a place can give', () => {
    for (const c of CREATURES) {
      for (const m of Object.keys(c.evolution?.materials ?? {}))
        expect(POI_LOOT[m], `${c.id}: ${m}`).toBeGreaterThan(0);
    }
    for (const r of RECIPES) {
      for (const m of Object.keys(r.inputs)) {
        const item = ITEMS_BY_ID.get(m)!;
        // every input is either sold, found at places or itself crafted
        expect(
          item.price !== null || POI_LOOT[m] !== undefined || RECIPES.some((x) => x.output === m),
          m,
        ).toBe(true);
      }
    }
  });
});
