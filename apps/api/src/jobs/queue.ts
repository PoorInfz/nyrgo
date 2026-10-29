import { PgBoss } from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db.js';
import { decayAllRisk } from '../modules/anticheat/risk.js';
import { runRetention } from './retention.js';

/**
 * Scheduled jobs on pg-boss (PostgreSQL-backed, so no extra service). pg-boss keeps its tables
 * in its own `pgboss` schema and guarantees a cron job runs once even with several API processes.
 * Times are UTC; minutes are offset from :00 to avoid the top-of-hour rush.
 */
export const JOBS = {
  retention: { name: 'retention', cron: '7 * * * *' },
  riskDecay: { name: 'risk-decay', cron: '17 3 * * *' },
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS]['name'];

export function jobHandlers(db: Db): Record<JobName, () => Promise<unknown>> {
  return {
    retention: () => runRetention(db),
    'risk-decay': async () => ({ updated: await decayAllRisk(db) }),
  };
}

export async function startJobs(
  connectionString: string,
  db: Db,
  log: FastifyBaseLogger,
): Promise<PgBoss> {
  const boss = new PgBoss(connectionString);
  boss.on('error', (err) => log.error({ err }, 'job queue error'));
  await boss.start();
  const handlers = jobHandlers(db);
  for (const job of Object.values(JOBS)) {
    await boss.createQueue(job.name);
    await boss.schedule(job.name, job.cron);
    await boss.work(job.name, async () => {
      const result = await handlers[job.name]();
      log.info({ job: job.name, result }, 'job finished');
      return result;
    });
  }
  log.info({ jobs: Object.values(JOBS).map((j) => `${j.name} @ ${j.cron}`) }, 'jobs scheduled');
  return boss;
}
