import type { PoolClient } from 'pg';
import type { Db } from '../../db.js';
import { loadWorld } from './load.js';
import { classifyElements, fetchOverpass, type BBox, type OverpassResponse } from './osm.js';

/**
 * The world, loaded where people play. Each H3 resolution-6 area (~36 km²) is fetched from
 * OpenStreetMap the first time a player is there; until it is ready no creature appears in it,
 * because we do not yet know where its schools, homes and roads are.
 */

export const AREA_RESOLUTION = 6;
/** Areas waiting at once; past this, new places wait for the queue to drain (abuse guard). */
export const MAX_PENDING_AREAS = 200;
/** Retries back off 2, 4, 8… minutes, up to a day. */
const backoffMin = (attempts: number) => Math.min(24 * 60, 2 ** attempts);

export type AreaStatus = 'pending' | 'loading' | 'ready' | 'failed';

/** The area of each cell (resolution 9) and whether it is loaded. */
export async function areasOf(
  q: Db | PoolClient,
  cells: string[],
): Promise<Map<string, { area: string; ready: boolean }>> {
  const { rows } = await q.query<{ cell: string; area: string; ready: boolean }>(
    `SELECT c::text AS cell, a::text AS area, coalesce(w.status = 'ready', false) AS ready
       FROM unnest($1::h3index[]) AS c,
            LATERAL h3_cell_to_parent(c, $2) AS a
       LEFT JOIN world_areas w ON w.h3_r6 = a`,
    [cells, AREA_RESOLUTION],
  );
  return new Map(rows.map((r) => [r.cell, { area: r.area, ready: r.ready }]));
}

/** Asks for areas to be loaded (idempotent). Returns how many were newly queued. */
export async function requestAreas(q: Db | PoolClient, areas: string[]): Promise<number> {
  if (areas.length === 0) return 0;
  const res = await q.query(
    `INSERT INTO world_areas (h3_r6)
     SELECT a::h3index FROM unnest($1::text[]) AS a
      WHERE (SELECT count(*) FROM world_areas WHERE status IN ('pending', 'loading')) < $2
     ON CONFLICT DO NOTHING`,
    [areas, MAX_PENDING_AREAS],
  );
  return res.rowCount ?? 0;
}

/** The box around an area's hexagon (what Overpass is asked for). */
export async function areaBox(q: Db | PoolClient, area: string): Promise<BBox> {
  const { rows } = await q.query<{ w: number; s: number; e: number; n: number }>(
    `SELECT ST_XMin(b) AS w, ST_YMin(b) AS s, ST_XMax(b) AS e, ST_YMax(b) AS n
       FROM (SELECT h3_cell_to_boundary_geometry($1::h3index)::box2d AS b) x`,
    [area],
  );
  const r = rows[0]!;
  return { south: r.s, west: r.w, north: r.n, east: r.e };
}

export type WorldFetcher = (bbox: BBox) => Promise<OverpassResponse>;

/**
 * Loads the next area that is due, if any. Safe with several API processes: each claims its
 * area with SKIP LOCKED. Returns what happened, for the job log.
 */
export async function loadNextArea(
  db: Db,
  fetcher: WorldFetcher = (b) => fetchOverpass(b),
): Promise<{ area: string; status: AreaStatus; pois?: number; error?: string } | null> {
  const { rows } = await db.query<{ area: string; attempts: number }>(
    `UPDATE world_areas SET status = 'loading', attempts = attempts + 1, next_attempt_at = now()
      WHERE h3_r6 = (SELECT h3_r6 FROM world_areas
                      WHERE (status IN ('pending', 'failed') AND next_attempt_at <= now())
                         -- a load whose process died midway is picked up again
                         OR (status = 'loading' AND next_attempt_at < now() - interval '15 minutes')
                      ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING h3_r6::text AS area, attempts`,
  );
  const claim = rows[0];
  if (!claim) return null;
  try {
    const box = await areaBox(db, claim.area);
    const loaded = await loadWorld(db, box, classifyElements(await fetcher(box)));
    await db.query(
      `UPDATE world_areas SET status = 'ready', loaded_at = now(), error = NULL,
              pois = $2, exclusions = $3
        WHERE h3_r6 = $1::h3index`,
      [claim.area, loaded.pois, loaded.exclusions],
    );
    return { area: claim.area, status: 'ready', pois: loaded.pois };
  } catch (e) {
    const error = (e as Error).message.slice(0, 500);
    await db.query(
      `UPDATE world_areas SET status = 'failed', error = $2,
              next_attempt_at = now() + make_interval(mins => $3)
        WHERE h3_r6 = $1::h3index`,
      [claim.area, error, backoffMin(claim.attempts)],
    );
    return { area: claim.area, status: 'failed', error };
  }
}

/** One job run: loads due areas one after another (Overpass asks for one query at a time). */
export async function loadDueAreas(
  db: Db,
  fetcher?: WorldFetcher,
  max = 5,
): Promise<{ ready: number; failed: number }> {
  let ready = 0;
  let failed = 0;
  for (let i = 0; i < max; i++) {
    const r = await loadNextArea(db, fetcher);
    if (!r) break;
    if (r.status === 'ready') ready++;
    else failed++;
  }
  return { ready, failed };
}
