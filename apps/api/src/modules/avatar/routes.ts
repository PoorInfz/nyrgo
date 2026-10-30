import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { Type, type Static } from '@sinclair/typebox';
import { COSMETICS_BY_ID, COSMETIC_SLOTS, invalidLook, normaliseLook } from '@nyrgo/shared';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { idempotent, readIdempotencyKey } from '../../http/idempotency.js';
import { requireAuth } from '../auth/sessions.js';
import { spendGold } from '../economy/routes.js';

/**
 * The explorer's look on the map. Cosmetics are bought once with Gold and change nothing in play;
 * free pieces are everyone's from the start.
 */

const BuyBody = Type.Object(
  { item: Type.String({ minLength: 2, maxLength: 40 }) },
  { additionalProperties: false },
);
const LookBody = Type.Object(
  {
    avatar: Type.Object(
      Object.fromEntries(
        COSMETIC_SLOTS.map((s) => [s, Type.String({ minLength: 2, maxLength: 40 })]),
      ),
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

async function state(c: Db | PoolClient, userId: string) {
  const [p, o] = await Promise.all([
    c.query<{ avatar: unknown; gold: string }>(
      `SELECT avatar, gold FROM players WHERE user_id = $1`,
      [userId],
    ),
    c.query<{ item_id: string }>(
      `SELECT item_id FROM player_cosmetics WHERE user_id = $1 ORDER BY acquired_at`,
      [userId],
    ),
  ]);
  return {
    avatar: normaliseLook(p.rows[0]?.avatar),
    owned: o.rows.map((r) => r.item_id),
    gold: Number(p.rows[0]?.gold ?? 0),
  };
}

export async function avatarRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /** The look being worn, the cosmetics bought and the Gold to buy more. */
  app.get('/v1/me/avatar', async (req) => state(db, requireAuth(req).userId));

  /** Wears a look: every piece must be free or already bought. */
  app.put<{ Body: Static<typeof LookBody> }>(
    '/v1/me/avatar',
    { schema: { body: LookBody }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      const owned = await db.query<{ item_id: string }>(
        `SELECT item_id FROM player_cosmetics WHERE user_id = $1`,
        [auth.userId],
      );
      const why = invalidLook(req.body.avatar, new Set(owned.rows.map((r) => r.item_id)));
      if (why) throw new HttpProblem('validation_failed', 'This look cannot be worn', why);
      await db.query(`UPDATE players SET avatar = $2, updated_at = now() WHERE user_id = $1`, [
        auth.userId,
        JSON.stringify(req.body.avatar),
      ]);
      return state(db, auth.userId);
    },
  );

  /** Buys a cosmetic with Gold, once. Idempotent so a retried purchase is never paid twice. */
  app.post<{ Body: Static<typeof BuyBody> }>(
    '/v1/me/cosmetics/buy',
    { schema: { body: BuyBody }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      const key = readIdempotencyKey(req.headers['idempotency-key']);
      const def = COSMETICS_BY_ID.get(req.body.item);
      if (!def || def.price <= 0) throw new HttpProblem('not_found', 'Not for sale');
      const { response } = await withTx(db, (c) =>
        idempotent(c, auth.userId, key, 'cosmetics:buy', req.body, async () => {
          const res = await c.query(
            `INSERT INTO player_cosmetics (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [auth.userId, def.id],
          );
          if (!res.rowCount) throw new HttpProblem('conflict', 'Already yours');
          await spendGold(c, auth.userId, def.price, 'cosmetic');
          return state(c, auth.userId);
        }),
      );
      return response;
    },
  );
}
