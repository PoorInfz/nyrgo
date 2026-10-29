import { ARCHETYPES, DEFAULT_WORLD } from './model.js';
import type { ArchetypeResult, Spread } from './run.js';
import type { Change } from './v1.js';

/** Targets the proposal is checked against (for the regular player unless stated). */
export const TARGETS = [
  {
    id: 'faucet',
    text: 'Gold earned / spent, days 31–90, regular player: inside the config band 0.9–1.2',
    check: (r: ArchetypeResult[]) => between(byId(r, 'regular').faucetSink.rest, 0.9, 1.2),
    value: (r: ArchetypeResult[]) => fmt(byId(r, 'regular').faucetSink.rest, 2),
  },
  {
    id: 'faucet30',
    text: 'Gold earned / spent, first 30 days, regular player: at most 2 (saving up is fine)',
    check: (r: ArchetypeResult[]) => byId(r, 'regular').faucetSink.first30 <= 2,
    value: (r: ArchetypeResult[]) => fmt(byId(r, 'regular').faucetSink.first30, 2),
  },
  {
    id: 'lvl10',
    text: 'Level 10 within about a week (days 4–8)',
    check: (r: ArchetypeResult[]) => between(byId(r, 'regular').daysToLevel[10] ?? 999, 4, 8),
    value: (r: ArchetypeResult[]) => day(byId(r, 'regular').daysToLevel[10]),
  },
  {
    id: 'lvl20',
    text: 'Level 20 in about a month (days 21–40)',
    check: (r: ArchetypeResult[]) => between(byId(r, 'regular').daysToLevel[20] ?? 999, 21, 40),
    value: (r: ArchetypeResult[]) => day(byId(r, 'regular').daysToLevel[20]),
  },
  {
    id: 'lvl30',
    text: 'Level 30 in about three months (days 70–120, or later)',
    check: (r: ArchetypeResult[]) => (byId(r, 'regular').daysToLevel[30] ?? 999) >= 70,
    value: (r: ArchetypeResult[]) => day(byId(r, 'regular').daysToLevel[30]),
  },
  {
    id: 'evo',
    text: 'First evolution within the first two weeks',
    check: (r: ArchetypeResult[]) => (byId(r, 'regular').firstEvolutionDay ?? 999) <= 15,
    value: (r: ArchetypeResult[]) => day(byId(r, 'regular').firstEvolutionDay),
  },
  {
    id: 'win',
    text: 'Battles chosen by the player won 60–85 % of the time (a challenge, not a formality)',
    check: (r: ArchetypeResult[]) => between(byId(r, 'regular').battleWinRate, 0.6, 0.85),
    value: (r: ArchetypeResult[]) => pct(byId(r, 'regular').battleWinRate),
  },
  {
    id: 'shop',
    text: 'The shop matters (at least a third of spending) but nobody runs out of vaults (< 5 %)',
    check: (r: ArchetypeResult[]) => {
      const a = byId(r, 'regular');
      const out = Object.values(a.perPlayDay.goldOut).reduce((s, x) => s + x, 0);
      return a.perPlayDay.goldOut.shop >= out / 3 && a.noVaultRate < 0.05;
    },
    value: (r: ArchetypeResult[]) => {
      const a = byId(r, 'regular');
      const out = Object.values(a.perPlayDay.goldOut).reduce((s, x) => s + x, 0);
      return `${pct(a.perPlayDay.goldOut.shop / Math.max(1, out))} of spending, ${pct(a.noVaultRate)} without vaults`;
    },
  },
  {
    id: 'cap',
    text: 'The daily gold cap never stops a regular player and does stop 3-hour sessions',
    check: (r: ArchetypeResult[]) =>
      byId(r, 'regular').capHitDays < 0.05 && byId(r, 'grinder').capHitDays > 0.3,
    value: (r: ArchetypeResult[]) =>
      `regular ${pct(byId(r, 'regular').capHitDays)}, intensive ${pct(byId(r, 'grinder').capHitDays)} of days`,
  },
  {
    id: 'dex',
    text: 'Wild Dex (44): about two thirds at day 30, most of it by day 90',
    check: (r: ArchetypeResult[]) => {
      const a = byId(r, 'regular');
      return (a.at[30]?.dexCaught.p50 ?? 0) <= 32 && (a.at[90]?.dexCaught.p50 ?? 0) >= 36;
    },
    value: (r: ArchetypeResult[]) => {
      const a = byId(r, 'regular');
      return `${a.at[30]?.dexCaught.p50 ?? '–'} at day 30, ${a.at[90]?.dexCaught.p50 ?? '–'} at day 90`;
    },
  },
];

const byId = (r: ArchetypeResult[], id: string) => r.find((a) => a.archetype.id === id)!;
const between = (x: number, lo: number, hi: number) => x >= lo && x <= hi;
const fmt = (x: number, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const pct = (x: number) => `${Math.round(x * 100)} %`;
const day = (x: number | null | undefined) =>
  x === null || x === undefined ? 'after day 90' : `day ${x}`;
const sp = (s: Spread | undefined) => (s ? `${s.p50} (${s.p10}–${s.p90})` : '–');

function table(rows: string[][]): string {
  const [head, ...body] = rows;
  return [
    `| ${head!.join(' | ')} |`,
    `| ${head!.map(() => '---').join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

function results(title: string, r: ArchetypeResult[], days: number): string {
  const names = r.map((a) => a.archetype.label);
  const at = (cp: number, f: (x: ArchetypeResult['at'][number]) => Spread) =>
    r.map((a) => (a.at[cp] ? sp(f(a.at[cp]!)) : '–'));
  const cps = [7, 30, 90].filter((d) => d <= days);
  const gIn = (a: ArchetypeResult) => Object.values(a.perPlayDay.goldIn).reduce((s, x) => s + x, 0);
  const gOut = (a: ArchetypeResult) =>
    Object.values(a.perPlayDay.goldOut).reduce((s, x) => s + x, 0);
  return [
    `### ${title}`,
    '',
    table([
      ['', ...names],
      ['Gold earned per day played', ...r.map((a) => fmt(gIn(a)))],
      ['  of which level-ups', ...r.map((a) => fmt(a.perPlayDay.goldIn.level_up))],
      ['  of which missions', ...r.map((a) => fmt(a.perPlayDay.goldIn.mission))],
      ['  of which places', ...r.map((a) => fmt(a.perPlayDay.goldIn.poi_visit))],
      ['  of which battles', ...r.map((a) => fmt(a.perPlayDay.goldIn.pve_win))],
      ['  of which catches', ...r.map((a) => fmt(a.perPlayDay.goldIn.capture))],
      ['Gold spent per day played', ...r.map((a) => fmt(gOut(a)))],
      [
        '  shop / crafting / evolution',
        ...r.map(
          (a) =>
            `${fmt(a.perPlayDay.goldOut.shop)} / ${fmt(a.perPlayDay.goldOut.craft)} / ${fmt(a.perPlayDay.goldOut.evolution)}`,
        ),
      ],
      ['Gold kept by the daily cap', ...r.map((a) => fmt(a.perPlayDay.goldCapped))],
      ['Earned / spent, days 1–30', ...r.map((a) => fmt(a.faucetSink.first30, 2))],
      ['Earned / spent, days 31–90', ...r.map((a) => fmt(a.faucetSink.rest, 2))],
      ['Days the cap stopped gold', ...r.map((a) => pct(a.capHitDays))],
      [
        'Encounters / catches per day',
        ...r.map((a) => `${fmt(a.perPlayDay.encounters, 1)} / ${fmt(a.perPlayDay.captures, 1)}`),
      ],
      ['Throws per catch', ...r.map((a) => fmt(a.throwsPerCapture, 2))],
      ['Encounters without a vault', ...r.map((a) => pct(a.noVaultRate))],
      [
        'Battles won',
        ...r.map((a) => (a.archetype.battles ? pct(a.battleWinRate) : 'does not fight')),
      ],
      [
        'Level 10 / 20 / 30 (median)',
        ...r.map((a) =>
          [10, 20, 30]
            .map((l) => (a.daysToLevel[l] === null ? '>90' : `d${a.daysToLevel[l]}`))
            .join(' / '),
        ),
      ],
      [
        'First evolution (median)',
        ...r.map((a) => (a.firstEvolutionDay === null ? '>90' : `day ${a.firstEvolutionDay}`)),
      ],
      ...cps.map((cp) => [`Level at day ${cp}`, ...at(cp, (x) => x.level)]),
      ...cps.map((cp) => [`Gold held at day ${cp}`, ...at(cp, (x) => x.gold)]),
      ...cps.map((cp) => [`Dex caught at day ${cp} (of 44)`, ...at(cp, (x) => x.dexCaught)]),
      ...cps.map((cp) => [`Evolutions by day ${cp}`, ...at(cp, (x) => x.evolutions)]),
    ]),
    '',
    'Values with a range are the median (10th–90th percentile) across simulated players.',
  ].join('\n');
}

export function report(opts: {
  players: number;
  days: number;
  seed: string;
  before: ArchetypeResult[];
  after: ArchetypeResult[];
  changes: Change[];
}): string {
  const w = DEFAULT_WORLD;
  return [
    '# Economy and progression simulation',
    '',
    `Generated by \`pnpm --filter @nyrgo/sim sim\` (${opts.players} players per archetype, ${opts.days} days, seed \`${opts.seed}\`). Do not edit by hand: change the model or the values and run it again.`,
    '',
    "Every simulated player plays on the game's own rules from `@nyrgo/shared`: the battle engine, capture chances, place loot, daily missions, level curves, the daily gold cap and evolution conditions. Only the choices are simulated, with a simple sensible policy: keep a stock of vaults and patches, fight with a strong-enough creature (training the one closest to evolving), use the best vault on rare finds, evolve as soon as it can afford it, craft only with spare materials.",
    '',
    '## Targets',
    '',
    table([
      ['Target (regular player unless stated)', 'Config v1', 'Config v2 (current)'],
      ...TARGETS.map((t) => [
        t.text,
        `${t.check(opts.before) ? '✅' : '❌'} ${t.value(opts.before)}`,
        `${t.check(opts.after) ? '✅' : '❌'} ${t.value(opts.after)}`,
      ]),
    ]),
    '',
    '## Changes from v1 to v2',
    '',
    table([
      ['Value', 'v1', 'v2', 'Why'],
      ...opts.changes.map((c) => [`\`${c.key}\``, c.before, c.after, c.why]),
    ]),
    '',
    '## Results',
    '',
    results('Config v1 (Phase 1 assumptions)', opts.before, opts.days),
    '',
    results('Config v2 (current)', opts.after, opts.days),
    '',
    '## Assumptions',
    '',
    table([
      ['Archetype', 'Days a week', 'Minutes a day', 'Throw skill', 'Fights'],
      ...ARCHETYPES.map((a) => [
        a.label,
        `${a.daysPerWeek}`,
        `${a.minutesPerDay}`,
        `${a.skill}`,
        a.battles ? 'yes' : 'no',
      ]),
    ]),
    '',
    `- ${w.encountersPerHour} reachable wild creatures and ${w.placesPerHour} place visits per hour of walking (central Córdoba; derivation in \`packages/sim/src/model.ts\`).`,
    `- Spawn cells along a route: ${Object.entries(w.biomeMix)
      .map(([b, x]) => `${b} ${Math.round(x * 100)} %`)
      .join(', ')}.`,
    '- Creatures rest fully overnight and recover 10 % of their HP every 5 minutes of walking.',
    '- Commons the player already has four of are left alone; everything else is caught.',
    '- Not modelled: trading, events with legendary or mythic creatures, lures, NEAR claims (Phase 3+), the first-cell exploration reward (configured but not implemented in the API).',
    '',
  ].join('\n');
}
