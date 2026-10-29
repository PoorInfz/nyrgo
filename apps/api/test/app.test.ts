import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Db } from '../src/db.js';

/** A database stub that is always down: liveness must not depend on it. */
const downDb = {
  query: async () => {
    throw new Error('connection refused');
  },
} as unknown as Db;

const make = (extra: Record<string, string> = {}) =>
  buildApp({
    config: loadConfig({ DATABASE_URL: 'postgres://x@localhost/x', NODE_ENV: 'test', ...extra }),
    db: downDb,
  });

describe('app without a database', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await make();
  });
  afterAll(() => app.close());

  it('GET /health is ok even when the database is down', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /ready reports unavailable when the database is down', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
  });

  it('answers unknown routes with problem+json', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ code: 'not_found', status: 404 });
  });

  it('sets security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not expose dev routes by default', async () => {
    const res = await app.inject({ method: 'GET', url: '/dev/v1/ping' });
    expect(res.statusCode).toBe(404);
  });
});

describe('app with dev routes enabled', () => {
  it('exposes /dev/v1/* outside production', async () => {
    const app = await make({ ENABLE_DEV_ROUTES: 'true' });
    const res = await app.inject({ method: 'GET', url: '/dev/v1/ping' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
