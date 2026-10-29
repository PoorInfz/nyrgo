/**
 * Runs one scheduled job immediately, outside the queue (for operators and local checks).
 *
 *   pnpm --filter @nyrgo/api jobs:run retention
 *   pnpm --filter @nyrgo/api jobs:run risk-decay
 */
import { createDb } from '../src/db.js';
import { JOBS, jobHandlers, type JobName } from '../src/jobs/queue.js';

const name = process.argv[2] as JobName | undefined;
const names = Object.values(JOBS).map((j) => j.name);
if (!name || !names.includes(name)) {
  throw new Error(`usage: jobs:run <${names.join('|')}>`);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const db = createDb(url);
try {
  console.warn(name, await jobHandlers(db)[name]());
} finally {
  await db.end();
}
