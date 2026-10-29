import { describe, expect, it } from 'vitest';
import {
  CREATURES,
  CREATURES_BY_ID,
  ELEMENTS,
  ELEMENT_INFO,
  ITEMS,
  ITEMS_BY_ID,
  PASSIVES_BY_ID,
  RARITIES,
  RECIPES,
  SKILLS,
  SKILLS_BY_ID,
  STARTERS,
  STAT_TOTAL,
  STRONG_AGAINST,
  effectiveness,
  effectivenessMatrix,
  weakAgainst,
} from '../src/index.js';

/**
 * Words that point at real franchises, brands, coins, people or owned memes. Approved
 * guardrail from the creature proposal: none of them may appear in a name or description.
 */
const BANNED = [
  'pokemon',
  'pokémon',
  'pikachu',
  'poke',
  'doge',
  'kabosu',
  'shib',
  'pepe',
  'wojak',
  'bitcoin',
  'btc',
  'ethereum',
  'ether',
  'solana',
  'near',
  'binance',
  'coinbase',
  'tether',
  'satoshi',
  'nakamoto',
  'vitalik',
  'buterin',
  'elon',
  'musk',
  'lambo',
  'lamborghini',
  'bored',
  'bayc',
  'punk',
  'yuga',
  'mt gox',
  'metamask',
  'ledger',
  'trezor',
];

const text = (c: (typeof CREATURES)[number]) =>
  `${c.name} ${c.lore.es} ${c.lore.en} ${c.inspiration}`.toLowerCase();

describe('element chart', () => {
  it('gives every element exactly two strengths and two weaknesses', () => {
    for (const e of ELEMENTS) {
      expect(STRONG_AGAINST[e]).toHaveLength(2);
      expect(weakAgainst(e)).toHaveLength(2);
      expect(STRONG_AGAINST[e]).not.toContain(e);
    }
  });

  it('is consistent in both directions and has no mutual counters', () => {
    for (const a of ELEMENTS) {
      for (const d of ELEMENTS) {
        const m = effectiveness(a, d);
        if (m === 2) expect(effectiveness(d, a)).toBe(0.5);
        if (m === 0.5) expect(effectiveness(d, a)).toBe(2);
      }
    }
  });

  it('sums to the same total for every attacker (balanced by construction)', () => {
    const rows = effectivenessMatrix().map((r) => r.reduce((a, b) => a + b, 0));
    expect(new Set(rows).size).toBe(1);
  });

  it('keeps the approved themed match-ups', () => {
    expect(effectiveness('light', 'shadow')).toBe(2); // the Oracle beats FUD
    expect(effectiveness('ice', 'shadow')).toBe(2); // cold storage resists scams
    expect(effectiveness('shadow', 'water')).toBe(2); // FUD drains liquidity
  });

  it('names every element in both languages', () => {
    for (const e of ELEMENTS) {
      expect(ELEMENT_INFO[e].es).toBeTruthy();
      expect(ELEMENT_INFO[e].en).toBeTruthy();
    }
  });
});

describe('creatures', () => {
  it('has the 50 approved creatures with the approved rarity split', () => {
    expect(CREATURES).toHaveLength(50);
    const by = (r: string) => CREATURES.filter((c) => c.rarity === r).length;
    expect(RARITIES.map(by)).toEqual([16, 12, 10, 6, 4, 2]);
  });

  it('uses unique ids, names and dex numbers 1–50', () => {
    expect(new Set(CREATURES.map((c) => c.id)).size).toBe(50);
    expect(new Set(CREATURES.map((c) => c.name.toLowerCase())).size).toBe(50);
    expect(CREATURES.map((c) => c.dex)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('never uses a banned franchise, brand, coin, person or owned meme', () => {
    for (const c of CREATURES) {
      for (const word of BANNED) {
        expect(text(c), `${c.id} mentions "${word}"`).not.toMatch(
          new RegExp(`(^|[^a-z])${word}([^a-z]|$)`),
        );
      }
      expect(c.name.toLowerCase().endsWith('mon'), `${c.id} ends in -mon`).toBe(false);
    }
  });

  it('only references skills, passives and items that exist', () => {
    for (const c of CREATURES) {
      expect(c.skills.length).toBeGreaterThanOrEqual(2);
      expect(c.skills.length).toBeLessThanOrEqual(4);
      for (const s of c.skills) expect(SKILLS_BY_ID.has(s), `${c.id}: ${s}`).toBe(true);
      expect(PASSIVES_BY_ID.has(c.passive), `${c.id}: ${c.passive}`).toBe(true);
      for (const m of Object.keys(c.evolution?.materials ?? {})) {
        expect(ITEMS_BY_ID.get(m)?.kind, `${c.id}: ${m}`).toBe('material');
      }
    }
  });

  it('gives each creature at least one skill of its own element', () => {
    for (const c of CREATURES) {
      expect(c.skills.some((s) => SKILLS_BY_ID.get(s)!.element === c.element)).toBe(true);
    }
  });

  it('forms valid evolution chains that always get stronger', () => {
    const targets = new Set<string>();
    for (const c of CREATURES) {
      const evo = c.evolution;
      if (!evo) continue;
      const next = CREATURES_BY_ID.get(evo.to);
      expect(next, `${c.id} → ${evo.to}`).toBeDefined();
      expect(targets.has(evo.to), `${evo.to} has two parents`).toBe(false);
      targets.add(evo.to);
      expect(next!.stage).toBe(c.stage + 1);
      expect(STAT_TOTAL[next!.rarity]).toBeGreaterThan(STAT_TOTAL[c.rarity]);
      expect(evo.level !== null || evo.holdDays !== null).toBe(true);
      expect(evo.gold).toBeGreaterThan(0);
    }
    // the approved structure: 10 three-stage lines, 6 two-stage lines, 8 standalones
    const roots = CREATURES.filter((c) => c.stage === 1);
    const length = (c: (typeof CREATURES)[number]): number =>
      c.evolution ? 1 + length(CREATURES_BY_ID.get(c.evolution.to)!) : 1;
    const lengths = roots.map(length);
    expect(lengths.filter((n) => n === 3)).toHaveLength(10);
    expect(lengths.filter((n) => n === 2)).toHaveLength(6);
    expect(lengths.filter((n) => n === 1)).toHaveLength(8);
  });

  it('raises evolution levels along each chain', () => {
    for (const c of CREATURES) {
      const next = c.evolution && CREATURES_BY_ID.get(c.evolution.to);
      if (next?.evolution?.level && c.evolution?.level) {
        expect(next.evolution.level).toBeGreaterThan(c.evolution.level);
      }
    }
  });

  it('has the HODL evolution: Paperpaw becomes Diamondpaw after 30 days held', () => {
    expect(CREATURES_BY_ID.get('paperpaw')!.evolution).toMatchObject({
      to: 'diamondpaw',
      level: null,
      holdDays: 30,
    });
  });

  it('has the three approved starters, not a fire/water/grass triad', () => {
    expect(STARTERS.map((s) => s.id)).toEqual(['gwisp', 'frostkey', 'dropling']);
    expect(new Set(STARTERS.map((s) => s.element))).toEqual(new Set(['electric', 'ice', 'wind']));
    for (const s of STARTERS) expect(s.rarity).toBe('common');
  });

  it('keeps legendary and mythic creatures out of wild spawns', () => {
    for (const c of CREATURES) {
      const event = c.rarity === 'legendary' || c.rarity === 'mythic';
      expect(c.wild).toBe(!event);
      expect(c.biomes.length > 0).toBe(!event);
    }
  });

  it('spreads every element across at least four creatures', () => {
    for (const e of ELEMENTS) {
      expect(CREATURES.filter((c) => c.element === e).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('has short descriptions in both languages', () => {
    for (const c of CREATURES) {
      expect(c.lore.es.length).toBeGreaterThan(10);
      expect(c.lore.en.length).toBeGreaterThan(10);
      expect(c.lore.es.length).toBeLessThanOrEqual(110);
      expect(c.lore.en.length).toBeLessThanOrEqual(110);
    }
  });
});

describe('skills, items and recipes', () => {
  it('has four skills per element with rising power and falling accuracy', () => {
    for (const e of ELEMENTS) {
      const s = SKILLS.filter((x) => x.element === e);
      expect(s.map((x) => x.power)).toEqual([40, 60, 80, 100]);
      expect(s.map((x) => x.accuracy)).toEqual([100, 95, 90, 85]);
    }
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(SKILLS.length);
  });

  it('has the approved capture vaults with multipliers 1, 1.5 and 2', () => {
    const vaults = ITEMS.filter((i) => i.kind === 'capture');
    expect(vaults.map((v) => [v.id, v.effects.captureMultiplier, v.price])).toEqual([
      ['vault-basic', 1, 20],
      ['vault-reinforced', 1.5, 60],
      ['vault-cold', 2, 150],
    ]);
  });

  it('has five recipes using only known items', () => {
    expect(RECIPES).toHaveLength(5);
    for (const r of RECIPES) {
      expect(ITEMS_BY_ID.has(r.output)).toBe(true);
      for (const id of Object.keys(r.inputs)) expect(ITEMS_BY_ID.has(id), id).toBe(true);
      expect(r.inputs[r.output]).toBeUndefined();
    }
  });
});
