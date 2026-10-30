import { describe, expect, it } from 'vitest';
import {
  COMBAT,
  CREATURES,
  CREATURES_BY_ID,
  PASSIVES,
  createFighter,
  fleeChance,
  instanceStats,
  invalidAction,
  resolveTurn,
  seededRandom,
  simulateDuel,
  startBattle,
  type BattleState,
  type Fighter,
} from '../src/index.js';

const IV7 = { hp: 7, atk: 7, def: 7, spd: 7 };

function fighter(id: string, level = 10, over: Partial<Fighter> = {}): Fighter {
  const def = CREATURES_BY_ID.get(id)!;
  return {
    ...createFighter({
      creatureId: id,
      element: def.element,
      level,
      stats: instanceStats(def.stats, level, IV7),
      skills: def.skills,
      passive: def.passive,
    }),
    ...over,
  };
}

/** Same creatures without passives, for testing the bare rules. */
const plain = (id: string, level = 10, over: Partial<Fighter> = {}) =>
  fighter(id, level, { passive: 'none', ...over });

const battle = (p: Fighter, f: Fighter, seed = 's', items = {}) =>
  startBattle(p, f, items, seededRandom(seed)).state;

/** Plays a whole battle with the player always using its strongest-looking first skill. */
function playOut(p: Fighter, f: Fighter, seed: string): BattleState {
  let state = battle(p, f, seed);
  const rand = seededRandom(`${seed}:turns`);
  while (!state.result) {
    state = resolveTurn(
      state,
      { kind: 'skill', skill: p.skills[p.skills.length - 1]! },
      rand,
    ).state;
  }
  return state;
}

describe('combat rules', () => {
  it('is deterministic for the same state, action and seed', () => {
    const s = battle(fighter('gwisp'), fighter('burnlet'));
    const a = resolveTurn(s, { kind: 'skill', skill: 'base-fee' }, seededRandom('t1'));
    const b = resolveTurn(s, { kind: 'skill', skill: 'base-fee' }, seededRandom('t1'));
    expect(a).toEqual(b);
    // and does not modify its input
    expect(s.turn).toBe(0);
    expect(s.foe.hp).toBe(s.foe.maxHp);
  });

  it('lets the faster creature move first', () => {
    const fast = plain('gwisp', 10, { stats: { ...plain('gwisp').stats, spd: 999 } });
    const s = battle(fast, plain('pebblock'));
    const { events } = resolveTurn(s, { kind: 'skill', skill: 'base-fee' }, seededRandom('o'));
    expect(events.find((e) => e.type === 'move')).toMatchObject({ side: 'player' });
    const slow = plain('gwisp', 10, { stats: { ...plain('gwisp').stats, spd: 1 } });
    const s2 = battle(slow, plain('pebblock'));
    const r2 = resolveTurn(s2, { kind: 'skill', skill: 'base-fee' }, seededRandom('o'));
    expect(r2.events.find((e) => e.type === 'move')).toMatchObject({ side: 'foe' });
  });

  it('applies the type chart and the same-element bonus', () => {
    // Gas (electric) is strong against Airdrop (wind) and weak against Burn (fire).
    const avg = (foe: string) => {
      let total = 0;
      for (let i = 0; i < 200; i++) {
        const s = battle(
          plain('gwisp'),
          plain(foe, 10, { stats: { hp: 9999, atk: 1, def: 60, spd: 1 } }),
        );
        const { events } = resolveTurn(
          s,
          { kind: 'skill', skill: 'base-fee' },
          seededRandom(`e${i}`),
        );
        const hit = events.find((e) => e.type === 'hit' && e.side === 'player');
        if (hit && hit.type === 'hit') total += hit.damage;
      }
      return total;
    };
    const strong = avg('dropling');
    const weak = avg('burnlet');
    // ×2 vs ×0.5 on the chart, softened to (2 / 0.5)^typeWeight in damage
    const expected = 4 ** COMBAT.typeWeight;
    expect(strong / weak).toBeGreaterThan(expected * 0.88);
    expect(strong / weak).toBeLessThan(expected * 1.12);
  });

  it('never lets accuracy-85 skills hit every time, and never-miss passives always hit', () => {
    let misses = 0;
    for (let i = 0; i < 300; i++) {
      const s = battle(
        plain('deflagron', 30),
        plain('pebblock', 30, { stats: { hp: 9999, atk: 1, def: 99, spd: 1 } }),
      );
      const { events } = resolveTurn(
        s,
        { kind: 'skill', skill: 'euphoria-blaze' },
        seededRandom(`m${i}`),
      );
      if (events.some((e) => e.type === 'miss' && e.side === 'player')) misses++;
    }
    expect(misses / 300).toBeGreaterThan(0.08);
    expect(misses / 300).toBeLessThan(0.23);
    const sure = PASSIVES.find((p) => p.effect === 'never_miss')!;
    for (let i = 0; i < 100; i++) {
      const s = battle(
        plain('deflagron', 30, { passive: sure.id }),
        plain('pebblock', 30, { stats: { hp: 9999, atk: 1, def: 99, spd: 1 } }),
      );
      const { events } = resolveTurn(
        s,
        { kind: 'skill', skill: 'euphoria-blaze' },
        seededRandom(`n${i}`),
      );
      expect(events.some((e) => e.type === 'miss' && e.side === 'player')).toBe(false);
    }
  });

  it('ends with a win, a loss or a successful escape', () => {
    const results = new Set<string>();
    for (let i = 0; i < 60; i++) {
      results.add(playOut(fighter('gwisp', 8), fighter('fuddle', 8), `r${i}`).result!);
    }
    expect(results.has('win')).toBe(true);
    expect(results.has('loss')).toBe(true);
    const s = battle(fighter('gwisp'), fighter('pebblock'));
    let fled = false;
    for (let i = 0; i < 20 && !fled; i++) {
      fled = resolveTurn(s, { kind: 'flee' }, seededRandom(`f${i}`)).state.result === 'fled';
    }
    expect(fled).toBe(true);
  });

  it('keeps flee chances within bounds and favours faster creatures', () => {
    const fast = battle(
      plain('gwisp', 10, { stats: { ...plain('gwisp').stats, spd: 500 } }),
      plain('pebblock'),
    );
    const slow = battle(
      plain('pebblock', 10, { stats: { ...plain('pebblock').stats, spd: 1 } }),
      plain('gwisp'),
    );
    expect(fleeChance(fast)).toBe(COMBAT.fleeMax);
    expect(fleeChance(slow)).toBe(COMBAT.fleeMin);
  });

  it('heals with a patch, spends it and refuses unknown or missing items', () => {
    let s = battle(fighter('gwisp'), fighter('pebblock'), 'p', { patch: 1 });
    s = { ...s, player: { ...s.player, hp: 5 } };
    const r = resolveTurn(s, { kind: 'item', item: 'patch' }, seededRandom('i'));
    expect(r.events[0]).toEqual({ type: 'item', side: 'player', item: 'patch' });
    expect(r.events[1]).toMatchObject({ type: 'heal', amount: Math.min(30, s.player.maxHp - 5) });
    expect(r.state.items.patch).toBe(0);
    expect(invalidAction(r.state, { kind: 'item', item: 'patch' })).toBe('out_of_items');
    expect(invalidAction(r.state, { kind: 'item', item: 'vault-basic' })).toBe('not_usable');
    expect(invalidAction(r.state, { kind: 'skill', skill: 'mass-burn' })).toBe('unknown_skill');
    expect(() =>
      resolveTurn(r.state, { kind: 'skill', skill: 'mass-burn' }, seededRandom('x')),
    ).toThrow();
  });

  it('refuses actions once the battle is over', () => {
    const over = playOut(fighter('gwisp', 30), fighter('fuddle', 3), 'over');
    expect(over.result).toBe('win');
    expect(invalidAction(over, { kind: 'flee' })).toBe('battle_over');
  });
});

describe('passives', () => {
  const firstTurn = (p: Fighter, f: Fighter, seed = 'x') =>
    resolveTurn(battle(p, f), { kind: 'skill', skill: p.skills[0]! }, seededRandom(seed));

  it('applies stat bonuses and debuffs at the start, and debuff immunity blocks one', () => {
    const { state, events } = startBattle(
      fighter('leviawhale', 30),
      fighter('fuddle', 30),
      {},
      seededRandom('a'),
    );
    expect(state.player.mods.def).toBeCloseTo(1.1);
    // fud-aura lowers the whale's attack
    expect(state.player.mods.atk).toBeCloseTo(0.9);
    expect(events.map((e) => e.type)).toEqual(['passive', 'passive']);
    const cold = startBattle(fighter('frostkey', 10), fighter('fuddle', 10), {}, seededRandom('b'));
    expect(cold.state.player.mods.atk).toBe(1);
    expect(cold.events).toContainEqual({ type: 'resist', side: 'player', passive: 'cold-storage' });
  });

  it('charges a toll on the first attack against a Gas creature', () => {
    const { events, state } = firstTurn(plain('pebblock', 10), fighter('gwisp', 10));
    const tax = events.find((e) => e.type === 'tax');
    expect(tax).toMatchObject({ side: 'player' });
    expect(state.foe.used.taxed).toBe(true);
  });

  it('survives one knockout blow with diamond hands', () => {
    const tough = fighter('diamondpaw', 5, {});
    const s = battle(plain('deflagron', 50), { ...tough, hp: 10 });
    const r = resolveTurn(s, { kind: 'skill', skill: 'euphoria-blaze' }, seededRandom('k'));
    if (r.events.some((e) => e.type === 'hit' && e.side === 'player')) {
      expect(r.state.foe.hp).toBe(1);
      expect(r.events).toContainEqual({ type: 'survive', side: 'foe' });
    }
  });

  it('halves the first hit taken with halving', () => {
    const halved: number[] = [];
    const normal: number[] = [];
    for (let i = 0; i < 50; i++) {
      const target = { hp: 9999, atk: 1, def: 80, spd: 1 };
      const a = firstTurn(
        plain('gwisp', 20),
        plain('pebblock', 20, { stats: target, passive: 'halving' }),
        `h${i}`,
      );
      const b = firstTurn(plain('gwisp', 20), plain('pebblock', 20, { stats: target }), `h${i}`);
      const ha = a.events.find((e) => e.type === 'hit' && e.side === 'player');
      const hb = b.events.find((e) => e.type === 'hit' && e.side === 'player');
      if (ha?.type === 'hit' && hb?.type === 'hit') {
        halved.push(ha.damage);
        normal.push(hb.damage);
      }
    }
    const sum = (x: number[]) => x.reduce((a, b) => a + b, 0);
    expect(sum(halved) / sum(normal)).toBeCloseTo(0.5, 1);
  });

  it('regenerates at the end of the turn and never above max HP', () => {
    const s = battle(plain('pebblock', 10), fighter('yieldling', 10));
    const hurt = { ...s, foe: { ...s.foe, hp: s.foe.maxHp - 2 } };
    const { events, state } = resolveTurn(
      hurt,
      { kind: 'skill', skill: 'block-slam' },
      seededRandom('g'),
    );
    const heal = events.filter((e) => e.type === 'heal' && e.side === 'foe');
    if (state.foe.hp > 0) expect(heal.length).toBe(1);
    expect(state.foe.hp).toBeLessThanOrEqual(state.foe.maxHp);
  });

  it('every passive used by a creature has an implementation', () => {
    for (const c of CREATURES) {
      const p = PASSIVES.find((x) => x.id === c.passive)!;
      if (p.effect === 'stat_bonus' || p.effect === 'enemy_debuff')
        expect(p.stat, p.id).toBeDefined();
    }
    // every creature can fight every other without throwing
    for (const a of CREATURES) {
      const b = CREATURES[(a.dex * 7) % CREATURES.length]!;
      expect(() => playOut(fighter(a.id, 15), fighter(b.id, 15), `${a.id}-${b.id}`)).not.toThrow();
    }
  });
});

describe('balance (simulated)', () => {
  it('lasts a handful of turns between equal creatures at any level', () => {
    for (const level of [5, 20, 40]) {
      let turns = 0;
      let n = 0;
      for (let i = 0; i < 40; i++) {
        const a = CREATURES[(i * 3) % 24]!;
        const b = CREATURES[(i * 5 + 1) % 24]!;
        if (a.rarity !== b.rarity) continue;
        turns += playOut(fighter(a.id, level), fighter(b.id, level), `b${level}-${i}`).turn;
        n++;
      }
      const avg = turns / Math.max(1, n);
      expect(avg, `level ${level}`).toBeGreaterThan(2.5);
      expect(avg, `level ${level}`).toBeLessThan(9);
    }
  });

  it('rewards a type advantage, which enough levels can overturn', () => {
    const rate = (a: string, la: number, b: string, lb: number) => {
      let wins = 0;
      for (let i = 0; i < 200; i++)
        if (playOut(fighter(a, la), fighter(b, lb), `adv${a}${la}${i}`).result === 'win') wins++;
      return wins / 200;
    };
    // Gwisp (Gas) beats Dropling (Airdrop) at the same level...
    expect(rate('gwisp', 12, 'dropling', 12)).toBeGreaterThan(0.8);
    // ...but a Dropling eight levels higher usually wins the rematch
    expect(rate('dropling', 20, 'gwisp', 12)).toBeGreaterThan(0.6);
    // and a neutral match-up is close to even
    const even = rate('gwisp', 10, 'fuddle', 10);
    expect(even).toBeGreaterThan(0.3);
    expect(even).toBeLessThan(0.7);
  });
});

describe('friendly duels', () => {
  it('always ends, with the same result for the same seed', () => {
    for (const [a, b] of [
      ['genesaur', 'zeroknowl'],
      [CREATURES[0]!.id, CREATURES[1]!.id],
    ] as const) {
      const one = simulateDuel(fighter(a, 12), fighter(b, 12), seededRandom('d1'));
      const two = simulateDuel(fighter(a, 12), fighter(b, 12), seededRandom('d1'));
      expect(one).toEqual(two);
      expect(one.turns.length).toBeGreaterThan(1);
      expect(one.turns.length).toBeLessThanOrEqual(COMBAT.maxTurns + 1);
      if (one.winner === 'player') expect(one.hp.foe).toBe(0);
      if (one.winner === 'foe') expect(one.hp.player).toBe(0);
    }
  });

  it('favours the much stronger creature', () => {
    let wins = 0;
    for (let i = 0; i < 40; i++) {
      const r = simulateDuel(plain('genesaur', 30), plain('genesaur', 5), seededRandom(`s${i}`));
      if (r.winner === 'player') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(38);
  });
});
