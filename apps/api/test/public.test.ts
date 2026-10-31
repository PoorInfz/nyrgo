import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { maskName } from '../src/modules/public/routes.js';
import { TEST_DB_URL, createGuest, injectAs, makeTestApp, type TestApp } from './helpers.js';

describe('masked names', () => {
  it('keeps the first letter only', () => {
    expect(maskName('Aria')).toBe('A***');
    expect(maskName('Explorer-1234')).toBe('E******');
    expect(maskName('Jo')).toBe('J**');
    expect(maskName('')).toBe('***');
  });
});

describe.skipIf(!TEST_DB_URL)('public catches for the website', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
  });
  afterAll(() => t.close());

  it('shows adults’ catches by cell, masked, an hour late, to any site', async () => {
    const adult = await createGuest(t.app, 1990);
    const teen = await createGuest(t.app, new Date().getFullYear() - 15);
    const lat = -60 - Math.random() * 20; // a cell no other test uses
    const cell = Math.floor(lat * 2) / 2 + 0.25;
    await t.db.query(`UPDATE players SET display_name = 'Zelda' WHERE user_id = $1`, [
      adult.profile.id,
    ]);
    await t.db.query(
      `INSERT INTO capture_marks (user_id, definition_id, cell_lat, cell_lng, created_at) VALUES
         ($1, 'gwisp', $3, 10.25, now() - interval '3 hours'),
         ($1, 'burnlet', $3, 10.25, now() - interval '2 hours'),
         ($1, 'bearkit', $3, 20.25, now() - interval '5 minutes'),
         ($2, 'gwisp', $3, 30.25, now() - interval '3 hours')`,
      [adult.profile.id, teen.profile.id, cell],
    );
    const res = await injectAs(t.app, {
      method: 'GET',
      url: '/v1/public/captures',
      headers: { origin: 'https://nyrgo.fun' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('*');
    const mine = res.json().cells.filter((c: { lat: number }) => Math.abs(c.lat - cell) < 0.01);
    // the latest catch per cell, with the count; not the one from five minutes ago; no teens
    expect(mine).toEqual([
      {
        lat: cell,
        lng: 10.25,
        creature: 'burnlet',
        by: 'Z****',
        day: expect.any(String),
        count: 2,
      },
    ]);
  });
});
