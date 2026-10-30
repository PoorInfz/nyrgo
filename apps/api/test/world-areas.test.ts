import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadNextArea, AREA_RESOLUTION } from '../src/modules/world/areas.js';
import type { OverpassResponse } from '../src/modules/world/osm.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

/** Somewhere far from the pilot city: Lyon. */
const HERE = { lat: 45.7578, lng: 4.832 };

describe.skipIf(!TEST_DB_URL)('the world, loaded where people play', () => {
  let t: TestApp;
  let token: string;
  let area: string;

  beforeAll(async () => {
    t = await makeTestApp({ env: { WORLD_ON_DEMAND: 'true' } });
    token = (await createGuest(t.app)).token;
    const { rows } = await t.db.query<{ a: string }>(
      `SELECT h3_cell_to_parent(h3_lat_lng_to_cell(ST_MakePoint($2, $1), 9), $3)::text AS a`,
      [HERE.lat, HERE.lng, AREA_RESOLUTION],
    );
    area = rows[0]!.a;
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    // each run starts from a world that has never seen this place
    await t.db.query(`DELETE FROM world_areas`);
    await t.db.query(`DELETE FROM spawns WHERE h3_cell_to_parent(h3_r9, $1) = $2::h3index`, [
      AREA_RESOLUTION,
      area,
    ]);
    await t.db.query(
      `DELETE FROM spawn_generations WHERE h3_cell_to_parent(h3_r9, $1) = $2::h3index`,
      [AREA_RESOLUTION, area],
    );
  });

  const nearby = () =>
    injectAs(t.app, {
      method: 'POST',
      url: '/v1/world/nearby',
      payload: { ...HERE, accuracy: 10 },
      headers: cookieHeader(token),
    });

  const empty: OverpassResponse = { elements: [] };

  it('queues a new place and shows no creatures until it is loaded', async () => {
    const res = await nearby();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ area: 'loading', creatures: [] });
    const { rows } = await t.db.query(
      `SELECT h3_r6::text AS a, status FROM world_areas WHERE h3_r6 = $1::h3index`,
      [area],
    );
    expect(rows).toEqual([{ a: area, status: 'pending' }]);
  });

  it('loads the area from OpenStreetMap, then creatures appear', async () => {
    await nearby();
    const boxes: unknown[] = [];
    // load every queued area around the player (the view can cross into a neighbour)
    for (;;) {
      const r = await loadNextArea(t.db, async (b) => {
        boxes.push(b);
        return empty;
      });
      if (!r) break;
      expect(r.status).toBe('ready');
    }
    expect(boxes.length).toBeGreaterThan(0);
    const box = boxes[0] as { south: number; west: number; north: number; east: number };
    expect(box.south).toBeLessThan(box.north);
    expect(box.west).toBeLessThan(box.east);

    const res = await nearby();
    expect(res.json().area).toBe('ready');
    const { rows } = await t.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM spawn_generations
        WHERE h3_cell_to_parent(h3_r9, $1) = $2::h3index`,
      [AREA_RESOLUTION, area],
    );
    expect(rows[0]!.n).toBeGreaterThan(0);
  });

  it('retries a failed load later, with the reason kept', async () => {
    await nearby();
    const r = await loadNextArea(t.db, async () => {
      throw new Error('Overpass unavailable (test)');
    });
    expect(r).toMatchObject({ status: 'failed', error: 'Overpass unavailable (test)' });
    const { rows } = await t.db.query<{ attempts: number; later: boolean }>(
      `SELECT attempts, next_attempt_at > now() AS later FROM world_areas
        WHERE h3_r6 = $1::h3index`,
      [r!.area],
    );
    expect(rows[0]).toEqual({ attempts: 1, later: true });
    expect((await nearby()).json().area).toBe('loading');
  });
});
