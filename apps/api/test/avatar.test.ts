import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '@nyrgo/shared';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

describe.skipIf(!TEST_DB_URL)('avatar and cosmetics', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
  });
  afterAll(() => t.close());

  async function player(gold: number) {
    const g = await createGuest(t.app);
    await t.db.query(`UPDATE players SET gold = $2 WHERE user_id = $1`, [g.profile.id, gold]);
    const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object, key?: string) =>
      injectAs(t.app, {
        method,
        url,
        ...(payload ? { payload } : {}),
        headers: { ...cookieHeader(g.token), ...(key ? { 'idempotency-key': key } : {}) },
      });
    return { id: g.profile.id as string, call };
  }

  it('starts with the default look and wears any free piece', async () => {
    const p = await player(0);
    expect((await p.call('GET', '/v1/me/avatar')).json()).toEqual({
      avatar: DEFAULT_AVATAR,
      owned: [],
      gold: 0,
    });
    const look = { ...DEFAULT_AVATAR, skin: 'skin_4', hair: 'hair_ponytail', hairColor: 'hc_red' };
    const r = await p.call('PUT', '/v1/me/avatar', { avatar: look });
    expect(r.statusCode).toBe(200);
    expect(r.json().avatar).toEqual(look);
    expect((await p.call('GET', '/v1/me/avatar')).json().avatar).toEqual(look);
  });

  it('sells each cosmetic once for Gold, then lets it be worn', async () => {
    const p = await player(100);
    const crown = { ...DEFAULT_AVATAR, hat: 'hat_cap' };
    expect((await p.call('PUT', '/v1/me/avatar', { avatar: crown })).json().code).toBe(
      'validation_failed',
    );
    const buy = await p.call('POST', '/v1/me/cosmetics/buy', { item: 'hat_cap' }, 'key-cap-1');
    expect(buy.json()).toMatchObject({ owned: ['hat_cap'], gold: 40 });
    // a retry is not charged again
    const again = await p.call('POST', '/v1/me/cosmetics/buy', { item: 'hat_cap' }, 'key-cap-1');
    expect(again.json()).toMatchObject({ gold: 40 });
    // a second purchase of the same piece is refused, and nothing is charged
    expect(
      (await p.call('POST', '/v1/me/cosmetics/buy', { item: 'hat_cap' }, 'key-cap-2')).json().code,
    ).toBe('conflict');
    expect((await p.call('PUT', '/v1/me/avatar', { avatar: crown })).json().avatar.hat).toBe(
      'hat_cap',
    );
    // not enough Gold: nothing bought, nothing spent
    expect(
      (await p.call('POST', '/v1/me/cosmetics/buy', { item: 'hat_crown' }, 'key-crown')).json()
        .code,
    ).toBe('insufficient_gold');
    expect((await p.call('GET', '/v1/me/avatar')).json()).toMatchObject({
      owned: ['hat_cap'],
      gold: 40,
    });
    // free pieces and unknown ones are not for sale
    expect(
      (await p.call('POST', '/v1/me/cosmetics/buy', { item: 'skin_1' }, 'key-free')).json().code,
    ).toBe('not_found');
    const ledger = await t.db.query(
      `SELECT amount, reason FROM gold_ledger WHERE user_id = $1 AND reason = 'cosmetic'`,
      [p.id],
    );
    expect(ledger.rows).toEqual([{ amount: '-60', reason: 'cosmetic' }]);
  });

  it('refuses pieces in the wrong slot and unknown slots', async () => {
    const p = await player(0);
    expect(
      (
        await p.call('PUT', '/v1/me/avatar', { avatar: { ...DEFAULT_AVATAR, hat: 'skin_1' } })
      ).json().code,
    ).toBe('validation_failed');
    expect(
      (await p.call('PUT', '/v1/me/avatar', { avatar: { ...DEFAULT_AVATAR, wings: 'x' } })).json()
        .code,
    ).toBe('validation_failed');
  });
});
