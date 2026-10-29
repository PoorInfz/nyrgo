/** Copies creatures, items and recipes from @nyrgo/shared into the database. Idempotent. */
import { createDb } from '../src/db.js';
import { syncContent } from '../src/modules/content/sync.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const db = createDb(url);
try {
  console.warn('content synced', await syncContent(db));
} finally {
  await db.end();
}
