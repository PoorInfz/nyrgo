import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTENT_VERSION } from '@nyrgo/shared';
import { syncContent } from '../src/modules/content/sync.js';
import { TEST_DB_URL, injectAs, makeTestApp, type TestApp } from './helpers.js';

describe.skipIf(!TEST_DB_URL)('content', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
  });
  afterAll(() => t.close());

  it('loads every definition and is idempotent', async () => {
    const first = await syncContent(t.db);
    const second = await syncContent(t.db);
    expect(second).toEqual({ ...first, retired: 0 });
    const { rows } = await t.db.query<{ table: string; n: number }>(
      `SELECT 'creatures' AS table, count(*)::int AS n FROM creature_definitions WHERE NOT retired
       UNION ALL SELECT 'items', count(*)::int FROM item_definitions WHERE NOT retired
       UNION ALL SELECT 'recipes', count(*)::int FROM recipes WHERE NOT retired`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.table, r.n]))).toEqual({
      creatures: 50,
      items: 11,
      recipes: 5,
    });
  });

  it('links evolutions, including the 30-day HODL one', async () => {
    const { rows } = await t.db.query(
      `SELECT id, evolves_to, evolve_level, evolve_hold_days, evolve_cost
         FROM creature_definitions WHERE id IN ('gwisp', 'paperpaw', 'zeroknowl') ORDER BY dex`,
    );
    expect(rows).toEqual([
      {
        id: 'gwisp',
        evolves_to: 'gasguzzle',
        evolve_level: 16,
        evolve_hold_days: null,
        evolve_cost: { gold: 500, materials: { 'hash-shard': 3 } },
      },
      {
        id: 'paperpaw',
        evolves_to: 'diamondpaw',
        evolve_level: null,
        evolve_hold_days: 30,
        evolve_cost: { gold: 500, materials: { 'hash-shard': 3 } },
      },
      {
        id: 'zeroknowl',
        evolves_to: null,
        evolve_level: null,
        evolve_hold_days: null,
        evolve_cost: null,
      },
    ]);
  });

  it('retires definitions that left the code instead of deleting them', async () => {
    await t.db.query(
      `INSERT INTO creature_definitions (id, name, element, rarity, base_hp, base_atk, base_def,
         base_spd, skills, capture_difficulty, biomes, config_version)
       VALUES ('oldie', 'Oldie', 'fire', 'common', 1, 1, 1, 1, '{}', 10, '{}', 0)
       ON CONFLICT (id) DO UPDATE SET retired = false`,
    );
    const r = await syncContent(t.db);
    expect(r.retired).toBe(1);
    const row = await t.db.query(`SELECT retired FROM creature_definitions WHERE id = 'oldie'`);
    expect(row.rows[0].retired).toBe(true);
  });

  it('records the content version once', async () => {
    const { rows } = await t.db.query(
      `SELECT count(*)::int AS n FROM config_versions
        WHERE scope = 'content' AND (payload->>'version')::int = $1`,
      [CONTENT_VERSION],
    );
    expect(rows[0].n).toBe(1);
  });

  it('serves the encyclopedia publicly with caching', async () => {
    const res = await injectAs(t.app, { method: 'GET', url: '/v1/dex' });
    expect(res.statusCode).toBe(200);
    const dex = res.json();
    expect(dex.creatures).toHaveLength(50);
    expect(dex.elements).toHaveLength(10);
    expect(dex.creatures[0]).toMatchObject({ id: 'gwisp', dex: 1, art: '/creatures/gwisp.svg' });
    expect(dex.creatures[0].passive.name.es).toBe('Peaje');
    expect(res.headers['cache-control']).toContain('max-age');
    const again = await injectAs(t.app, {
      method: 'GET',
      url: '/v1/dex',
      headers: { 'if-none-match': String(res.headers.etag) },
    });
    expect(again.statusCode).toBe(304);
  });
});
