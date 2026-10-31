import { PgBoss } from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db.js';
import { decayAllRisk } from '../modules/anticheat/risk.js';
import { runRetention } from './retention.js';
import { runTournaments } from '../modules/hub/board.js';
import { loadDueAreas } from '../modules/world/areas.js';
import type { Syncer } from '../modules/nft/service.js';
import type { TipChain } from '../modules/tips/chain.js';
import { runTips } from '../modules/tips/payout.js';

/**
 * Scheduled jobs on pg-boss (PostgreSQL-backed, so no extra service). pg-boss keeps its tables
 * in its own `pgboss` schema and guarantees a cron job runs once even with several API processes.
 * Times are UTC; minutes are offset from :00 to avoid the top-of-hour rush.
 */
export const JOBS = {
  retention: { name: 'retention', cron: '7 * * * *' },
  riskDecay: { name: 'risk-decay', cron: '17 3 * * *' },
  /** Creatures held as NFTs follow their tokens even when nobody opens a collection. */
  nftSync: { name: 'nft-sync', cron: '3-59/10 * * * *' },
  /** Today's tip budget and the NEAR tips waiting to be sent (see tips/payout.ts). */
  tips: { name: 'tips', cron: '* * * * *' },
  /** New places where people play, loaded from OpenStreetMap (see world/areas.ts). */
  worldAreas: { name: 'world-areas', cron: '* * * * *' },
  /** The town's weekly arena tournaments: played when due, the next ones opened. */
  tournaments: { name: 'tournaments', cron: '1-59/5 * * * *' },
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS]['name'];

export function jobHandlers(
  db: Db,
  nftSyncer: Syncer | null = null,
  tipChain: TipChain | null = null,
): Record<JobName, () => Promise<unknown>> {
  return {
    retention: () => runRetention(db),
    'risk-decay': async () => ({ updated: await decayAllRisk(db) }),
    'nft-sync': async () =>
      nftSyncer ? { accounts: await nftSyncer.all() } : { skipped: 'NFTs are off' },
    'world-areas': () => loadDueAreas(db),
    tips: () => runTips(db, tipChain),
    tournaments: () => runTournaments(db),
  };
}

export async function startJobs(
  connectionString: string,
  db: Db,
  log: FastifyBaseLogger,
  nftSyncer: Syncer | null = null,
  tipChain: TipChain | null = null,
): Promise<PgBoss> {
  const boss = new PgBoss(connectionString);
  boss.on('error', (err) => log.error({ err }, 'job queue error'));
  await boss.start();
  const handlers = jobHandlers(db, nftSyncer, tipChain);
  for (const job of Object.values(JOBS)) {
    await boss.createQueue(job.name);
    await boss.schedule(job.name, job.cron);
    await boss.work(job.name, async () => {
      const result = await handlers[job.name]();
      // the every-minute world job only logs when it did something
      const idle =
        (job.name === 'world-areas' && JSON.stringify(result) === '{"ready":0,"failed":0}') ||
        (job.name === 'tournaments' && JSON.stringify(result) === '{"played":[]}');
      if (!idle) log.info({ job: job.name, result }, 'job finished');
      return result;
    });
  }
  log.info({ jobs: Object.values(JOBS).map((j) => `${j.name} @ ${j.cron}`) }, 'jobs scheduled');
  return boss;
}
