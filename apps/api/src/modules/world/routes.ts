import type { FastifyInstance } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import { DEFAULT_CONFIG } from '@nyrgo/shared';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';

export const LocationSample = Type.Object(
  {
    lat: Type.Number({ minimum: -90, maximum: 90 }),
    lng: Type.Number({ minimum: -180, maximum: 180 }),
    /** Horizontal accuracy in metres, as reported by the Geolocation API. */
    accuracy: Type.Number({ minimum: 0, maximum: 100_000 }),
    /** Device speed in m/s when available (Geolocation API `coords.speed`). */
    speed: Type.Optional(Type.Union([Type.Number({ minimum: 0, maximum: 1000 }), Type.Null()])),
    /** Client timestamp in ms since epoch; checked against server time in milestone 4. */
    timestamp: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);
export type LocationSample = Static<typeof LocationSample>;

const ReportBody = Type.Object(
  {
    reason: Type.Union(['unsafe', 'private', 'inaccessible', 'other'].map((r) => Type.Literal(r))),
  },
  { additionalProperties: false },
);

const PoiParams = Type.Object({ id: Type.String({ format: 'uuid' }) });

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';

export async function worldRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const cfg = DEFAULT_CONFIG.world;

  /**
   * What the player can see from where they stand. Positions are stored for anti-cheat with the
   * retention set in config; only the player's own H3 cell is echoed back.
   */
  app.post<{ Body: LocationSample }>(
    '/v1/world/nearby',
    {
      schema: { body: LocationSample },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req) => {
      const auth = requireAuth(req);
      const { lat, lng, accuracy, speed } = req.body;
      if (accuracy > cfg.requiredAccuracyM) {
        throw new HttpProblem(
          'accuracy_too_low',
          'Location is not precise enough',
          `Need ${cfg.requiredAccuracyM} m or better, got ${Math.round(accuracy)} m`,
        );
      }

      const point = `ST_SetSRID(ST_MakePoint($2, $1), 4326)`;
      const { rows: cellRows } = await db.query<{ cell: string }>(
        `INSERT INTO location_samples (user_id, h3_r9, geom, accuracy_m, speed_ms)
         VALUES ($3, h3_lat_lng_to_cell(${point}, $4), ${point}::geography, $5, $6)
         RETURNING h3_r9::text AS cell`,
        [lat, lng, auth.userId, cfg.spawnH3Resolution, accuracy, speed ?? null],
      );

      const { rows } = await db.query<{
        id: string;
        name: string | null;
        kind: string;
        biome: string;
        lat: number;
        lng: number;
        distance_m: number;
      }>(
        `SELECT id, name, kind, biome,
                ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng,
                ST_Distance(geom, ${point}::geography) AS distance_m
           FROM pois
          WHERE NOT hidden
            AND ST_DWithin(geom, ${point}::geography, $3)
            AND NOT is_excluded(geom, $4::text[])
          ORDER BY distance_m
          LIMIT $5`,
        [lat, lng, cfg.visibleRadiusM, cfg.poiIgnoredExclusions, cfg.maxNearbyPois],
      );

      return {
        cell: cellRows[0]!.cell,
        visibleRadiusM: cfg.visibleRadiusM,
        interactionRadiusM: cfg.interactionRadiusM,
        attribution: OSM_ATTRIBUTION,
        pois: rows.map((r) => ({
          id: r.id,
          name: r.name,
          kind: r.kind,
          biome: r.biome,
          lat: r.lat,
          lng: r.lng,
          distanceM: Math.round(r.distance_m),
          inRange: r.distance_m <= cfg.interactionRadiusM,
        })),
      };
    },
  );

  /** One report per player and POI; enough distinct reports hide the POI pending review. */
  app.post<{ Params: Static<typeof PoiParams>; Body: Static<typeof ReportBody> }>(
    '/v1/pois/:id/report',
    {
      schema: { params: PoiParams, body: ReportBody },
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    },
    async (req, reply) => {
      const auth = requireAuth(req);
      await withTx(db, async (c) => {
        const exists = await c.query(`SELECT 1 FROM pois WHERE id = $1 FOR UPDATE`, [
          req.params.id,
        ]);
        if (exists.rowCount === 0) throw new HttpProblem('not_found', 'Unknown place');
        const ins = await c.query(
          `INSERT INTO poi_reports (user_id, poi_id, reason) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [auth.userId, req.params.id, req.body.reason],
        );
        if (ins.rowCount === 1) {
          await c.query(
            `UPDATE pois SET report_count = report_count + 1,
                    hidden = hidden OR report_count + 1 >= $2
              WHERE id = $1`,
            [req.params.id, cfg.poiHideAfterReports],
          );
        }
      });
      return reply.code(202).send({ received: true });
    },
  );
}
