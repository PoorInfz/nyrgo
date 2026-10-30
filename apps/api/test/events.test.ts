import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syncContent } from '../src/modules/content/sync.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

const ADMIN = 'e'.repeat(40);
const REVIEWER = 'f'.repeat(40);

describe.skipIf(!TEST_DB_URL)('events at places', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp({ env: { ADMIN_TOKENS: `eva:admin:${ADMIN},rev:reviewer:${REVIEWER}` } });
    await syncContent(t.db);
  });
  afterAll(() => t.close());

  const admin = (method: 'GET' | 'POST', url: string, payload?: object, token = ADMIN) =>
    injectAs(t.app, {
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { authorization: `Bearer ${token}` },
    });

  /** A place somewhere unique for this run. */
  async function place() {
    const lat = 41 + randomBytes(2).readUInt16BE(0) / 50_000;
    const lng = -2 + randomBytes(2).readUInt16BE(0) / 50_000;
    const { rows } = await t.db.query<{ id: string }>(
      `INSERT INTO pois (kind, name, geom, h3_r9, biome)
       VALUES ('monument', 'Plaza del Evento', ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
               h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint($2, $1), 4326), 9), 'historic')
       RETURNING id`,
      [lat, lng],
    );
    return { id: rows[0]!.id, lat, lng };
  }

  it('puts a legendary at a place for everyone there, at its own level', async () => {
    const p = await place();
    const made = await admin('POST', '/admin/v1/events', {
      title: 'Genesaur en la plaza',
      poiId: p.id,
      creatureId: 'genesaur',
      level: 30,
      startsAt: new Date().toISOString(),
      durationMin: 60,
      reason: 'test event',
    });
    expect(made.statusCode).toBe(200);
    const ev = (
      await injectAs(t.app, { method: 'GET', url: `/v1/events?lat=${p.lat}&lng=${p.lng}` })
    ).json();
    // (earlier test runs may have left events nearby: look for this one)
    expect(ev.events.find((e: { id: string }) => e.id === made.json().id)).toMatchObject({
      title: 'Genesaur en la plaza',
      creatureId: 'genesaur',
      placeName: 'Plaza del Evento',
      distanceM: 0,
    });

    // a level-1 player standing there sees it at level 30 (wild creatures follow the player)
    const g = await createGuest(t.app);
    const near = (
      await injectAs(t.app, {
        method: 'POST',
        url: '/v1/world/nearby',
        payload: { lat: p.lat, lng: p.lng, accuracy: 5 },
        headers: cookieHeader(g.token),
      })
    ).json();
    const legend = near.creatures.find(
      (c: { eventId: string | null }) => c.eventId === made.json().id,
    );
    expect(legend).toMatchObject({ creatureId: 'genesaur', level: 30 });
    const enc = await injectAs(t.app, {
      method: 'POST',
      url: `/v1/spawns/${legend.id}/encounter`,
      headers: cookieHeader(g.token),
    });
    expect(enc.json()).toMatchObject({ creatureId: 'genesaur', level: 30 });
  });

  it('only admins schedule, everything is audited, and cancelling removes the creature', async () => {
    const p = await place();
    const body = {
      title: 'Zeroknowl',
      poiId: p.id,
      creatureId: 'zeroknowl',
      level: 20,
      startsAt: new Date().toISOString(),
      durationMin: 30,
      reason: 'test event',
    };
    expect((await admin('POST', '/admin/v1/events', body, REVIEWER)).statusCode).toBe(403);
    expect(
      (await admin('POST', '/admin/v1/events', { ...body, creatureId: 'nobody' })).statusCode,
    ).toBe(400);
    const id = (await admin('POST', '/admin/v1/events', body)).json().id;
    expect(
      (await admin('POST', `/admin/v1/events/${id}/cancel`, { reason: 'wrong place' })).json(),
    ).toEqual({
      cancelled: true,
    });
    const ev = (
      await injectAs(t.app, { method: 'GET', url: `/v1/events?lat=${p.lat}&lng=${p.lng}` })
    ).json();
    expect(ev.events.some((e: { id: string }) => e.id === id)).toBe(false);
    const audit = (await admin('GET', '/admin/v1/audit'))
      .json()
      .entries.map((e: { action: string }) => e.action);
    expect(audit).toEqual(expect.arrayContaining(['event.create', 'event.cancel']));
  });
});
