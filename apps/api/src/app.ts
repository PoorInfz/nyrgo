import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { problem } from '@nyrgo/shared';
import type { AppConfig } from './config.js';
import type { Db } from './db.js';
import { HttpProblem } from './http/problem.js';
import { accountRoutes } from './modules/account/routes.js';
import { LogMailer, MemoryMailer, type Mailer } from './modules/auth/mailer.js';
import { authRoutes } from './modules/auth/routes.js';
import { sessionLoader } from './modules/auth/sessions.js';
import { healthRoutes } from './routes/health.js';
import { worldRoutes } from './modules/world/routes.js';
import { contentRoutes } from './modules/content/routes.js';
import { captureRoutes } from './modules/capture/routes.js';
import { battleRoutes } from './modules/battle/routes.js';

export interface AppDeps {
  config: AppConfig;
  db: Db;
  /** Overrides the mailer chosen by MAIL_DRIVER (tests pass a MemoryMailer). */
  mailer?: Mailer;
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function buildApp({ config, db, mailer }: AppDeps): Promise<FastifyInstance> {
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
              'res.headers["set-cookie"]',
              '*.lat',
              '*.lng',
              '*.email',
              '*.token',
            ],
          },
    trustProxy: config.env === 'production',
    bodyLimit: 64 * 1024,
    // Reject unknown fields instead of silently dropping them (Fastify's default).
    ajv: { customOptions: { removeAdditional: false } },
  });

  const mail: Mailer =
    mailer ?? (config.mailDriver === 'memory' ? new MemoryMailer() : new LogMailer(app.log));

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  // CSRF defence in depth on top of SameSite=Lax cookies: a browser always sends Origin on
  // cross-site state-changing requests, so refuse any origin that is not ours.
  app.addHook('onRequest', async (req) => {
    if (!STATE_CHANGING.has(req.method)) return;
    const origin = req.headers.origin;
    if (origin !== undefined && !config.corsOrigins.includes(origin)) {
      throw new HttpProblem('bad_origin', 'Origin not allowed');
    }
  });

  app.decorateRequest('auth', null);
  app.addHook('preHandler', sessionLoader(db));

  app.setErrorHandler((err: FastifyError | HttpProblem, req, reply) => {
    if (err instanceof HttpProblem) {
      const body = problem(err.code, err.title, err.detail);
      return reply.code(body.status).type('application/problem+json').send(body);
    }
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
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply
        .code(400)
        .type('application/problem+json')
        .send(problem('validation_failed', 'Bad request', err.message));
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
  await app.register(authRoutes, { db, config, mailer: mail });
  await app.register(accountRoutes, { db, config });
  await app.register(worldRoutes, { db, spawnSecret: config.spawnSecret });
  await app.register(captureRoutes, { db });
  await app.register(battleRoutes, { db });
  await app.register(contentRoutes);

  if (config.devRoutes) {
    app.get('/dev/v1/ping', async () => ({ dev: true }));
  }

  return app;
}
