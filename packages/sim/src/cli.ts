import { mkdirSync, writeFileSync } from 'node:fs';
import { currentTuning } from './model.js';
import { run } from './run.js';
import { report } from './report.js';
import { configV1 } from './v1.js';

/**
 * pnpm --filter @nyrgo/sim sim [--players 100] [--days 90] [--seed nyrgo] [--out docs/economy]
 * Runs config version 1 and the current config and writes a report and the raw numbers.
 */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const players = Number(arg('players', '100'));
const days = Number(arg('days', '90'));
const seed = arg('seed', 'nyrgo');
const out = arg('out', '../../docs/economy');

const t0 = Date.now();
const v1 = configV1();
const before = run({ players, days, seed, tuning: v1.tuning });
const after = run({ players, days, seed, tuning: currentTuning() });
mkdirSync(out, { recursive: true });
writeFileSync(
  `${out}/results.json`,
  JSON.stringify({ players, days, seed, before, after }, null, 2),
);
writeFileSync(
  `${out}/README.md`,
  report({ players, days, seed, before, after, changes: v1.changes }),
);
process.stdout.write(
  `simulated ${players} players × ${days} days × 4 archetypes, twice, in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}\n`,
);
