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

describe.skipIf(!TEST_DB_URL)('leaderboards', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
    await syncContent(t.db);
  });
  afterAll(() => t.close());

  async function player(birthYear = 1995) {
    const g = await createGuest(t.app, birthYear);
    const id = g.profile.id as string;
    const get = (by: string) =>
      injectAs(t.app, {
        method: 'GET',
        url: `/v1/leaderboards?by=${by}`,
        headers: cookieHeader(g.token),
      });
    return { id, get };
  }

  it('ranks players of the same age group by level, captures and species', async () => {
    const top = await player();
    const other = await player();
    const teen = await player(new Date().getFullYear() - 15);
    // far ahead of anyone else in the test database (earlier runs included)
    const big = 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000);
    await t.db.query(`UPDATE players SET level = 49, xp = 999999999 WHERE user_id = $1`, [top.id]);
    await t.db.query(`UPDATE players SET level = 49, xp = 999999999 WHERE user_id = $1`, [teen.id]);
    await t.db.query(
      `INSERT INTO dex_entries (user_id, definition_id, caught_at, caught_count) VALUES
         ($1, 'gwisp', now(), $2), ($1, 'burnlet', now(), 3)`,
      [top.id, big],
    );
    const lv = (await other.get('level')).json();
    expect(lv.top.find((r: { id: string }) => r.id === top.id)).toMatchObject({
      rank: 1,
      value: 49,
    });
    expect(lv.top.map((r: { id: string }) => r.id)).not.toContain(teen.id);
    expect(lv.me.rank).toBeGreaterThan(1);
    const cap = (await top.get('captures')).json();
    expect(cap.top.find((r: { id: string }) => r.id === top.id)).toMatchObject({
      value: big + 3,
      me: true,
    });
    expect(cap.me.value).toBe(big + 3);
    expect(cap.me.rank).toBe(cap.top.find((r: { id: string }) => r.id === top.id).rank);
    const sp = (await top.get('species')).json();
    expect(sp.me.value).toBe(2);
    expect((await top.get('arena')).json().season).toMatch(/^\d{4}-\d{2}$/);
    expect((await top.get('nope')).statusCode).toBe(400);
  });
});
