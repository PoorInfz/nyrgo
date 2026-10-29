import type { FastifyInstance } from 'fastify';
import { DEFAULT_CONFIG } from '@nyrgo/shared';
import type { Db } from '../db.js';

/**
 * /health  — liveness: the process is up. Never touches dependencies.
 * /ready   — readiness: the database answers and the spatial extensions are installed.
 */
export async function healthRoutes(app: FastifyInstance, opts: { db: Db }): Promise<void> {
  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ready', async (_req, reply) => {
    try {
      const { rows } = await opts.db.query<{ name: string; version: string }>(
        `SELECT extname AS name, extversion AS version FROM pg_extension
          WHERE extname IN ('postgis', 'h3', 'h3_postgis') ORDER BY extname`,
      );
      const missing = ['h3', 'h3_postgis', 'postgis'].filter(
        (n) => !rows.some((r) => r.name === n),
      );
      if (missing.length > 0) {
        return reply.code(503).send({ status: 'degraded', missing });
      }
      return {
        status: 'ready',
        configVersion: DEFAULT_CONFIG.version,
        extensions: Object.fromEntries(rows.map((r) => [r.name, r.version])),
      };
    } catch (err) {
      app.log.warn({ err }, 'readiness check failed');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
}
