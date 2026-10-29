import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifyElements, type BBox } from '../src/modules/world/osm.js';
import { loadWorld } from '../src/modules/world/load.js';
import { SAMPLE } from './fixtures/overpass-sample.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

/** Box that contains every shape in the synthetic sample. */
const BOX: BBox = { south: 37.874, west: -4.801, north: 37.891, east: -4.759 };

describe.skipIf(!TEST_DB_URL)('world data and nearby', () => {
  let t: TestApp;
  let token: string;

  beforeAll(async () => {
    t = await makeTestApp();
    await loadWorld(t.db, BOX, classifyElements(SAMPLE));
    token = (await createGuest(t.app)).token;
  });
  afterAll(() => t.close());

  const nearby = (lat: number, lng: number, accuracy = 10, as = token) =>
    injectAs(t.app, {
      method: 'POST',
      url: '/v1/world/nearby',
      payload: { lat, lng, accuracy },
      headers: cookieHeader(as),
    });

  const excluded = async (lat: number, lng: number, ignore: string[] = []) => {
    const { rows } = await t.db.query<{ x: boolean }>(
      `SELECT is_excluded(ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3::text[]) AS x`,
      [lat, lng, ignore],
    );
    return rows[0]!.x;
  };

  describe('import', () => {
    it('builds polygons, buffers corridors and indexes POIs at H3 resolution 9', async () => {
      const { rows } = await t.db.query(
        `SELECT osm_ref, kind, GeometryType(geom::geometry) AS g FROM exclusion_zones
          WHERE osm_ref IN ('r4','w5','w7','w8','n9') ORDER BY osm_ref`,
      );
      expect(rows).toEqual([
        { osm_ref: 'n9', kind: 'playground', g: 'MULTIPOLYGON' },
        { osm_ref: 'r4', kind: 'water', g: 'MULTIPOLYGON' },
        { osm_ref: 'w5', kind: 'school', g: 'MULTIPOLYGON' },
        { osm_ref: 'w7', kind: 'major_road', g: 'MULTIPOLYGON' },
        { osm_ref: 'w8', kind: 'private_home', g: 'MULTIPOLYGON' },
      ]);
      const poi = await t.db.query(
        `SELECT h3_get_resolution(h3_r9) AS res FROM pois WHERE osm_ref = 'w2'`,
      );
      expect(poi.rows[0].res).toBe(9);
    });

    it('marks the right ground as off limits', async () => {
      expect(await excluded(37.8764, -4.78)).toBe(true); // in the river
      expect(await excluded(37.8764, -4.78, ['water'])).toBe(false);
      expect(await excluded(37.8863, -4.7795)).toBe(true); // in the school
      expect(await excluded(37.8901, -4.78)).toBe(true); // ~11 m from the motorway
      expect(await excluded(37.8906, -4.78)).toBe(false); // ~67 m away
      expect(await excluded(37.8831, -4.7739)).toBe(true); // inside a private home
      expect(await excluded(37.8847, -4.7792)).toBe(false); // the square
    });

    it('re-imports idempotently and removes what disappeared upstream', async () => {
      await t.db.query(`UPDATE pois SET hidden = true, report_count = 7 WHERE osm_ref = 'w2'`);
      const without = {
        ...SAMPLE,
        elements: SAMPLE.elements.filter((e) => !(e.type === 'way' && e.id === 1)),
      };
      const res = await loadWorld(t.db, BOX, classifyElements(without));
      expect(res.removedPois).toBe(1);
      const kept = await t.db.query(`SELECT hidden, report_count FROM pois WHERE osm_ref = 'w2'`);
      expect(kept.rows[0]).toEqual({ hidden: true, report_count: 7 });
      // restore the full sample for the remaining tests
      await loadWorld(t.db, BOX, classifyElements(SAMPLE));
      await t.db.query(`UPDATE pois SET hidden = false, report_count = 0 WHERE osm_ref = 'w2'`);
    });
  });

  describe('POST /v1/world/nearby', () => {
    it('lists visible POIs by distance and never one inside an exclusion zone', async () => {
      const res = await nearby(37.8858, -4.7795);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.attribution).toContain('OpenStreetMap');
      expect(body.cell).toMatch(/^89[0-9a-f]{13}$/);
      const names = body.pois.map((p: { name: string }) => p.name);
      expect(names).toContain('Plaza de Prueba');
      expect(names).not.toContain('Mural del patio');
      const dists = body.pois.map((p: { distanceM: number }) => p.distanceM);
      expect([...dists].sort((a, b) => a - b)).toEqual(dists);
    });

    it('keeps landmarks on bridges even though they sit over water', async () => {
      // A fresh player: the shared one was just ~1 km away, which would count as a jump.
      const fresh = await createGuest(t.app);
      const res = await nearby(37.8764, -4.7775, 10, fresh.token);
      const bridge = res.json().pois.find((p: { name: string }) => p.name === 'Puente de Prueba');
      expect(bridge).toBeDefined();
      expect(bridge.inRange).toBe(true);
    });

    it('stores the sample for anti-cheat with its H3 cell', async () => {
      const g = await createGuest(t.app);
      await nearby(37.8847, -4.7792, 8, g.token);
      const { rows } = await t.db.query(
        `SELECT h3_r9::text AS cell, accuracy_m FROM location_samples WHERE user_id = $1`,
        [g.profile.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].accuracy_m).toBe(8);
    });

    it('refuses imprecise fixes and anonymous calls', async () => {
      const res = await nearby(37.8847, -4.7792, 80);
      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe('accuracy_too_low');
      const anon = await injectAs(t.app, {
        method: 'POST',
        url: '/v1/world/nearby',
        payload: { lat: 37.88, lng: -4.78, accuracy: 5 },
      });
      expect(anon.statusCode).toBe(401);
    });

    it('validates coordinates', async () => {
      expect((await nearby(91, 0)).statusCode).toBe(400);
      expect((await nearby(0, 181)).statusCode).toBe(400);
    });
  });

  describe('POST /v1/pois/:id/report', () => {
    it('hides a POI once three different players report it', async () => {
      const { rows } = await t.db.query<{ id: string }>(`SELECT id FROM pois WHERE osm_ref = 'n1'`);
      const id = rows[0]!.id;
      const report = (as: string) =>
        injectAs(t.app, {
          method: 'POST',
          url: `/v1/pois/${id}/report`,
          payload: { reason: 'unsafe' },
          headers: cookieHeader(as),
        });

      const a = await createGuest(t.app);
      expect((await report(a.token)).statusCode).toBe(202);
      expect((await report(a.token)).statusCode).toBe(202); // repeat does not count twice
      await report((await createGuest(t.app)).token);
      let row = await t.db.query(`SELECT hidden, report_count FROM pois WHERE id = $1`, [id]);
      expect(row.rows[0]).toEqual({ hidden: false, report_count: 2 });

      await report((await createGuest(t.app)).token);
      row = await t.db.query(`SELECT hidden, report_count FROM pois WHERE id = $1`, [id]);
      expect(row.rows[0]).toEqual({ hidden: true, report_count: 3 });

      const after = await nearby(37.8847, -4.7792);
      expect(after.json().pois.map((p: { id: string }) => p.id)).not.toContain(id);
      await t.db.query(`UPDATE pois SET hidden = false, report_count = 0 WHERE id = $1`, [id]);
      await t.db.query(`DELETE FROM poi_reports WHERE poi_id = $1`, [id]);
    });

    it('answers 404 for unknown places and 400 for bad reasons', async () => {
      const unknown = await injectAs(t.app, {
        method: 'POST',
        url: '/v1/pois/00000000-0000-4000-8000-000000000000/report',
        payload: { reason: 'unsafe' },
        headers: cookieHeader(token),
      });
      expect(unknown.statusCode).toBe(404);
      const bad = await injectAs(t.app, {
        method: 'POST',
        url: '/v1/pois/00000000-0000-4000-8000-000000000000/report',
        payload: { reason: 'boring' },
        headers: cookieHeader(token),
      });
      expect(bad.statusCode).toBe(400);
    });
  });
});
