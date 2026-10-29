import type { PoolClient } from 'pg';
import { withTx, type Db } from '../../db.js';
import type { BBox, ExclusionRecord, PoiRecord, RawGeometry } from './osm.js';

/** GeoJSON for the raw shape; areas travel as lines and are assembled by ST_BuildArea. */
function geojson(g: RawGeometry): string {
  if (g.type === 'point') return JSON.stringify({ type: 'Point', coordinates: [g.lon, g.lat] });
  if (g.type === 'line') {
    return JSON.stringify({ type: 'LineString', coordinates: g.coords.map((c) => [c.lon, c.lat]) });
  }
  return JSON.stringify({
    type: 'MultiLineString',
    coordinates: g.lines.map((l) => l.map((c) => [c.lon, c.lat])),
  });
}

/** SQL turning (`geo` GeoJSON text, `shape`) into a 4326 geometry; areas are polygonized. */
const SHAPE_SQL = `
  CASE r.shape
    WHEN 'area' THEN ST_CollectionExtract(ST_MakeValid(ST_BuildArea(ST_SetSRID(ST_GeomFromGeoJSON(r.geo), 4326))), 3)
    ELSE ST_SetSRID(ST_GeomFromGeoJSON(r.geo), 4326)
  END`;

const BATCH = 500;

export interface LoadResult {
  pois: number;
  exclusions: number;
  removedPois: number;
  removedExclusions: number;
  dropped: number;
}

async function upsertPois(c: PoolClient, pois: PoiRecord[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < pois.length; i += BATCH) {
    const rows = pois.slice(i, i + BATCH).map((p) => ({
      ref: p.osmRef,
      kind: p.kind,
      biome: p.biome,
      name: p.name || null,
      tags: p.tags,
      shape: p.geometry.type,
      geo: geojson(p.geometry),
    }));
    const res = await c.query(
      `WITH r AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb)
           AS r(ref text, kind text, biome text, name text, tags jsonb, shape text, geo text)
       ), g AS (
         SELECT r.*, ${SHAPE_SQL} AS geom FROM r
       ), p AS (
         SELECT g.*, CASE
             WHEN shape = 'point' THEN geom
             WHEN shape = 'line' THEN ST_LineInterpolatePoint(geom, 0.5)
             ELSE ST_PointOnSurface(geom)
           END AS pt
         FROM g WHERE geom IS NOT NULL AND NOT ST_IsEmpty(geom)
       )
       INSERT INTO pois (osm_ref, source, kind, biome, name, tags, geom, h3_r9, imported_at)
       SELECT ref, 'osm', kind, biome, name, tags, pt::geography, h3_lat_lng_to_cell(pt, 9), now()
         FROM p
       ON CONFLICT (osm_ref) DO UPDATE SET
         kind = EXCLUDED.kind, biome = EXCLUDED.biome, name = EXCLUDED.name, tags = EXCLUDED.tags,
         geom = EXCLUDED.geom, h3_r9 = EXCLUDED.h3_r9, imported_at = EXCLUDED.imported_at`,
      [JSON.stringify(rows)],
    );
    n += res.rowCount ?? 0;
  }
  return n;
}

async function upsertExclusions(c: PoolClient, zones: ExclusionRecord[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < zones.length; i += BATCH) {
    const rows = zones.slice(i, i + BATCH).map((z) => ({
      ref: z.osmRef,
      kind: z.kind,
      // A point or line needs some width to cover ground at all.
      buffer: z.geometry.type === 'area' ? z.bufferM : Math.max(10, z.bufferM),
      shape: z.geometry.type,
      geo: geojson(z.geometry),
    }));
    const res = await c.query(
      `WITH r AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb)
           AS r(ref text, kind text, buffer real, shape text, geo text)
       ), g AS (
         SELECT r.*, ${SHAPE_SQL} AS geom FROM r
       ), z AS (
         SELECT ref, kind, CASE
             WHEN buffer > 0 THEN ST_Buffer(geom::geography, buffer)::geometry
             ELSE geom
           END AS area
         FROM g WHERE geom IS NOT NULL AND NOT ST_IsEmpty(geom)
       )
       INSERT INTO exclusion_zones (osm_ref, source, kind, geom, imported_at)
       SELECT ref, 'osm', kind, ST_Multi(area)::geography, now()
         FROM z WHERE GeometryType(ST_Multi(area)) = 'MULTIPOLYGON'
       ON CONFLICT (osm_ref) DO UPDATE SET
         kind = EXCLUDED.kind, geom = EXCLUDED.geom, imported_at = EXCLUDED.imported_at`,
      [JSON.stringify(rows)],
    );
    n += res.rowCount ?? 0;
  }
  return n;
}

/**
 * Loads one import atomically. OSM rows in the box that were not part of this import are
 * removed (deleted or retagged upstream); admin and seed rows are never touched. POI hidden
 * flags and report counts survive re-imports.
 */
export async function loadWorld(
  db: Db,
  bbox: BBox,
  data: { pois: PoiRecord[]; exclusions: ExclusionRecord[] },
): Promise<LoadResult> {
  return withTx(db, async (c) => {
    const { rows } = await c.query<{ t: Date }>(`SELECT now() AS t`);
    const started = rows[0]!.t;
    const pois = await upsertPois(c, data.pois);
    const exclusions = await upsertExclusions(c, data.exclusions);
    const envelope = `ST_MakeEnvelope($2, $3, $4, $5, 4326)`;
    const box = [bbox.west, bbox.south, bbox.east, bbox.north];
    const rp = await c.query(
      `DELETE FROM pois WHERE source = 'osm' AND imported_at < $1
          AND ST_Intersects(geom::geometry, ${envelope})`,
      [started, ...box],
    );
    const rz = await c.query(
      `DELETE FROM exclusion_zones WHERE source = 'osm' AND imported_at < $1
          AND ST_Intersects(geom::geometry, ${envelope})`,
      [started, ...box],
    );
    return {
      pois,
      exclusions,
      removedPois: rp.rowCount ?? 0,
      removedExclusions: rz.rowCount ?? 0,
      dropped: data.pois.length + data.exclusions.length - pois - exclusions,
    };
  });
}
