import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@nyrgo/shared';
import { syncContent } from '../src/modules/content/sync.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

const HERE = { lat: 37.8847, lng: -4.7792 };
const north = (m: number) => ({ lat: HERE.lat + m / 111_195, lng: HERE.lng });

describe.skipIf(!TEST_DB_URL)('friends and face-to-face trades', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
    await syncContent(t.db);
  });
  afterAll(() => t.close());

  async function player(birthYear = 1995) {
    const g = await createGuest(t.app, birthYear);
    const id = g.profile.id as string;
    const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
      injectAs(t.app, {
        method,
        url,
        ...(payload ? { payload } : {}),
        headers: cookieHeader(g.token),
      });
    const code = async () => (await call('GET', '/v1/friends')).json().code as string;
    const at = (p: { lat: number; lng: number }) =>
      call('POST', '/v1/world/nearby', { ...p, accuracy: 8 });
    /** Gives this player a creature (as if caught) and returns its id. */
    const creature = async (species = 'gwisp', level = 5) => {
      const { rows } = await t.db.query<{ id: string }>(
        `INSERT INTO creature_instances (definition_id, owner_id, level, ivs, hp_current, acquired_via, acquired_ref)
         VALUES ($1, $2, $3, '{"hp":5,"atk":5,"def":5,"spd":5}', 30, 'capture', gen_random_uuid()) RETURNING id`,
        [species, id, level],
      );
      return rows[0]!.id;
    };
    const owner = async (cid: string) =>
      (
        await t.db.query<{ o: string }>(
          `SELECT owner_id AS o FROM creature_instances WHERE id = $1`,
          [cid],
        )
      ).rows[0]!.o;
    return { id, call, code, at, creature, owner };
  }

  async function friends() {
    const a = await player();
    const b = await player();
    expect((await a.call('POST', '/v1/friends', { code: await b.code() })).json().status).toBe(
      'requested',
    );
    const inc = (await b.call('GET', '/v1/friends')).json().incoming;
    expect(inc).toEqual([expect.objectContaining({ id: a.id })]);
    expect((await b.call('POST', `/v1/friends/${a.id}/accept`)).json().status).toBe('friends');
    return { a, b };
  }

  it('adds friends by code, both ways, with name and level only', async () => {
    const { a, b } = await friends();
    const list = (await a.call('GET', '/v1/friends')).json();
    expect(list.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(list.friends).toEqual([{ id: b.id, name: expect.any(String), level: 1, caught: 0 }]);
    expect((await a.call('POST', '/v1/friends', { code: 'NOPE2345' })).json().code).toBe(
      'friend_code_unknown',
    );
    expect((await a.call('POST', '/v1/friends', { code: list.code })).json().code).toBe(
      'friend_code_unknown',
    );
  });

  it('keeps adults and under-18s apart', async () => {
    const adult = await player();
    const teen = await player(new Date().getFullYear() - 16);
    expect((await adult.call('POST', '/v1/friends', { code: await teen.code() })).json().code).toBe(
      'friend_age_mismatch',
    );
  });

  it('swaps two creatures when both players stand together', async () => {
    const { a, b } = await friends();
    const ga = await a.creature('gwisp');
    await a.creature('burnlet'); // so it is not a's last creature
    const gb = await b.creature('dropling');
    await b.creature('frostkey');

    const offer = (await b.call('GET', `/v1/friends/${a.id}/creatures`)).json().creatures;
    expect(offer.map((c: { id: string }) => c.id)).toContain(ga);
    const p = (await a.call('POST', '/v1/trades', { to: b.id, give: ga, want: gb })).json();
    expect(p.status).toBe('pending');

    // too far apart
    await a.at(HERE);
    await b.at(north(500));
    expect((await b.call('POST', `/v1/trades/${p.id}/accept`)).json().code).toBe('trade_too_far');

    // side by side
    await b.at(north(30));
    const done = await b.call('POST', `/v1/trades/${p.id}/accept`);
    expect(done.json()).toEqual({ status: 'done' });
    expect(await a.owner(gb)).toBe(a.id);
    expect(await b.owner(ga)).toBe(b.id);
    const mine = (await b.call('GET', '/v1/me/creatures')).json().creatures;
    expect(mine.find((c: { id: string }) => c.id === ga)).toMatchObject({ acquiredVia: 'trade' });
    const dex = (await b.call('GET', '/v1/me/dex')).json().entries;
    expect(
      dex.find((d: { creatureId: string }) => d.creatureId === 'gwisp').caughtAt,
    ).not.toBeNull();
    // done once
    expect((await b.call('POST', `/v1/trades/${p.id}/accept`)).json().code).toBe('not_found');
  });

  it('never trades NFTs, a last creature, or with strangers, and stops at the daily limit', async () => {
    const { a, b } = await friends();
    const only = await a.creature();
    const gb = await b.creature();
    await b.creature();
    expect(
      (await a.call('POST', '/v1/trades', { to: b.id, give: only, want: gb })).json().code,
    ).toBe('trade_unavailable');
    const second = await a.creature();
    await t.db.query(`UPDATE creature_instances SET onchain_status = 'minted' WHERE id = $1`, [
      second,
    ]);
    expect(
      (await a.call('POST', '/v1/trades', { to: b.id, give: second, want: gb })).json().code,
    ).toBe('trade_unavailable');
    const stranger = await player();
    const sc = await stranger.creature();
    expect(
      (await a.call('POST', '/v1/trades', { to: stranger.id, give: only, want: sc })).json().code,
    ).toBe('not_friends');

    // the daily limit
    await a.at(HERE);
    await b.at(north(10));
    for (let i = 0; i < DEFAULT_CONFIG.social.tradesPerDay; i++) {
      const x = await a.creature();
      const y = await b.creature();
      const p = (await a.call('POST', '/v1/trades', { to: b.id, give: x, want: y })).json();
      expect((await b.call('POST', `/v1/trades/${p.id}/accept`)).json().status).toBe('done');
    }
    const x = await a.creature();
    const y = await b.creature();
    const p = (await a.call('POST', '/v1/trades', { to: b.id, give: x, want: y })).json();
    expect((await b.call('POST', `/v1/trades/${p.id}/accept`)).json().code).toBe('trade_limit');
  });

  it('ending a friendship cancels its pending trades', async () => {
    const { a, b } = await friends();
    const x = await a.creature();
    await a.creature();
    const y = await b.creature();
    await b.creature();
    const p = (await a.call('POST', '/v1/trades', { to: b.id, give: x, want: y })).json();
    expect((await b.call('DELETE', `/v1/friends/${a.id}`)).statusCode).toBe(204);
    const trades = (await a.call('GET', '/v1/trades')).json().trades;
    expect(trades.find((tr: { id: string }) => tr.id === p.id).status).toBe('cancelled');
  });
});
