import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, seededRandom } from '@nyrgo/shared';
import { ARCHETYPES, DEFAULT_WORLD, currentTuning } from '../src/model.js';
import { SimPlayer } from '../src/player.js';
import { run, simulatePlayer } from '../src/run.js';
import { configV1 } from '../src/v1.js';
import { TARGETS } from '../src/report.js';

const regular = ARCHETYPES.find((a) => a.id === 'regular')!;
const grinder = ARCHETYPES.find((a) => a.id === 'grinder')!;

describe('simulated player', () => {
  it('is deterministic for a seed', () => {
    const opts = { players: 1, days: 20, seed: 't', tuning: currentTuning() };
    expect(simulatePlayer(regular, 0, opts)).toEqual(simulatePlayer(regular, 0, opts));
    expect(simulatePlayer(regular, 1, opts)).not.toEqual(simulatePlayer(regular, 0, opts));
  });

  it('keeps the books: gold held = earned − spent, never negative, cap respected', () => {
    for (const a of [regular, grinder]) {
      const tuning = currentTuning();
      const p = new SimPlayer('books', a, tuning, DEFAULT_WORLD, seededRandom(`books:${a.id}`));
      let held = 0;
      for (let d = 1; d <= 45; d++) {
        p.playDay(d);
        const day = p.days.at(-1)!;
        const earned = Object.values(day.goldIn).reduce((s, x) => s + x, 0);
        const spent = Object.values(day.goldOut).reduce((s, x) => s + x, 0);
        held += earned - spent;
        expect(day.goldBalance).toBe(held);
        expect(day.goldBalance).toBeGreaterThanOrEqual(0);
        expect(earned).toBeLessThanOrEqual(tuning.config.economy.dailyGameplayGoldCap);
        expect(day.goldIn.pve_win).toBeLessThanOrEqual(
          tuning.config.economy.rewards.pveWin.gold * tuning.config.economy.rewards.pveWin.dailyCap,
        );
        for (const n of Object.values(p.items)) expect(n).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('only meets wild creatures up to the configured levels above the player', () => {
    const tuning = currentTuning();
    const p = new SimPlayer('lvl', regular, tuning, DEFAULT_WORLD, seededRandom('lvl'));
    for (let d = 1; d <= 3; d++) p.playDay(d);
    const above = tuning.config.spawns.wildLevelAbovePlayer!;
    // everything caught so far joined at its encounter level
    const catches = p.owned.slice(1);
    expect(catches.length).toBeGreaterThan(0);
    for (const o of catches) expect(o.level).toBeLessThanOrEqual(p.level + above);
  });
});

describe('config versions', () => {
  it('rebuilds version 1 from the current values', () => {
    const { tuning, changes } = configV1();
    expect(DEFAULT_CONFIG.version).toBe(2);
    expect(tuning.config.version).toBe(1);
    expect(tuning.config.economy.dailyGameplayGoldCap).toBe(1500);
    expect(tuning.config.economy.rewards.dailyMission.xp).toBe(500);
    expect(tuning.config.spawns.stageWeights).toBeUndefined();
    // the current config is untouched
    expect(DEFAULT_CONFIG.economy.dailyGameplayGoldCap).toBe(500);
    for (const c of changes) expect(c.before).not.toBe(c.after);
  });

  it('the current config keeps a regular player inside the gold band (small seeded run)', () => {
    const results = run({
      players: 15,
      days: 90,
      seed: 'band',
      tuning: currentTuning(),
      archetypes: [regular, grinder],
    });
    const faucet = TARGETS.find((t) => t.id === 'faucet')!;
    expect(faucet.check(results), faucet.value(results)).toBe(true);
    const band = DEFAULT_CONFIG.economy.faucetSinkBand;
    const r = results.find((x) => x.archetype.id === 'regular')!;
    expect(r.faucetSink.rest).toBeGreaterThanOrEqual(band.min);
    expect(r.faucetSink.rest).toBeLessThanOrEqual(band.max);
  }, 120_000);
});
