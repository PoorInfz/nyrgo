import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { Type, type Static } from '@sinclair/typebox';
import { DEFAULT_CONFIG, FURNITURE_BY_ID, canStand, houseRoomId, hubMap } from '@nyrgo/shared';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';
import { areFriends } from '../social/routes.js';

/**
 * Houses: every player has one, the same cottage, which they furnish with what they buy from the
 * merchant. Who may come in is the owner's choice — nobody, friends (the default) or anyone — and
 * always only players of the same age group who have not blocked each other.
 */

export type Privacy = 'private' | 'friends' | 'public';
export interface Placed {
  f: string;
  x: number;
  y: number;
  flip: boolean;
}

const Piece = Type.Object(
  {
    f: Type.String({ maxLength: 40 }),
    x: Type.Integer({ minimum: 0, maximum: 2000 }),
    y: Type.Integer({ minimum: 0, maximum: 2000 }),
    flip: Type.Boolean(),
  },
  { additionalProperties: false },
);
const HouseBody = Type.Object(
  {
    privacy: Type.Optional(
      Type.Union([Type.Literal('private'), Type.Literal('friends'), Type.Literal('public')]),
    ),
    layout: Type.Optional(Type.Array(Piece, { maxItems: DEFAULT_CONFIG.hub.houseItemsMax })),
  },
  { additionalProperties: false },
);
const OwnerParams = Type.Object({ owner: Type.String({ format: 'uuid' }) });

type Q = Db | PoolClient;

async function house(q: Q, owner: string): Promise<{ privacy: Privacy; layout: Placed[] }> {
  const { rows } = await q.query<{ privacy: Privacy; layout: Placed[] }>(
    `SELECT privacy, layout FROM hub_houses WHERE owner_id = $1`,
    [owner],
  );
  return rows[0] ?? { privacy: 'friends', layout: [] };
}

/** Whether `visitor` may be in `owner`'s house right now. */
export async function canVisit(q: Q, visitor: string, owner: string): Promise<boolean> {
  if (visitor === owner) return true;
  const { rows } = await q.query<{ same: boolean; active: boolean; blocked: boolean }>(
    `SELECT (o.age_band = '18+') = (v.age_band = '18+') AS same, o.status = 'active' AS active,
            EXISTS (SELECT 1 FROM hub_blocks b
                     WHERE (b.user_id = o.id AND b.blocked_id = v.id)
                        OR (b.user_id = v.id AND b.blocked_id = o.id)) AS blocked
       FROM users o, users v WHERE o.id = $1 AND v.id = $2`,
    [owner, visitor],
  );
  const r = rows[0];
  if (!r || !r.same || !r.active || r.blocked) return false;
  const { privacy } = await house(q, owner);
  if (privacy === 'public') return true;
  if (privacy === 'friends') return areFriends(q, owner, visitor);
  return false;
}

/** Checks a layout against the house's floor and what the owner owns. */
function checkLayout(layout: Placed[], owned: Map<string, number>) {
  const map = hubMap(houseRoomId('x'))!;
  const used = new Map<string, number>();
  for (const p of layout) {
    const def = FURNITURE_BY_ID.get(p.f);
    if (!def) throw new HttpProblem('validation_failed', `Unknown furniture ${p.f}`);
    used.set(p.f, (used.get(p.f) ?? 0) + 1);
    if (used.get(p.f)! > (owned.get(p.f) ?? 0))
      throw new HttpProblem('validation_failed', `Not enough ${p.f}`);
    // a piece stands where a person could: on the open floor, not in walls or the built-ins
    if (!canStand(map, p.x, p.y))
      throw new HttpProblem('validation_failed', `${p.f} cannot stand there`);
  }
}

export async function houseRoutes(
  app: FastifyInstance,
  {
    db,
    changed,
  }: {
    db: Db;
    /** Tells the people inside a house that it changed (and shows out those no longer welcome). */
    changed: (owner: string) => Promise<void>;
  },
) {
  /** Your house, your friends' houses you may enter, and some open to everyone. */
  app.get('/v1/hub/houses', async (req) => {
    const auth = requireAuth(req);
    const mine = await house(db, auth.userId);
    const friends = await db.query<{ id: string; name: string; privacy: Privacy | null }>(
      `SELECT p.user_id AS id, p.display_name AS name, h.privacy
         FROM friendships f
         JOIN players p ON p.user_id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
         LEFT JOIN hub_houses h ON h.owner_id = p.user_id
        WHERE (f.user_a = $1 OR f.user_b = $1) AND f.status = 'accepted'
        ORDER BY p.display_name LIMIT 100`,
      [auth.userId],
    );
    const open = await db.query<{ id: string; name: string; pieces: number }>(
      `SELECT h.owner_id AS id, p.display_name AS name, jsonb_array_length(h.layout) AS pieces
         FROM hub_houses h
         JOIN players p ON p.user_id = h.owner_id
         JOIN users o ON o.id = h.owner_id
         JOIN users v ON v.id = $1
        WHERE h.privacy = 'public' AND h.owner_id <> $1 AND o.status = 'active'
          AND (o.age_band = '18+') = (v.age_band = '18+')
          AND NOT EXISTS (SELECT 1 FROM hub_blocks b
                           WHERE (b.user_id = $1 AND b.blocked_id = h.owner_id)
                              OR (b.user_id = h.owner_id AND b.blocked_id = $1))
        ORDER BY jsonb_array_length(h.layout) DESC, h.updated_at DESC LIMIT 20`,
      [auth.userId],
    );
    return {
      mine: { privacy: mine.privacy, pieces: mine.layout.length },
      // a friend's house is listed when its door is open to friends (the default) or to all
      friends: friends.rows
        .filter((f) => (f.privacy ?? 'friends') !== 'private')
        .map(({ id, name }) => ({ id, name })),
      open: open.rows,
    };
  });

  /** A house's furniture, for those allowed in. */
  app.get<{ Params: Static<typeof OwnerParams> }>(
    '/v1/hub/house/:owner',
    { schema: { params: OwnerParams } },
    async (req) => {
      const auth = requireAuth(req);
      if (!(await canVisit(db, auth.userId, req.params.owner)))
        throw new HttpProblem('house_closed', 'This house is closed to you');
      const h = await house(db, req.params.owner);
      const { rows } = await db.query<{ name: string }>(
        `SELECT display_name AS name FROM players WHERE user_id = $1`,
        [req.params.owner],
      );
      return {
        owner: req.params.owner,
        name: rows[0]?.name ?? '',
        mine: req.params.owner === auth.userId,
        ...(req.params.owner === auth.userId ? { privacy: h.privacy } : {}),
        layout: h.layout,
      };
    },
  );

  /** Saves who may come in and/or where everything stands. */
  app.put<{ Body: Static<typeof HouseBody> }>(
    '/v1/hub/house',
    { schema: { body: HouseBody }, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      const out = await withTx(db, async (c) => {
        const now = await house(c, auth.userId);
        const layout = req.body.layout ?? now.layout;
        if (req.body.layout) {
          const { rows } = await c.query<{ id: string; qty: number }>(
            `SELECT furniture_id AS id, qty FROM player_furniture WHERE user_id = $1`,
            [auth.userId],
          );
          checkLayout(layout, new Map(rows.map((r) => [r.id, r.qty])));
        }
        const privacy = req.body.privacy ?? now.privacy;
        await c.query(
          `INSERT INTO hub_houses (owner_id, privacy, layout) VALUES ($1, $2, $3)
           ON CONFLICT (owner_id) DO UPDATE SET privacy = $2, layout = $3, updated_at = now()`,
          [auth.userId, privacy, JSON.stringify(layout)],
        );
        return { privacy, layout };
      });
      await changed(auth.userId);
      return out;
    },
  );
}
