import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, HOLDER_TIERS, TOKEN, TOKEN_UNIT } from '@nyrgo/shared';
import { withTx } from '../src/db.js';
import { rankFrom, runHolders } from '../src/modules/holder/ranks.js';
import { awardTip, tipYocto } from '../src/modules/tips/award.js';
import type { TipChain } from '../src/modules/tips/chain.js';
import { ensureTodaysPool } from '../src/modules/tips/payout.js';
import type { NearRpc } from '../src/modules/wallet/rpc.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  daytimeZone,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

const H = 3_600_000;
const tokens = (n: number) => BigInt(n) * TOKEN_UNIT;
const tier = (id: string) => HOLDER_TIERS.find((t) => t.id === id)!;

describe('holder rank from balances', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  /** One snapshot an hour for `hours` hours up to now, with the balance given by `f(hoursAgo)`. */
  const hourly = (hours: number, f: (ago: number) => number) =>
    Array.from({ length: hours + 1 }, (_, i) => hours - i).map((ago) => ({
      at: new Date(now.getTime() - ago * H),
      balance: tokens(f(ago)),
    }));

  it('needs the whole window watched before a rank counts', () => {
    const r = rankFrom(
      hourly(12, () => 5_000_000),
      now,
    );
    expect(r.tier).toBeNull();
    expect(r.next?.tier.id).toBe('h3');
    // it counts a full window after the first snapshot
    expect(r.next!.countsAt.getTime()).toBe(now.getTime() - 12 * H + TOKEN.holdHours * H);
  });

  it('counts the smallest balance of the window', () => {
    const r = rankFrom(
      hourly(48, (ago) => (ago === 10 ? 1_500_000 : 20_000_000)),
      now,
    );
    expect(r.tier).toBe(tier('h1'));
    expect(r.balance).toBe(tokens(20_000_000));
    // the top rank counts a full window after the dip
    expect(r.next?.tier.id).toBe('h5');
    expect(r.next!.countsAt.getTime()).toBe(now.getTime() - 9 * H + TOKEN.holdHours * H);
  });

  it('gives each rank at its amount and nothing below the first', () => {
    for (const t of HOLDER_TIERS) {
      expect(
        rankFrom(
          hourly(24 * 7, () => t.amount),
          now,
        ).tier,
      ).toBe(t);
      expect(
        rankFrom(
          hourly(24 * 7, () => t.amount - 1),
          now,
        ).tier,
      ).not.toBe(t);
    }
    expect(
      rankFrom(
        hourly(24 * 7, () => 999_999),
        now,
      ),
    ).toMatchObject({ tier: null, next: null });
  });

  it('grants nothing on stale balances', () => {
    const old = hourly(48, () => 20_000_000).slice(0, -12);
    expect(rankFrom(old, now)).toMatchObject({ tier: null, stale: true });
  });
});

function fakeRpc(balances: Map<string, bigint>): NearRpc {
  return {
    async accessKey() {
      return 'full';
    },
    async ftBalance(contract, account) {
      expect(contract).toBe('token.game.testnet');
      return balances.get(account) ?? null;
    },
  };
}

const treasury: TipChain = {
  treasury: 'rewards.game.testnet',
  balance: async () => 10n * 10n ** 24n,
  send: async () => ({ txHash: 'tx' }),
};

describe.skipIf(!TEST_DB_URL)('holder ranks in the game', () => {
  let t: TestApp;
  const balances = new Map<string, bigint>();
  const rpc = fakeRpc(balances);

  beforeAll(async () => {
    t = await makeTestApp({
      nearRpc: rpc,
      tipChain: treasury,
      env: { NEAR_TOKEN_CONTRACT: 'token.game.testnet' },
    });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.db.query(`DELETE FROM tips`);
    await t.db.query(`DELETE FROM tips_pool`);
    await ensureTodaysPool(t.db, treasury);
  });

  async function holder(amount: number, hoursHeld: number) {
    const g = await createGuest(t.app, 1990);
    const id = g.profile.id as string;
    await t.db.query(`UPDATE players SET time_zone = $2 WHERE user_id = $1`, [id, daytimeZone()]);
    const account = `h${randomBytes(4).toString('hex')}.testnet`;
    await t.db.query(
      `INSERT INTO wallet_links (user_id, network, account_id, public_key)
       VALUES ($1, 'testnet', $2, 'ed25519:test')`,
      [id, account],
    );
    balances.set(account, tokens(amount));
    // hourly balances, as the job would have kept them
    await t.db.query(
      `INSERT INTO holder_snapshots (user_id, account_id, taken_at, balance)
       SELECT $1, $2, now() - make_interval(hours => h), $3
         FROM generate_series(1, $4) h`,
      [id, account, tokens(amount).toString(), hoursHeld],
    );
    const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
      injectAs(t.app, {
        method,
        url,
        headers: cookieHeader(g.token),
        ...(payload ? { payload } : {}),
      });
    const caught = async () => {
      const lat = 40 + randomBytes(2).readUInt16BE(0) / 6000;
      const lng = -3 + randomBytes(2).readUInt16BE(0) / 6000;
      const { rows } = await t.db.query<{ id: string }>(
        `INSERT INTO spawns (h3_r9, definition_id, level, geom, seed, window_start, expires_at)
         VALUES (h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint($2, $1), 4326), 9), 'gwisp', 4,
                 ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3,
                 now() - interval '1 minute', now() + interval '10 minutes')
         RETURNING id`,
        [lat, lng, randomBytes(6).readUIntBE(0, 6)],
      );
      return withTx(t.db, (c) =>
        awardTip(c, { enabled: true, network: 'testnet' }, id, rows[0]!.id, randomUUID()),
      );
    };
    return { id, account, call, caught };
  }

  it('shows the rank and boosts the NEAR tip by it', async () => {
    const h = await holder(10_000_000, 30); // 1 %: +50 %
    const me = (await h.call('GET', '/v1/me/holder')).json();
    expect(me).toMatchObject({
      contract: 'token.game.testnet',
      account: h.account,
      symbol: 'NYRGO',
      balance: 10_000_000,
      tier: 'h4',
      next: null,
    });
    const r = await h.caught();
    expect(r.tip).toMatchObject({ boostPct: 50, amountNear: '0.0075' });
    const { rows } = await t.db.query<{ a: string; b: number }>(
      `SELECT amount_yocto::text AS a, boost_pct AS b FROM tips WHERE user_id = $1`,
      [h.id],
    );
    expect(BigInt(rows[0]!.a)).toBe((tipYocto() * 150n) / 100n);
    expect(rows[0]!.b).toBe(50);
  });

  it('gives a plain tip when a rank is too new or the boost share of the day is used', async () => {
    const fresh = await holder(20_000_000, 12);
    expect((await fresh.call('GET', '/v1/me/holder')).json()).toMatchObject({
      tier: null,
      next: { tier: 'h5' },
    });
    expect((await fresh.caught()).tip).toMatchObject({ boostPct: 0, amountNear: '0.005' });

    const top = await holder(20_000_000, 30);
    await t.db.query(
      `UPDATE tips_pool SET boost_spent_yocto = floor(budget_yocto * $1)
        WHERE day = (now() AT TIME ZONE 'UTC')::date`,
      [TOKEN.boostShareOfBudget],
    );
    expect((await top.caught()).tip).toMatchObject({ boostPct: 0, amountNear: '0.005' });
  });

  it('lets 0.5 % holders wear holder outfits, and takes them off when the rank drops', async () => {
    const small = await holder(3_000_000, 30);
    const look = (outfit: string) => ({
      avatar: {
        skin: 'skin_2',
        hair: 'hair_short',
        hairColor: 'hc_brown',
        top: 'top_tee_teal',
        hat: 'hat_none',
        accessory: 'acc_none',
        outfit,
      },
    });
    expect((await small.call('GET', '/v1/me/avatar')).json().holderOutfits).toBe(false);
    expect((await small.call('PUT', '/v1/me/avatar', look('skin_knight'))).statusCode).toBe(400);

    const big = await holder(5_000_000, 30);
    expect((await big.call('GET', '/v1/me/avatar')).json().holderOutfits).toBe(true);
    const put = await big.call('PUT', '/v1/me/avatar', look('skin_knight'));
    expect(put.statusCode).toBe(200);
    expect(put.json().avatar.outfit).toBe('skin_knight');

    // the tokens leave: the next hourly read counts the drop and the outfit comes off
    balances.set(big.account, 0n);
    const job = await runHolders(t.db, rpc, 'token.game.testnet', 'testnet');
    expect(job).toMatchObject({ failed: 0 });
    expect(Number(job.read)).toBeGreaterThan(0);
    expect(Number(job.undressed)).toBeGreaterThanOrEqual(1);
    const after = (await big.call('GET', '/v1/me/avatar')).json();
    expect(after).toMatchObject({ holderOutfits: false, avatar: { outfit: 'outfit_none' } });
  });

  it('reads the balance again on request, for adults with a linked account', async () => {
    const h = await holder(1_000_000, 0);
    balances.set(h.account, tokens(3_000_000));
    const r = await h.call('POST', '/v1/me/holder/refresh');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ balance: 3_000_000, tier: null, next: { tier: 'h2' } });

    const g = await createGuest(t.app, 1990);
    const none = await injectAs(t.app, {
      method: 'POST',
      url: '/v1/me/holder/refresh',
      headers: cookieHeader(g.token),
    });
    expect(none.json().code).toBe('wallet_required');
    expect(DEFAULT_CONFIG.tips.amountMilliNear).toBe(5);
  });
});
