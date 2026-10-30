import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { Type, type Static } from '@sinclair/typebox';
import type { AdminAccount, AdminRole, AppConfig } from '../../config.js';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { cancelEvent, createEvent } from '../events/service.js';

/**
 * The admin API: a separate prefix (`/admin/v1`), separate credentials (bearer tokens from
 * `ADMIN_TOKENS`, never player sessions) and two roles. Every change records who, what, why,
 * before and after in the append-only audit log. Player emails are never returned here.
 */

const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
type IdParams = Static<typeof IdParams>;
const Reason = Type.String({ minLength: 5, maxLength: 500 });

const CloseBody = Type.Object(
  {
    decision: Type.Union(
      ['no_action', 'warning', 'restricted', 'appeal_upheld'].map((d) => Type.Literal(d)),
    ),
    reason: Reason,
  },
  { additionalProperties: false },
);
const ReasonBody = Type.Object({ reason: Reason }, { additionalProperties: false });
const PoiBody = Type.Object(
  { hidden: Type.Boolean(), reason: Reason },
  { additionalProperties: false },
);
const EventBody = Type.Object(
  {
    title: Type.String({ minLength: 3, maxLength: 60 }),
    poiId: Type.String({ format: 'uuid' }),
    creatureId: Type.String({ minLength: 2, maxLength: 32 }),
    level: Type.Integer({ minimum: 1, maximum: 50 }),
    startsAt: Type.String({ format: 'date-time' }),
    durationMin: Type.Integer({ minimum: 15, maximum: 240 }),
    reason: Reason,
  },
  { additionalProperties: false },
);
const PoiSearch = Type.Object(
  {
    q: Type.String({ minLength: 2, maxLength: 60 }),
    lat: Type.Optional(Type.Number({ minimum: -90, maximum: 90 })),
    lng: Type.Optional(Type.Number({ minimum: -180, maximum: 180 })),
  },
  { additionalProperties: false },
);
const ListQuery = Type.Object(
  {
    status: Type.Optional(Type.Union([Type.Literal('open'), Type.Literal('closed')])),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  },
  { additionalProperties: false },
);

/** A stable id for the audit log, derived from the account name. */
export function adminId(name: string): string {
  const h = createHash('sha256').update(`admin:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function constantEqual(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}

export function adminFromRequest(req: FastifyRequest, admins: AdminAccount[]): AdminAccount {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const found = token ? admins.find((a) => constantEqual(a.token, token)) : undefined;
  if (!found) throw new HttpProblem('unauthenticated', 'Admin token required');
  return found;
}

function requireRole(admin: AdminAccount, role: AdminRole) {
  if (role === 'admin' && admin.role !== 'admin') {
    throw new HttpProblem('forbidden', 'Needs the admin role');
  }
}

async function audit(
  c: PoolClient,
  admin: AdminAccount,
  action: string,
  before: unknown,
  after: unknown,
  reason: string,
) {
  await c.query(
    `INSERT INTO admin_audit_log (admin_id, role, action, before, after, reason) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      adminId(admin.name),
      admin.role,
      action,
      JSON.stringify(before),
      JSON.stringify(after),
      reason,
    ],
  );
}

export async function adminRoutes(
  app: FastifyInstance,
  { db, config }: { db: Db; config: AppConfig },
) {
  const admins = config.admins;
  // Everything here needs a valid token; the player session cookie is ignored on purpose.
  app.addHook('onRequest', async (req) => {
    if (admins.length === 0) throw new HttpProblem('not_found', 'Not found');
    req.admin = adminFromRequest(req, admins);
  });

  app.get('/admin/v1/me', async (req) => ({ name: req.admin!.name, role: req.admin!.role }));

  /** Open (or closed) review cases with the signals behind them. No personal data beyond the display name. */
  app.get<{ Querystring: Static<typeof ListQuery> }>(
    '/admin/v1/review-cases',
    { schema: { querystring: ListQuery } },
    async (req) => {
      const status = req.query.status ?? 'open';
      const { rows } = await db.query(
        `SELECT rc.id, rc.user_id, rc.status, rc.reason, rc.risk_at_open, rc.opened_at, rc.closed_at,
                rc.decision, rc.notes, p.display_name, u.status AS account_status, u.risk_level,
                (SELECT json_object_agg(kind, n) FROM (
                   SELECT kind, count(*)::int AS n FROM risk_signals
                    WHERE user_id = rc.user_id AND created_at > now() - interval '7 days' GROUP BY kind) s
                ) AS signals
           FROM review_cases rc
           JOIN users u ON u.id = rc.user_id
           JOIN players p ON p.user_id = rc.user_id
          WHERE rc.status = $1
          ORDER BY rc.opened_at DESC LIMIT $2`,
        [status, req.query.limit ?? 50],
      );
      return { cases: rows };
    },
  );

  /**
   * Closes a case with a decision. `restricted` suspends the account (admin role): the player
   * is signed out everywhere and cannot sign in until restored. Nothing here is automatic.
   */
  app.post<{ Params: IdParams; Body: Static<typeof CloseBody> }>(
    '/admin/v1/review-cases/:id/close',
    { schema: { params: IdParams, body: CloseBody } },
    async (req) => {
      const admin = req.admin!;
      if (req.body.decision === 'restricted') requireRole(admin, 'admin');
      return withTx(db, async (c) => {
        const { rows } = await c.query(
          `SELECT id, user_id, status, reason, risk_at_open FROM review_cases WHERE id = $1 FOR UPDATE`,
          [req.params.id],
        );
        const before = rows[0];
        if (!before) throw new HttpProblem('not_found', 'Unknown case');
        if (before.status !== 'open') throw new HttpProblem('conflict', 'Case already closed');
        const { rows: after } = await c.query(
          `UPDATE review_cases SET status = 'closed', closed_at = now(), reviewer_id = $2, decision = $3, notes = $4
            WHERE id = $1 RETURNING id, user_id, status, decision, closed_at`,
          [req.params.id, adminId(admin.name), req.body.decision, req.body.reason],
        );
        if (req.body.decision === 'restricted') {
          await c.query(`UPDATE users SET status = 'suspended', updated_at = now() WHERE id = $1`, [
            before.user_id,
          ]);
          await c.query(
            `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
            [before.user_id],
          );
        }
        await audit(c, admin, 'review_case.close', before, after[0], req.body.reason);
        return after[0];
      });
    },
  );

  /** Lifts a suspension (admin role). */
  app.post<{ Params: IdParams; Body: Static<typeof ReasonBody> }>(
    '/admin/v1/accounts/:id/restore',
    { schema: { params: IdParams, body: ReasonBody } },
    async (req) => {
      const admin = req.admin!;
      requireRole(admin, 'admin');
      return withTx(db, async (c) => {
        const { rows } = await c.query(`SELECT id, status FROM users WHERE id = $1 FOR UPDATE`, [
          req.params.id,
        ]);
        const before = rows[0];
        if (!before) throw new HttpProblem('not_found', 'Unknown account');
        if (before.status !== 'suspended')
          throw new HttpProblem('conflict', 'Account is not suspended');
        const { rows: after } = await c.query(
          `UPDATE users SET status = 'active', updated_at = now() WHERE id = $1 RETURNING id, status`,
          [req.params.id],
        );
        await audit(c, admin, 'account.restore', before, after[0], req.body.reason);
        return after[0];
      });
    },
  );

  /** Places players have reported, hidden or not, with the reasons given. */
  app.get('/admin/v1/pois/reported', async () => {
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.kind, p.biome, p.hidden, p.report_count, p.osm_ref,
              ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lng,
              (SELECT json_object_agg(reason, n) FROM (
                 SELECT reason, count(*)::int AS n FROM poi_reports WHERE poi_id = p.id GROUP BY reason) r
              ) AS reasons
         FROM pois p
        WHERE p.report_count > 0 OR p.hidden
        ORDER BY p.hidden DESC, p.report_count DESC, p.name LIMIT 200`,
    );
    return { pois: rows };
  });

  /** Hides a place for good or puts it back on the map; hiding also clears its reports. */
  app.post<{ Params: IdParams; Body: Static<typeof PoiBody> }>(
    '/admin/v1/pois/:id',
    { schema: { params: IdParams, body: PoiBody } },
    async (req) => {
      const admin = req.admin!;
      return withTx(db, async (c) => {
        const { rows } = await c.query(
          `SELECT id, name, hidden, report_count FROM pois WHERE id = $1 FOR UPDATE`,
          [req.params.id],
        );
        const before = rows[0];
        if (!before) throw new HttpProblem('not_found', 'Unknown place');
        const { rows: after } = await c.query(
          `UPDATE pois SET hidden = $2, report_count = CASE WHEN $2 THEN report_count ELSE 0 END
            WHERE id = $1 RETURNING id, name, hidden, report_count`,
          [req.params.id, req.body.hidden],
        );
        if (!req.body.hidden)
          await c.query(`DELETE FROM poi_reports WHERE poi_id = $1`, [req.params.id]);
        await audit(
          c,
          admin,
          req.body.hidden ? 'poi.hide' : 'poi.restore',
          before,
          after[0],
          req.body.reason,
        );
        return after[0];
      });
    },
  );

  // ------------------------------------------------------------------ events

  /** Finds places by name to hold an event at, nearest to a point when one is given. */
  app.get<{ Querystring: Static<typeof PoiSearch> }>(
    '/admin/v1/pois/search',
    { schema: { querystring: PoiSearch } },
    async (req) => {
      const { lat, lng } = req.query;
      // the name is matched literally: % and _ typed by the admin are not wildcards
      const q = req.query.q.replace(/[\\%_]/g, (c) => `\\${c}`);
      const near = lat !== undefined && lng !== undefined;
      const { rows } = await db.query(
        `SELECT p.id, p.name, p.kind, ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lng
           ${near ? `, round(ST_Distance(p.geom, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography)) AS "distanceM"` : ''}
           FROM pois p
          WHERE NOT p.hidden AND p.name ILIKE '%' || $1 || '%'
          ORDER BY ${near ? '"distanceM"' : 'p.name'} LIMIT 20`,
        near ? [q, lat, lng] : [q],
      );
      return {
        pois: rows.map((r) => ({
          ...r,
          distanceM: r.distanceM == null ? null : Number(r.distanceM),
        })),
      };
    },
  );

  app.get('/admin/v1/events', async () => {
    const { rows } = await db.query(
      `SELECT e.id, e.title, e.definition_id AS "creatureId", e.level, e.starts_at AS "startsAt",
              e.ends_at AS "endsAt", e.cancelled_at AS "cancelledAt", p.name AS "placeName",
              (SELECT count(*)::int FROM encounters x WHERE x.spawn_id = e.spawn_id AND x.status = 'caught') AS caught
         FROM events e JOIN pois p ON p.id = e.poi_id
        WHERE e.ends_at > now() - interval '7 days'
        ORDER BY e.starts_at DESC LIMIT 100`,
    );
    return { events: rows };
  });

  /** Schedules an event at a place. Admin role. */
  app.post<{ Body: Static<typeof EventBody> }>(
    '/admin/v1/events',
    { schema: { body: EventBody } },
    async (req) => {
      const admin = req.admin!;
      requireRole(admin, 'admin');
      return withTx(db, async (c) => {
        const { reason, ...input } = req.body;
        const made = await createEvent(c, input, admin.name);
        await audit(c, admin, 'event.create', null, { ...input, ...made }, reason);
        return made;
      });
    },
  );

  app.post<{ Params: IdParams; Body: Static<typeof ReasonBody> }>(
    '/admin/v1/events/:id/cancel',
    { schema: { params: IdParams, body: ReasonBody } },
    async (req) => {
      const admin = req.admin!;
      requireRole(admin, 'admin');
      return withTx(db, async (c) => {
        await cancelEvent(c, req.params.id);
        await audit(c, admin, 'event.cancel', { id: req.params.id }, null, req.body.reason);
        return { cancelled: true };
      });
    },
  );

  app.get('/admin/v1/audit', async () => {
    const { rows } = await db.query(
      `SELECT id, admin_id, role, action, before, after, reason, created_at FROM admin_audit_log
        ORDER BY id DESC LIMIT 100`,
    );
    return { entries: rows };
  });
}
