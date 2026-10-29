import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { problem } from '@nyrgo/shared';
import type { AppConfig } from './config.js';
import type { Db } from './db.js';
import { healthRoutes } from './routes/health.js';

export interface AppDeps {
  config: AppConfig;
  db: Db;
}

export async function buildApp({ config, db }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.env === 'test'
        ? false
        : {
            level: config.env === 'production' ? 'info' : 'debug',
            // Never log coordinates, emails or auth material.
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              '*.lat',
              '*.lng',
              '*.email',
            ],
          },
    trustProxy: config.env === 'production',
    bodyLimit: 64 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err.validation) {
      return reply
        .code(400)
        .type('application/problem+json')
        .send(problem('validation_failed', 'Request validation failed', err.message));
    }
    if (err.statusCode === 429) {
      return reply
        .code(429)
        .type('application/problem+json')
        .send(problem('rate_limited', 'Too many requests'));
    }
    req.log.error({ err }, 'unhandled error');
    return reply
      .code(500)
      .type('application/problem+json')
      .send(problem('internal_error', 'Internal error'));
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).type('application/problem+json').send(problem('not_found', 'Not found')),
  );

  await app.register(healthRoutes, { db });

  if (config.devRoutes) {
    app.get('/dev/v1/ping', async () => ({ dev: true }));
  }

  return app;
}
