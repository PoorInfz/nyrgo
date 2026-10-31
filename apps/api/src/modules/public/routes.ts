import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';

/**
 * Public data for the website, no session: recent catches on a coarse grid. Each cell shows its
 * latest creature and how many were caught there; names are masked ("A****"). Catches show up
 * an hour later at the earliest, so nobody can be followed in real time.
 */

const CACHE_MS = 5 * 60_000;

/** "Aria" → "A***": the first letter and one star per remaining letter (at most six). */
export function maskName(name: string): string {
  const chars = [...name.trim()];
  if (chars.length === 0) return '***';
  return chars[0] + '*'.repeat(Math.min(6, Math.max(2, chars.length - 1)));
}

let cache: { at: number; body: unknown } | null = null;

/** Drops the cached catches, so a player who opts out disappears at once. */
export function forgetPublicCaptures() {
  cache = null;
}

export async function publicRoutes(app: FastifyInstance, { db }: { db: Db }) {
  cache = null;

  app.get(
    '/v1/public/captures',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (_req, reply) => {
      if (!cache || Date.now() - cache.at > CACHE_MS) {
        const { rows } = await db.query<{
          lat: number;
          lng: number;
          creature: string;
          name: string;
          day: string;
          count: number;
        }>(
          `SELECT DISTINCT ON (m.cell_lat, m.cell_lng)
                  m.cell_lat AS lat, m.cell_lng AS lng, m.definition_id AS creature,
                  p.display_name AS name, to_char(m.created_at, 'YYYY-MM-DD') AS day,
                  count(*) OVER (PARTITION BY m.cell_lat, m.cell_lng)::int AS count
             FROM capture_marks m
             JOIN players p ON p.user_id = m.user_id
             JOIN users u ON u.id = m.user_id
            WHERE u.status = 'active' AND u.age_band = '18+' AND p.show_on_globe
              AND m.created_at > now() - interval '30 days'
              AND m.created_at < now() - interval '1 hour'
            ORDER BY m.cell_lat, m.cell_lng, m.created_at DESC
            LIMIT 400`,
        );
        cache = {
          at: Date.now(),
          body: {
            cells: rows.map((r) => ({
              lat: Number(r.lat),
              lng: Number(r.lng),
              creature: r.creature,
              by: maskName(r.name),
              day: r.day,
              count: r.count,
            })),
          },
        };
      }
      // anyone may read it, from any site (no cookies are involved)
      reply.header('access-control-allow-origin', '*');
      reply.header('cache-control', 'public, max-age=300');
      return cache.body;
    },
  );
}
