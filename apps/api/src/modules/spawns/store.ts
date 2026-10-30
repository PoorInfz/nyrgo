import type { PoolClient } from 'pg';
import { DEFAULT_CONFIG, type Biome } from '@nyrgo/shared';
import type { Db } from '../../db.js';
import { cellWindow, generateCell, type CellInfo } from './generate.js';

type Q = Db | PoolClient;

export interface VisibleSpawn {
  id: string;
  creatureId: string;
  level: number;
  lat: number;
  lng: number;
  distanceM: number;
  expiresAt: string;
  /** The event this creature appears for, if any. */
  eventId: string | null;
}

/** The player's cell and the rings around it. */
export async function cellsAround(q: Q, cell: string): Promise<string[]> {
  const { rows } = await q.query<{ c: string }>(
    `SELECT c::text AS c FROM h3_grid_disk($1::h3index, $2) AS c`,
    [cell, DEFAULT_CONFIG.spawns.searchRings],
  );
  return rows.map((r) => r.c);
}

/**
 * Makes sure every cell has its spawns for the current window. Each cell and window is
 * generated once: the first request claims it in `spawn_generations` and inserts the spawns in
 * the same transaction; concurrent requests wait on that row and then skip it.
 */
export async function ensureSpawns(
  c: PoolClient,
  cells: string[],
  secret: string,
): Promise<number> {
  const lifetimeMs = DEFAULT_CONFIG.world.spawnLifetimeMin * 60_000;
  const { rows: nowRows } = await c.query<{ now: Date }>(`SELECT now() AS now`);
  const now = nowRows[0]!.now.getTime();
  const windows = cells.map((cell) => cellWindow(cell, now, lifetimeMs));

  const { rows: claimed } = await c.query<{ cell: string; ws: Date }>(
    `INSERT INTO spawn_generations (h3_r9, window_start)
     SELECT cell::h3index, ws FROM unnest($1::text[], $2::timestamptz[]) AS t(cell, ws)
     ON CONFLICT DO NOTHING
     RETURNING h3_r9::text AS cell, window_start AS ws`,
    [cells, windows.map((w) => new Date(w.start))],
  );
  if (claimed.length === 0) return 0;

  const { rows: info } = await c.query<{
    cell: string;
    lat: number;
    lng: number;
    biome: Biome | null;
  }>(
    `SELECT c::text AS cell,
            ST_Y(h3_cell_to_geometry(c)) AS lat, ST_X(h3_cell_to_geometry(c)) AS lng,
            (SELECT biome FROM pois WHERE h3_r9 = c AND NOT hidden
              GROUP BY biome ORDER BY count(*) DESC, biome LIMIT 1) AS biome
       FROM unnest($1::h3index[]) AS c`,
    [claimed.map((r) => r.cell)],
  );
  const byCell = new Map(info.map((i) => [i.cell, i]));

  const rows = claimed.flatMap((cl) => {
    const i = byCell.get(cl.cell)!;
    const cellInfo: CellInfo = { cell: i.cell, lat: i.lat, lng: i.lng, biome: i.biome ?? 'urban' };
    const start = cl.ws.getTime();
    return generateCell(secret, cellInfo, start, DEFAULT_CONFIG.spawns).map((s) => ({
      ...s,
      start: new Date(start),
      end: new Date(start + lifetimeMs),
    }));
  });
  if (rows.length === 0) return 0;

  // Only keep candidates that landed inside their own cell and outside every exclusion zone
  // (schools, homes, water, roads…). A rejected slot simply stays empty for that window.
  const res = await c.query(
    `INSERT INTO spawns (h3_r9, definition_id, level, geom, seed, window_start, expires_at)
     SELECT t.cell::h3index, t.def, t.level, t.pt::geography, t.seed, t.ws, t.we
       FROM (SELECT cell, def, level, seed, ws, we,
                    ST_SetSRID(ST_MakePoint(lng, lat), 4326) AS pt
               FROM unnest($1::text[], $2::text[], $3::int[], $4::float8[], $5::float8[],
                           $6::bigint[], $7::timestamptz[], $8::timestamptz[])
                    AS u(cell, def, level, lat, lng, seed, ws, we)) AS t
      WHERE h3_lat_lng_to_cell(t.pt, 9) = t.cell::h3index
        AND NOT is_excluded(t.pt::geography, '{}'::text[])
     ON CONFLICT DO NOTHING`,
    [
      rows.map((r) => r.cell),
      rows.map((r) => r.definitionId),
      rows.map((r) => r.level),
      rows.map((r) => r.lat),
      rows.map((r) => r.lng),
      rows.map((r) => r.seed.toString()),
      rows.map((r) => r.start),
      rows.map((r) => r.end),
    ],
  );
  return res.rowCount ?? 0;
}

/**
 * Live spawns the player can see, nearest first. Creatures this player already caught or
 * scared away are left out for them.
 */
export async function visibleSpawns(
  q: Q,
  userId: string,
  cells: string[],
  lat: number,
  lng: number,
): Promise<VisibleSpawn[]> {
  const { rows } = await q.query<{
    id: string;
    definition_id: string;
    level: number;
    lat: number;
    lng: number;
    distance_m: number;
    expires_at: Date;
    event_id: string | null;
  }>(
    `SELECT s.id, s.definition_id, s.event_id,
            COALESCE(
              (SELECT e.level FROM encounters e WHERE e.spawn_id = s.id AND e.user_id = $5),
              CASE WHEN $6::int IS NULL OR s.event_id IS NOT NULL THEN s.level
                   ELSE LEAST(s.level, GREATEST(1,
                          COALESCE((SELECT p.level FROM players p WHERE p.user_id = $5), 1) + $6::int))
              END) AS level,
            ST_Y(s.geom::geometry) AS lat, ST_X(s.geom::geometry) AS lng,
            ST_Distance(s.geom, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography) AS distance_m,
            s.expires_at
       FROM spawns s
      WHERE s.h3_r9 = ANY($1::h3index[])
        AND s.window_start <= now() AND s.expires_at > now()
        AND ST_DWithin(s.geom, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $4)
        AND NOT EXISTS (SELECT 1 FROM encounters e
                         WHERE e.spawn_id = s.id AND e.user_id = $5 AND e.status <> 'open')
      ORDER BY distance_m
      LIMIT 50`,
    [
      cells,
      lat,
      lng,
      DEFAULT_CONFIG.world.visibleRadiusM,
      userId,
      // the level each player meets: see encounterLevel() in @nyrgo/shared
      DEFAULT_CONFIG.spawns.wildLevelAbovePlayer ?? null,
    ],
  );
  return rows.map((r) => ({
    id: r.id,
    creatureId: r.definition_id,
    level: r.level,
    lat: r.lat,
    lng: r.lng,
    distanceM: Math.round(r.distance_m),
    expiresAt: r.expires_at.toISOString(),
    eventId: r.event_id,
  }));
}
