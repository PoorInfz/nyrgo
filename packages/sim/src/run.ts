import { seededRandom } from '@nyrgo/shared';
import {
  ARCHETYPES,
  DEFAULT_WORLD,
  type Archetype,
  type Tuning,
  type WorldModel,
} from './model.js';
import { SimPlayer, type DayStats, type GoldIn, type GoldOut } from './player.js';

export interface RunOptions {
  players: number;
  days: number;
  seed: string;
  tuning: Tuning;
  world?: WorldModel;
  archetypes?: Archetype[];
}

/** p10 / median / p90 of a sample. */
export interface Spread {
  p10: number;
  p50: number;
  p90: number;
}

export interface ArchetypeResult {
  archetype: Archetype;
  /** Snapshots at checkpoint days. */
  at: Record<
    number,
    {
      level: Spread;
      gold: Spread;
      dexCaught: Spread;
      collection: Spread;
      bestCreatureLevel: Spread;
      evolutions: Spread;
    }
  >;
  /** Averages per day played, over the whole run. */
  perPlayDay: {
    goldIn: Record<GoldIn, number>;
    goldOut: Record<GoldOut, number>;
    goldCapped: number;
    encounters: number;
    throws: number;
    captures: number;
    battles: number;
    missions: number;
  };
  /** Gold earned / gold spent by window (all players pooled). */
  faucetSink: { first30: number; rest: number; all: number };
  /** Share of days played on which the daily cap stopped some gold. */
  capHitDays: number;
  /** Share of encounters with no vault to throw. */
  noVaultRate: number;
  battleWinRate: number;
  fleeRate: number;
  throwsPerCapture: number;
  /** Day by which half the players had a first evolution (null if not within the run). */
  firstEvolutionDay: number | null;
  /** Median days to reach player levels. */
  daysToLevel: Record<number, number | null>;
}

export const CHECKPOINTS = [7, 30, 60, 90];
const LEVEL_MARKS = [5, 10, 15, 20, 25, 30];

function spread(xs: number[]): Spread {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9) };
}

function median(xs: (number | null)[], n: number): number | null {
  // players who never got there count as "after the run"
  const s = xs.map((x) => x ?? Infinity).sort((a, b) => a - b);
  const m = s[Math.floor(n / 2)];
  return m === undefined || m === Infinity ? null : m;
}

export function simulatePlayer(archetype: Archetype, i: number, opts: RunOptions): DayStats[] {
  const rand = seededRandom(`${opts.seed}:${archetype.id}:${i}`);
  const p = new SimPlayer(
    `${archetype.id}-${i}`,
    archetype,
    opts.tuning,
    opts.world ?? DEFAULT_WORLD,
    rand,
  );
  for (let d = 1; d <= opts.days; d++) p.playDay(d);
  return p.days;
}

export function run(opts: RunOptions): ArchetypeResult[] {
  return (opts.archetypes ?? ARCHETYPES).map((a) => {
    const all: DayStats[][] = [];
    for (let i = 0; i < opts.players; i++) all.push(simulatePlayer(a, i, opts));

    const at: ArchetypeResult['at'] = {};
    for (const cp of CHECKPOINTS.filter((d) => d <= opts.days)) {
      const snap = all.map((days) => days[cp - 1]!);
      const evo = all.map((days) => days.slice(0, cp).reduce((s, d) => s + d.evolutions, 0));
      at[cp] = {
        level: spread(snap.map((d) => d.level)),
        gold: spread(snap.map((d) => d.goldBalance)),
        dexCaught: spread(snap.map((d) => d.dexCaught)),
        collection: spread(snap.map((d) => d.collection)),
        bestCreatureLevel: spread(snap.map((d) => d.bestCreatureLevel)),
        evolutions: spread(evo),
      };
    }

    const played = all.flat().filter((d) => d.played);
    const n = Math.max(1, played.length);
    const sum = (f: (d: DayStats) => number, days = played) => days.reduce((s, d) => s + f(d), 0);
    const inSum = (d: DayStats) => Object.values(d.goldIn).reduce((s, x) => s + x, 0);
    const outSum = (d: DayStats) => Object.values(d.goldOut).reduce((s, x) => s + x, 0);
    const ratio = (days: DayStats[]) => sum(inSum, days) / Math.max(1, sum(outSum, days));
    const goldIn = {} as Record<GoldIn, number>;
    for (const k of Object.keys(played[0]?.goldIn ?? {}) as GoldIn[])
      goldIn[k] = sum((d) => d.goldIn[k]) / n;
    const goldOut = {} as Record<GoldOut, number>;
    for (const k of Object.keys(played[0]?.goldOut ?? {}) as GoldOut[])
      goldOut[k] = sum((d) => d.goldOut[k]) / n;
    const encounters = sum((d) => d.encounters);
    const won = sum((d) => d.battlesWon);
    const lost = sum((d) => d.battlesLost);
    const captures = sum((d) => d.captures);
    const throws = sum((d) => d.throws);

    const firstEvo = all.map((days) => days.find((d) => d.evolutions > 0)?.day ?? null);
    const daysToLevel: Record<number, number | null> = {};
    for (const l of LEVEL_MARKS)
      daysToLevel[l] = median(
        all.map((days) => days.find((d) => d.level >= l)?.day ?? null),
        all.length,
      );

    return {
      archetype: a,
      at,
      perPlayDay: {
        goldIn,
        goldOut,
        goldCapped: sum((d) => d.goldCapped) / n,
        encounters: encounters / n,
        throws: throws / n,
        captures: captures / n,
        battles: (won + lost) / n,
        missions: sum((d) => d.missionsDone) / n,
      },
      faucetSink: {
        first30: ratio(played.filter((d) => d.day <= 30)),
        rest: ratio(played.filter((d) => d.day > 30)),
        all: ratio(played),
      },
      capHitDays: played.filter((d) => d.goldCapped > 0).length / n,
      noVaultRate: sum((d) => d.noVault) / Math.max(1, encounters),
      battleWinRate: won / Math.max(1, won + lost),
      fleeRate: sum((d) => d.fled) / Math.max(1, encounters),
      throwsPerCapture: throws / Math.max(1, captures),
      firstEvolutionDay: median(firstEvo, all.length),
      daysToLevel,
    };
  });
}
