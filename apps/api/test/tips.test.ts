import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@nyrgo/shared';
import { withTx } from '../src/db.js';
import { awardTip, nearString, tipYocto } from '../src/modules/tips/award.js';
import { ChainNoAnswer, ChainRefused, type TipChain } from '../src/modules/tips/chain.js';
import { ensureTodaysPool, runTips } from '../src/modules/tips/payout.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

const cfg = DEFAULT_CONFIG.tips;
const NEAR = 10n ** 24n;

function fakeTreasury(balance = 10n * NEAR) {
  const sent: { to: string; yocto: bigint }[] = [];
  let next: 'ok' | 'refuse' | 'silence' = 'ok';
  const chain: TipChain = {
    treasury: 'rewards.game.testnet',
    async balance() {
      return balance;
    },
    async send(to, yocto) {
      const how = next;
      next = 'ok';
      if (how === 'refuse') throw new ChainRefused('transfer: LackBalanceForState');
      if (how === 'silence') throw new ChainNoAnswer('transfer: fetch failed');
      sent.push({ to, yocto });
      return { txHash: `tx${sent.length}` };
    },
  };
  return { chain, sent, failNext: (h: 'refuse' | 'silence') => (next = h) };
}

const somewhere = () => ({
  lat: 40 + randomBytes(2).readUInt16BE(0) / 6000,
  lng: -3 + randomBytes(2).readUInt16BE(0) / 6000,
});
const north = (p: { lat: number; lng: number }, m: number) => ({
  lat: p.lat + m / 111_195,
  lng: p.lng,
});

describe.skipIf(!TEST_DB_URL)('NEAR tips for walking to a creature and catching it', () => {
  let t: TestApp;
  const treasury = fakeTreasury();
  const on = { enabled: true, network: 'testnet' };

  beforeAll(async () => {
    t = await makeTestApp({ tipChain: treasury.chain });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.db.query(`DELETE FROM tips`);
    await t.db.query(`DELETE FROM tips_pool`);
    await ensureTodaysPool(t.db, treasury.chain);
  });

  async function player(birthYear = 1995, wallet = true) {
    const g = await createGuest(t.app, birthYear);
    const id = g.profile.id as string;
    const account = `p${randomBytes(4).toString('hex')}.testnet`;
    if (wallet) {
      await t.db.query(
        `INSERT INTO wallet_links (user_id, network, account_id, public_key)
         VALUES ($1, 'testnet', $2, 'ed25519:test')`,
        [id, account],
      );
    }
    const call = (url: string) =>
      injectAs(t.app, { method: 'GET', url, headers: cookieHeader(g.token) });
    /** A catch at `p`: a spawn there and the tip decision for it. */
    const caught = async (p: { lat: number; lng: number }) => {
      const { rows } = await t.db.query<{ id: string }>(
        `INSERT INTO spawns (h3_r9, definition_id, level, geom, seed, window_start, expires_at)
         VALUES (h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint($2, $1), 4326), 9), 'gwisp', 4,
                 ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3,
                 now() - interval '1 minute', now() + interval '10 minutes')
         RETURNING id`,
        [p.lat, p.lng, randomBytes(6).readUIntBE(0, 6)],
      );
      return withTx(t.db, (c) => awardTip(c, on, id, rows[0]!.id, randomUUID()));
    };
    /** Pretends the last tip was earned `min` minutes ago. */
    const later = (min: number) =>
      t.db.query(
        `UPDATE tips SET created_at = created_at - make_interval(mins => $2) WHERE user_id = $1`,
        [id, min],
      );
    return { id, account, call, caught, later };
  }

  it('sets a daily budget from the treasury and pays a tip for a catch', async () => {
    const { rows } = await t.db.query<{ b: string }>(
      `SELECT budget_yocto::text AS b FROM tips_pool`,
    );
    const reserve = BigInt(cfg.poolReserveMilliNear) * 10n ** 21n;
    expect(BigInt(rows[0]!.b)).toBe(((10n * NEAR - reserve) * 300n) / 10_000n);

    const p = await player();
    const r = await p.caught(somewhere());
    expect(r.reason).toBeNull();
    expect(r.tip).toMatchObject({ amountNear: '0.005', status: 'pending' });

    const job = await runTips(t.db, treasury.chain);
    expect(job).toMatchObject({ sent: 1 });
    expect(treasury.sent.at(-1)).toEqual({ to: p.account, yocto: tipYocto() });
    const mine = (await p.call('/v1/me/tips')).json();
    expect(mine).toMatchObject({ enabled: true, today: 1 });
    expect(mine.tips[0]).toMatchObject({
      amountNear: '0.005',
      status: 'sent',
      txHash: expect.any(String),
    });
    expect(mine.nextTipAt).not.toBeNull();
  });

  it('needs an hour and 100 m between tips, and stops at the daily limit', async () => {
    const p = await player();
    const a = somewhere();
    expect((await p.caught(a)).tip).not.toBeNull();
    expect((await p.caught(north(a, 500))).reason).toBe('too_soon');
    await p.later(cfg.minIntervalMin + 1);
    expect((await p.caught(north(a, cfg.minDistanceM - 30))).reason).toBe('too_close');
    expect((await p.caught(north(a, cfg.minDistanceM + 30))).tip).not.toBeNull();
    let at = north(a, cfg.minDistanceM + 30);
    for (let i = 2; i < cfg.maxPerDay; i++) {
      await p.later(cfg.minIntervalMin + 1);
      at = north(at, cfg.minDistanceM + 30);
      expect((await p.caught(at)).tip).not.toBeNull();
    }
    await p.later(cfg.minIntervalMin + 1);
    expect((await p.caught(north(at, 500))).reason).toBe('daily_limit');
  });

  it('pays only adults with a wallet and no review, while the budget lasts', async () => {
    expect((await (await player(new Date().getFullYear() - 15)).caught(somewhere())).reason).toBe(
      'not_adult',
    );
    expect((await (await player(1995, false)).caught(somewhere())).reason).toBe('no_wallet');
    const risky = await player();
    await t.db.query(`UPDATE users SET risk_level = $2 WHERE id = $1`, [risky.id, cfg.maxRisk]);
    expect((await risky.caught(somewhere())).reason).toBe('under_review');

    await t.db.query(`UPDATE tips_pool SET spent_yocto = budget_yocto`);
    expect((await (await player()).caught(somewhere())).reason).toBe('pool_empty');
    expect(
      (
        await withTx(t.db, (c) =>
          awardTip(c, { ...on, enabled: false }, risky.id, randomUUID(), randomUUID()),
        )
      ).reason,
    ).toBe('tips_off');
  });

  it('gives the budget back when NEAR refuses, and never pays twice when NEAR is silent', async () => {
    const p = await player();
    await p.caught(somewhere());
    treasury.failNext('refuse');
    expect(await runTips(t.db, treasury.chain)).toMatchObject({ failed: 1 });
    const { rows } = await t.db.query<{ s: string }>(
      `SELECT spent_yocto::text AS s FROM tips_pool`,
    );
    expect(rows[0]!.s).toBe('0');
    // a refused tip does not count: the player can earn again right away
    expect((await p.caught(somewhere())).tip).not.toBeNull();
    treasury.failNext('silence');
    expect(await runTips(t.db, treasury.chain)).toMatchObject({ unknown: 1 });
    expect(await runTips(t.db, treasury.chain)).toMatchObject({ sent: 0, unknown: 0 });
    const tips = (await p.call('/v1/me/tips')).json().tips;
    expect(tips.map((x: { status: string }) => x.status)).toEqual(['unknown', 'failed']);
  });

  it('shows the pot publicly', async () => {
    const res = (await injectAs(t.app, { method: 'GET', url: '/v1/rewards' })).json();
    expect(res).toMatchObject({
      enabled: true,
      treasury: 'rewards.game.testnet',
      rules: { amountNear: '0.005', maxPerDay: cfg.maxPerDay, minDistanceM: cfg.minDistanceM },
    });
    expect(res.today.budgetNear).toBe(nearString(((10n * NEAR - 10n ** 23n) * 300n) / 10_000n));
  });
});
