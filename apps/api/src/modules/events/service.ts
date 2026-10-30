import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { CREATURES_BY_ID } from '@nyrgo/shared';
import type { Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';

export interface EventInput {
  title: string;
  poiId: string;
  creatureId: string;
  level: number;
  startsAt: string;
  durationMin: number;
}

/**
 * Schedules an event: the creature becomes a spawn at the place for the event's window, seen by
 * everyone nearby (each player may try to catch it once, as with any spawn).
 */
export async function createEvent(c: PoolClient, input: EventInput, createdBy: string) {
  const def = CREATURES_BY_ID.get(input.creatureId);
  if (!def) throw new HttpProblem('validation_failed', 'Unknown creature', input.creatureId);
  const starts = new Date(input.startsAt);
  if (Number.isNaN(starts.getTime())) throw new HttpProblem('validation_failed', 'Bad start time');
  if (starts.getTime() < Date.now() - 60_000 || starts.getTime() > Date.now() + 30 * 86_400_000) {
    throw new HttpProblem('validation_failed', 'Events start between now and 30 days ahead');
  }
  const { rows: place } = await c.query<{ id: string }>(
    `SELECT id FROM pois WHERE id = $1 AND NOT hidden`,
    [input.poiId],
  );
  if (!place[0]) throw new HttpProblem('not_found', 'Unknown or hidden place');

  const { rows } = await c.query<{ id: string; ends_at: Date }>(
    `INSERT INTO events (title, poi_id, definition_id, level, starts_at, ends_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $5::timestamptz + make_interval(mins => $6), $7)
     RETURNING id, ends_at`,
    [input.title, input.poiId, input.creatureId, input.level, starts, input.durationMin, createdBy],
  );
  const ev = rows[0]!;
  const { rows: spawn } = await c.query<{ id: string }>(
    `INSERT INTO spawns (h3_r9, definition_id, level, geom, seed, window_start, expires_at, event_id)
     SELECT h3_r9, $2, $3, geom, $4, $5, $6, $7 FROM pois WHERE id = $1
     RETURNING id`,
    [
      input.poiId,
      input.creatureId,
      input.level,
      randomBytes(6).readUIntBE(0, 6),
      starts,
      ev.ends_at,
      ev.id,
    ],
  );
  await c.query(`UPDATE events SET spawn_id = $2 WHERE id = $1`, [ev.id, spawn[0]!.id]);
  return { id: ev.id, spawnId: spawn[0]!.id };
}

/** Cancels an event: its creature leaves at once. */
export async function cancelEvent(c: PoolClient, id: string) {
  const { rows } = await c.query<{ spawn_id: string | null }>(
    `UPDATE events SET cancelled_at = now() WHERE id = $1 AND cancelled_at IS NULL RETURNING spawn_id`,
    [id],
  );
  if (!rows[0]) throw new HttpProblem('not_found', 'No such event');
  await c.query(
    `UPDATE spawns SET expires_at = greatest(window_start + interval '1 second', now()) WHERE id = $1`,
    [rows[0].spawn_id],
  );
}

/** Events running now or starting soon near a point (public). */
export async function eventsNear(q: Db, lat: number, lng: number, radiusM = 30_000) {
  const { rows } = await q.query(
    `SELECT e.id, e.title, e.definition_id AS "creatureId", e.level,
            e.starts_at AS "startsAt", e.ends_at AS "endsAt",
            p.name AS "placeName", ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lng,
            round(ST_Distance(p.geom, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography)) AS "distanceM"
       FROM events e JOIN pois p ON p.id = e.poi_id
      WHERE e.cancelled_at IS NULL AND e.ends_at > now() AND e.starts_at < now() + interval '7 days'
        AND ST_DWithin(p.geom, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
      ORDER BY e.starts_at LIMIT 20`,
    [lat, lng, radiusM],
  );
  return rows.map((r) => ({ ...r, distanceM: Number(r.distanceM) }));
}
