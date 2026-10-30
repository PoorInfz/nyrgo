import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@nyrgo/shared';
import { withTx } from '../src/db.js';
import { ChainNoAnswer, ChainRefused, type FtChain } from '../src/modules/token/chain.js';
import { earnToken } from '../src/modules/token/earn.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

const cfg = DEFAULT_CONFIG.token;

/** A NYRGO contract in memory; `next` decides how the next transfer goes. */
function fakeFt() {
  const registered = new Set<string>();
  const sent: { account: string; amount: number }[] = [];
  let next: 'ok' | 'refuse' | 'silence' = 'ok';
  const chain: FtChain = {
    contractId: 'token.game.testnet',
    async isRegistered(a) {
      return registered.has(a);
    },
    async register(a) {
      registered.add(a);
    },
    async transfer(account, amount) {
      const how = next;
      next = 'ok';
      if (how === 'refuse') throw new ChainRefused('ft_transfer: Smart contract panicked');
      if (how === 'silence') throw new ChainNoAnswer('ft_transfer: fetch failed');
      sent.push({ account, amount });
      return { txHash: `tx${sent.length}` };
    },
  };
  return { chain, sent, registered, failNext: (h: 'refuse' | 'silence') => (next = h) };
}

describe.skipIf(!TEST_DB_URL)('NYRGO: earn by playing, claim to a wallet', () => {
  let t: TestApp;
  const ft = fakeFt();

  beforeAll(async () => {
    t = await makeTestApp({ ftChain: ft.chain });
  });
  afterAll(() => t.close());

  async function player(birthYear = 1995) {
    const g = await createGuest(t.app, birthYear);
    const id = g.profile.id as string;
    const call = (method: 'GET' | 'POST', url: string) =>
      injectAs(t.app, { method, url, headers: cookieHeader(g.token) });
    const earn = (reason: string, n = 1) =>
      withTx(t.db, async (c) => {
        let got = 0;
        for (let i = 0; i < n; i++) got += await earnToken(c, id, reason, `ref-${i}`);
        return got;
      });
    const account = `p${Math.random().toString(36).slice(2, 10)}.testnet`;
    const link = () =>
      t.db.query(
        `INSERT INTO wallet_links (user_id, network, account_id, public_key)
         VALUES ($1, 'testnet', $2, 'ed25519:test')`,
        [id, account],
      );
    const age = (days: number) =>
      t.db.query(`UPDATE users SET created_at = now() - make_interval(days => $2) WHERE id = $1`, [
        id,
        days,
      ]);
    return { id, call, earn, link, age, account };
  }

  it('pays per event up to the daily cap, and nothing to minors', async () => {
    const p = await player();
    expect(await p.earn('capture')).toBe(cfg.rewards.capture);
    expect(await p.earn('capture_attempt')).toBe(0); // not a rewarded reason
    expect(await p.earn('mission', 100)).toBe(cfg.dailyCapPerPlayer - cfg.rewards.capture!);
    const me = (await p.call('GET', '/v1/me/token')).json();
    expect(me).toMatchObject({
      symbol: 'NYRGO',
      enabled: true,
      balance: cfg.dailyCapPerPlayer,
      earnedToday: cfg.dailyCapPerPlayer,
    });

    const minor = await player(new Date().getFullYear() - 15);
    expect(await minor.earn('mission', 3)).toBe(0);
  });

  it('claims the balance to the linked account once the checks pass', async () => {
    const p = await player();
    await p.earn('mission', 2);
    const blocked = async () => (await p.call('GET', '/v1/me/token')).json().blockedBy;
    expect(await blocked()).toBe('wallet_required');
    await p.link();
    expect(await blocked()).toBe('token_account_too_new');
    expect((await p.call('POST', '/v1/me/token/claim')).json().code).toBe('token_account_too_new');
    await p.age(cfg.minAccountAgeDays + 1);
    expect(await blocked()).toBeNull();

    const res = await p.call('POST', '/v1/me/token/claim');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'sent', amount: 20, account: p.account });
    expect(ft.registered.has(p.account)).toBe(true);
    expect(ft.sent.at(-1)).toEqual({ account: p.account, amount: 20 });

    const after = (await p.call('GET', '/v1/me/token')).json();
    expect(after.balance).toBe(0);
    expect(after.claims[0]).toMatchObject({ amount: 20, status: 'sent' });
    // one claim per cooldown
    await p.earn('mission', 2);
    expect(after.blockedBy).toBe('token_cooldown');
    expect((await p.call('POST', '/v1/me/token/claim')).json().code).toBe('token_cooldown');
  });

  it('gives the balance back when NEAR refuses, and holds it when NEAR is silent', async () => {
    const p = await player();
    await p.link();
    await p.age(30);
    await p.earn('mission', 2);

    ft.failNext('refuse');
    expect((await p.call('POST', '/v1/me/token/claim')).json().code).toBe('token_claim_failed');
    let me = (await p.call('GET', '/v1/me/token')).json();
    expect(me.balance).toBe(20);
    expect(me.claims[0].status).toBe('failed');
    expect(me.canClaim).toBe(true); // a refused claim does not start the cooldown

    ft.failNext('silence');
    expect((await p.call('POST', '/v1/me/token/claim')).json().code).toBe('token_claim_unknown');
    me = (await p.call('GET', '/v1/me/token')).json();
    expect(me.balance).toBe(0); // not paid back: it may have arrived
    expect(me.claims[0].status).toBe('unknown');
  });

  it('holds claims for risky accounts and below the minimum', async () => {
    const p = await player();
    await p.link();
    await p.age(30);
    await p.earn('poi_visit', cfg.minClaim - 1);
    expect((await p.call('GET', '/v1/me/token')).json().blockedBy).toBe('token_below_minimum');
    await p.earn('mission');
    await t.db.query(`UPDATE users SET risk_level = $2 WHERE id = $1`, [p.id, cfg.maxRiskToClaim]);
    expect((await p.call('POST', '/v1/me/token/claim')).json().code).toBe('token_review');
  });
});

describe.skipIf(!TEST_DB_URL)('NYRGO switched off', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
  });
  afterAll(() => t.close());

  it('says publicly that it is off', async () => {
    const res = await injectAs(t.app, { method: 'GET', url: '/v1/token' });
    expect(res.json()).toMatchObject({
      symbol: 'NYRGO',
      contractId: null,
      totalSupply: 1_000_000_000,
    });
  });

  it('reports it and refuses claims', async () => {
    const g = await createGuest(t.app);
    const me = await injectAs(t.app, {
      method: 'GET',
      url: '/v1/me/token',
      headers: cookieHeader(g.token),
    });
    expect(me.json()).toMatchObject({
      enabled: false,
      canClaim: false,
      blockedBy: 'token_unavailable',
    });
  });
});
