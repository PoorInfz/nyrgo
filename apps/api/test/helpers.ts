import { randomBytes } from 'node:crypto';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';
import { MemoryMailer } from '../src/modules/auth/mailer.js';
import type { NearRpc } from '../src/modules/wallet/rpc.js';
import type { NftChain } from '../src/modules/nft/chain.js';
import type { TipChain } from '../src/modules/tips/chain.js';
import type { IntegrityDecoder } from '../src/modules/attest/google.js';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL;

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  mailer: MemoryMailer;
  close(): Promise<void>;
}

export async function makeTestApp(
  opts: {
    nearRpc?: NearRpc;
    nftChain?: NftChain;
    tipChain?: TipChain;
    integrityDecoder?: IntegrityDecoder;
    env?: Record<string, string>;
  } = {},
): Promise<TestApp> {
  const db = createDb(TEST_DB_URL!);
  const mailer = new MemoryMailer();
  const app = await buildApp({
    config: loadConfig({
      DATABASE_URL: TEST_DB_URL!,
      NODE_ENV: 'test',
      APP_URL: 'http://app.test',
      CORS_ORIGINS: 'http://app.test',
      ...opts.env,
    }),
    db,
    mailer,
    ...(opts.nearRpc ? { nearRpc: opts.nearRpc } : {}),
    ...(opts.nftChain ? { nftChain: opts.nftChain } : {}),
    ...(opts.tipChain ? { tipChain: opts.tipChain } : {}),
    ...(opts.integrityDecoder ? { integrityDecoder: opts.integrityDecoder } : {}),
  });
  return {
    app,
    db,
    mailer,
    async close() {
      await app.close();
      await db.end();
    },
  };
}

/** The session cookie value from a response, if it set one. */
export function sessionCookie(res: LightMyRequestResponse): string | undefined {
  return res.cookies.find((c) => c.name === 'nyrgo_session' && c.value)?.value;
}

export const cookieHeader = (token: string) => ({ cookie: `nyrgo_session=${token}` });

export const randomEmail = () => `p-${randomBytes(5).toString('hex')}@example.test`;

/**
 * Each simulated player gets its own client IP so the real per-IP rate limits stay on
 * in tests without one test's traffic exhausting another's budget.
 */
export const randomIp = () => `10.${[...randomBytes(3)].join('.')}`;

export function injectAs(app: FastifyInstance, opts: InjectOptions) {
  return app.inject({ remoteAddress: randomIp(), ...opts });
}

export async function createGuest(app: FastifyInstance, birthYear = 1995) {
  const res = await injectAs(app, {
    method: 'POST',
    url: '/v1/auth/guest',
    payload: { birthYear, birthMonth: 6 },
  });
  return { res, token: sessionCookie(res)!, profile: res.json() };
}

export function tokenFromLink(link: string | undefined): string {
  const t = link ? new URL(link).searchParams.get('token') : null;
  if (!t) throw new Error('no token in link');
  return t;
}
