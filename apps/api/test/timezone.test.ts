import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { timeZoneAt } from '../src/modules/progress/rewards.js';
import { gameDay } from '../src/modules/economy/missions.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

describe('time zone from a location', () => {
  it('finds the zone offline', () => {
    expect(timeZoneAt(37.88, -4.78)).toBe('Europe/Madrid');
    expect(timeZoneAt(40.71, -74.0)).toBe('America/New_York');
    expect(timeZoneAt(-33.87, 151.21)).toBe('Australia/Sydney');
  });
});

describe.skipIf(!TEST_DB_URL)('the game day follows the player', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
  });
  afterAll(() => t.close());

  it('moves to the local zone of where the player plays', async () => {
    const g = await createGuest(t.app);
    const { rows: who } = await t.db.query<{ id: string }>(
      `SELECT user_id AS id FROM sessions WHERE token_hash = sha256(convert_to($1, 'UTF8'))`,
      [g.token],
    );
    const userId = who[0]!.id;
    const zone = async () =>
      (
        await t.db.query<{ tz: string }>(`SELECT time_zone AS tz FROM players WHERE user_id = $1`, [
          userId,
        ])
      ).rows[0]!.tz;
    expect(await zone()).toBe('Europe/Madrid');
    const res = await injectAs(t.app, {
      method: 'POST',
      url: '/v1/world/nearby',
      payload: { lat: -33.8688, lng: 151.2093, accuracy: 10 },
      headers: cookieHeader(g.token),
    });
    expect(res.statusCode).toBe(200);
    expect(await zone()).toBe('Australia/Sydney');
    const { rows } = await t.db.query<{ d: string }>(
      `SELECT to_char(now() AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD') AS d`,
    );
    expect(await gameDay(t.db, userId)).toBe(rows[0]!.d);
  });
});
