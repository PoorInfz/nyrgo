import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, hubMap, houseRoomId, normaliseLook } from '@nyrgo/shared';
import { syncContent } from '../src/modules/content/sync.js';
import { Room } from '../src/modules/hub/room.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

const hub = DEFAULT_CONFIG.hub;
type Msg = { t: string; [k: string]: unknown };

describe.skipIf(!TEST_DB_URL)('the town market and houses', () => {
  let t: TestApp;
  const plaza = new Room('plaza', { autoTick: false });
  const rooms = new Map<string, Room>([['plaza', plaza]]);
  beforeAll(async () => {
    t = await makeTestApp({ hubRooms: rooms });
    await syncContent(t.db);
  });
  afterAll(() => t.close());

  async function player(birthYear = 1995, gold = 0) {
    const g = await createGuest(t.app, birthYear);
    const id = g.profile.id as string;
    await t.db.query(`UPDATE players SET gold = $2 WHERE user_id = $1`, [id, gold]);
    const call = (
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      url: string,
      payload?: object,
      key?: string,
    ) =>
      injectAs(t.app, {
        method,
        url,
        ...(payload ? { payload } : {}),
        headers: {
          ...cookieHeader(g.token),
          origin: 'http://app.test',
          ...(key ? { 'idempotency-key': key } : {}),
        },
      });
    const give = (item: string, qty: number) =>
      t.db.query(
        `INSERT INTO inventory (user_id, item_id, qty) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, item_id) DO UPDATE SET qty = inventory.qty + EXCLUDED.qty`,
        [id, item, qty],
      );
    const has = async (item: string) =>
      Number(
        (
          await t.db.query<{ qty: number }>(
            `SELECT qty FROM inventory WHERE user_id = $1 AND item_id = $2`,
            [id, item],
          )
        ).rows[0]?.qty ?? 0,
      );
    const goldNow = async () =>
      Number(
        (await t.db.query<{ gold: string }>(`SELECT gold FROM players WHERE user_id = $1`, [id]))
          .rows[0]!.gold,
      );
    /** Stands the player on the square (as if they had walked in). */
    const arrive = () =>
      plaza.join({
        userId: id,
        name: 'p',
        level: 1,
        look: normaliseLook(null),
        companion: null,
        ageGroup: birthYear < 2000 ? 'adult' : 'minor',
        muted: new Set(),
        socket: { send: () => undefined, close: () => undefined },
      });
    return { id, token: g.token, call, give, has, goldNow, arrive };
  }

  it('sells items between players for Gold, minus the fee, once', async () => {
    const seller = await player();
    const buyer = await player(1995, 500);
    const teen = await player(new Date().getFullYear() - 15, 500);
    await seller.give('vault-basic', 6);
    const listing = { item: 'vault-basic', qty: 5, price: 100 };
    expect((await seller.call('POST', '/v1/hub/market/listings', listing)).json().code).toBe(
      'hub_not_here',
    );
    seller.arrive();
    const made = (await seller.call('POST', '/v1/hub/market/listings', listing)).json();
    expect(made.fee).toBe(5);
    expect(await seller.has('vault-basic')).toBe(1);

    const seen = (await buyer.call('GET', '/v1/hub/market')).json();
    expect(seen.listings.map((l: { id: string }) => l.id)).toContain(made.id);
    // other age groups never see it
    const teens = (await teen.call('GET', '/v1/hub/market')).json();
    expect(teens.listings.map((l: { id: string }) => l.id)).not.toContain(made.id);

    buyer.arrive();
    const key = randomUUID();
    const buy = () => buyer.call('POST', `/v1/hub/market/listings/${made.id}/buy`, undefined, key);
    const first = await buy();
    expect(first.statusCode).toBe(200);
    expect(first.json().bought).toEqual({ itemId: 'vault-basic', qty: 5, price: 100 });
    // the same request again (a retry) is not charged twice
    expect((await buy()).json()).toEqual(first.json());
    expect(await buyer.goldNow()).toBe(400);
    expect(await buyer.has('vault-basic')).toBe(5);
    expect(await seller.goldNow()).toBe(95);
    const again = await buyer.call(
      'POST',
      `/v1/hub/market/listings/${made.id}/buy`,
      undefined,
      randomUUID(),
    );
    expect(again.json().code).toBe('listing_gone');
  });

  it('refuses buying without the Gold, and gives items back on withdrawal and expiry', async () => {
    const seller = await player();
    const poor = await player(1995, 10);
    await seller.give('vault-basic', 4);
    seller.arrive();
    poor.arrive();
    const a = (
      await seller.call('POST', '/v1/hub/market/listings', {
        item: 'vault-basic',
        qty: 2,
        price: 50,
      })
    ).json();
    const b = (
      await seller.call('POST', '/v1/hub/market/listings', {
        item: 'vault-basic',
        qty: 2,
        price: 60,
      })
    ).json();
    expect(await seller.has('vault-basic')).toBe(0);
    expect(
      (
        await poor.call('POST', `/v1/hub/market/listings/${a.id}/buy`, undefined, randomUUID())
      ).json().code,
    ).toBe('insufficient_gold');
    expect((await seller.call('DELETE', `/v1/hub/market/listings/${a.id}`)).statusCode).toBe(200);
    expect(await seller.has('vault-basic')).toBe(2);
    await t.db.query(
      `UPDATE hub_listings SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [b.id],
    );
    const mine = (await seller.call('GET', '/v1/hub/market')).json().mine;
    expect(mine.find((l: { id: string }) => l.id === b.id).status).toBe('expired');
    expect(await seller.has('vault-basic')).toBe(4);
    // not more items than you have
    expect(
      (
        await seller.call('POST', '/v1/hub/market/listings', {
          item: 'vault-basic',
          qty: 9,
          price: 60,
        })
      ).json().code,
    ).toBe('out_of_items');
  });

  it('caps open listings per player', async () => {
    const s = await player();
    await s.give('vault-basic', hub.marketListingsMax + 1);
    s.arrive();
    for (let i = 0; i < hub.marketListingsMax; i++) {
      expect(
        (await s.call('POST', '/v1/hub/market/listings', { item: 'vault-basic', qty: 1, price: 5 }))
          .statusCode,
      ).toBe(200);
    }
    expect(
      (
        await s.call('POST', '/v1/hub/market/listings', { item: 'vault-basic', qty: 1, price: 5 })
      ).json().code,
    ).toBe('listing_limit');
  });

  it('sells furniture and saves a house layout only with owned pieces on the floor', async () => {
    const p = await player(1995, 1000);
    p.arrive();
    const buy = (item: string) => p.call('POST', '/v1/hub/furniture/buy', { item }, randomUUID());
    expect((await buy('sofa-red')).json()).toMatchObject({ item: 'sofa-red', owned: 1 });
    expect((await buy('rug-blue')).json().owned).toBe(1);
    expect(await p.goldNow()).toBe(1000 - 220 - 110);
    const spawn = hubMap(houseRoomId('x'))!.spawn;
    const ok = await p.call('PUT', '/v1/hub/house', {
      layout: [
        { f: 'rug-blue', x: spawn.x, y: spawn.y - 100, flip: false },
        { f: 'sofa-red', x: spawn.x, y: spawn.y - 60, flip: true },
      ],
    });
    expect(ok.statusCode).toBe(200);
    // two sofas when you own one, or a sofa inside a wall
    expect(
      (
        await p.call('PUT', '/v1/hub/house', {
          layout: [
            { f: 'sofa-red', x: spawn.x, y: spawn.y - 60, flip: false },
            { f: 'sofa-red', x: spawn.x, y: spawn.y - 80, flip: false },
          ],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await p.call('PUT', '/v1/hub/house', {
          layout: [{ f: 'sofa-red', x: 4, y: 4, flip: false }],
        })
      ).statusCode,
    ).toBe(400);
    const h = (await p.call('GET', `/v1/hub/house/${p.id}`)).json();
    expect(h).toMatchObject({ mine: true, privacy: 'friends' });
    expect(h.layout).toHaveLength(2);
  });

  it('lets visitors in according to the owner, and shows them out when the door closes', async () => {
    const owner = await player();
    const guest = await player();
    const teen = await player(new Date().getFullYear() - 15);
    expect((await guest.call('GET', `/v1/hub/house/${owner.id}`)).json().code).toBe('house_closed');
    await owner.call('PUT', '/v1/hub/house', { privacy: 'public' });
    expect((await guest.call('GET', `/v1/hub/house/${owner.id}`)).statusCode).toBe(200);
    expect((await teen.call('GET', `/v1/hub/house/${owner.id}`)).json().code).toBe('house_closed');
    const list = (await guest.call('GET', '/v1/hub/houses')).json();
    expect(list.open.map((h: { id: string }) => h.id)).toContain(owner.id);

    // walk in through a house door on the square
    const ws = await t.app.injectWS('/v1/hub/ws', {
      headers: { ...cookieHeader(guest.token), origin: 'http://app.test' },
    });
    const got: Msg[] = [];
    ws.on('message', (d: Buffer) => got.push(JSON.parse(d.toString()) as Msg));
    const wait = async (pred: (m: Msg) => boolean) => {
      for (let i = 0; i < 100; i++) {
        const hit = got.find(pred);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error('timed out');
    };
    await wait((m) => m.t === 'welcome');
    ws.send(JSON.stringify({ t: 'visit', owner: owner.id }));
    expect(await wait((m) => m.t === 'error')).toEqual({ t: 'error', code: 'too_far' });
    const door = plaza.map.interactions.find((i) => i.id === 'house-red')!;
    const me = plaza.members.get(guest.id)!;
    me.x = door.x;
    me.y = door.y;
    ws.send(JSON.stringify({ t: 'visit', owner: owner.id }));
    const inside = await wait((m) => m.t === 'welcome' && m.room === houseRoomId(owner.id));
    expect(inside).toBeTruthy();
    expect(rooms.get(houseRoomId(owner.id))!.members.has(guest.id)).toBe(true);

    // the owner closes the door: the guest is back on the square
    got.length = 0;
    await owner.call('PUT', '/v1/hub/house', { privacy: 'private' });
    const out = await wait((m) => m.t === 'welcome' && m.room === 'plaza');
    expect(out).toBeTruthy();
    // and the empty house room is gone
    expect(rooms.has(houseRoomId(owner.id))).toBe(false);
    ws.terminate();
  });
});
