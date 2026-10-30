import type { PgBoss } from 'pg-boss';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { startJobs } from './jobs/queue.js';
import { syncContent } from './modules/content/sync.js';

const config = loadConfig();
const db = createDb(config.databaseUrl);
const app = await buildApp({ config, db });

// Definitions must exist before any capture can reference them.
app.log.info(await syncContent(db), 'content synced');

let boss: PgBoss | null = null;
if (config.jobsEnabled) {
  boss = await startJobs(config.databaseUrl, db, app.log, app.nftSyncer, app.tipChain);
}

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await boss?.stop({ graceful: true, timeout: 10_000 });
  await db.end();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.host, port: config.port });
