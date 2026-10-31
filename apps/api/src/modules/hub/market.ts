import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { Type, type Static } from '@sinclair/typebox';
import { DEFAULT_CONFIG, FURNITURE, FURNITURE_BY_ID, ITEMS } from '@nyrgo/shared';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { idempotent, readIdempotencyKey } from '../../http/idempotency.js';
import { requireAuth } from '../auth/sessions.js';
import { loadInventory } from '../capture/routes.js';
import { addItems, spendGold, takeItems } from '../economy/routes.js';
import { bumpHubQuest } from './board.js';

/**
 * The town market: players sell game items to each other for Gold (never creatures, NFTs or
 * NEAR — those have their own market). A listing holds its items until it sells, is withdrawn or
 * lapses; a sale moves Gold and items in one transaction, and the game keeps a small fee as a
 * Gold sink. The merchant also sells furniture for houses.
 */

const cfg = () => DEFAULT_CONFIG.hub;
const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
const ListBody = Type.Object(
  {
    item: Type.Union(ITEMS.map((i) => Type.Literal(i.id))),
    qty: Type.Integer({ minimum: 1, maximum: 99 }),
    price: Type.Integer({ minimum: 1, maximum: DEFAULT_CONFIG.hub.marketPriceMax }),
  },
  { additionalProperties: false },
);
const FurnitureBody = Type.Object(
  { item: Type.Union(FURNITURE.map((f) => Type.Literal(f.id))) },
  { additionalProperties: false },
);

/** The fee on a sale (rounded down, at least 1 Gold once the price allows it). */
export const marketFee = (price: number) =>
  price < 2 ? 0 : Math.max(1, Math.floor(price * cfg().marketFee));

/** Gives back the items of listings that lapsed (all of them, or one seller's). */
export async function expireListings(c: PoolClient | Db, sellerId?: string): Promise<number> {
  const { rows } = await c.query<{ seller_id: string; item_id: string; qty: number }>(
    `UPDATE hub_listings SET status = 'expired', closed_at = now()
      WHERE status = 'open' AND expires_at <= now() ${sellerId ? 'AND seller_id = $1' : ''}
      RETURNING seller_id, item_id, qty`,
    sellerId ? [sellerId] : [],
  );
  for (const r of rows) {
    await c.query(
      `INSERT INTO inventory (user_id, item_id, qty) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, item_id) DO UPDATE SET qty = inventory.qty + EXCLUDED.qty`,
      [r.seller_id, r.item_id, r.qty],
    );
  }
  return rows.length;
}

async function isAdult(c: PoolClient | Db, userId: string): Promise<boolean> {
  const { rows } = await c.query<{ adult: boolean }>(
    `SELECT age_band = '18+' AS adult FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.adult ?? false;
}

async function gold(c: PoolClient | Db, userId: string): Promise<number> {
  const { rows } = await c.query<{ gold: string }>(`SELECT gold FROM players WHERE user_id = $1`, [
    userId,
  ]);
  return Number(rows[0]?.gold ?? 0);
}

export async function marketRoutes(
  app: FastifyInstance,
  { db, inRoom }: { db: Db; inRoom: (userId: string, room: string) => boolean },
) {
  function mustBeInTown(userId: string) {
    if (!inRoom(userId, 'plaza'))
      throw new HttpProblem('hub_not_here', 'Visit the merchant in the town square first');
  }

  /** Open listings of your age group (cheapest first), yours, and what you could sell. */
  app.get('/v1/hub/market', async (req) => {
    const auth = requireAuth(req);
    await withTx(db, (c) => expireListings(c, auth.userId));
    const adult = await isAdult(db, auth.userId);
    const open = await db.query(
      `SELECT l.id, l.item_id AS "itemId", l.qty, l.price, l.expires_at AS "expiresAt",
              p.display_name AS "seller"
         FROM hub_listings l JOIN players p ON p.user_id = l.seller_id
        WHERE l.status = 'open' AND l.adult = $2 AND l.expires_at > now() AND l.seller_id <> $1
          AND NOT EXISTS (SELECT 1 FROM hub_blocks b
                           WHERE (b.user_id = $1 AND b.blocked_id = l.seller_id)
                              OR (b.user_id = l.seller_id AND b.blocked_id = $1))
        ORDER BY l.price::float / l.qty, l.created_at LIMIT 60`,
      [auth.userId, adult],
    );
    const mine = await db.query(
      `SELECT id, item_id AS "itemId", qty, price, fee, status, expires_at AS "expiresAt",
              closed_at AS "closedAt"
         FROM hub_listings
        WHERE seller_id = $1 AND (status = 'open' OR closed_at > now() - interval '3 days')
        ORDER BY created_at DESC LIMIT 30`,
      [auth.userId],
    );
    return {
      listings: open.rows,
      mine: mine.rows,
      items: await loadInventory(db, auth.userId),
      gold: await gold(db, auth.userId),
      fee: cfg().marketFee,
      maxListings: cfg().marketListingsMax,
      hours: cfg().marketListingHours,
    };
  });

  /** Puts items up for sale: they leave the inventory until the listing closes. */
  app.post<{ Body: Static<typeof ListBody> }>(
    '/v1/hub/market/listings',
    { schema: { body: ListBody }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      mustBeInTown(auth.userId);
      return withTx(db, async (c) => {
        await c.query(`SELECT 1 FROM players WHERE user_id = $1 FOR UPDATE`, [auth.userId]);
        await expireListings(c, auth.userId);
        const { rows } = await c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM hub_listings WHERE seller_id = $1 AND status = 'open'`,
          [auth.userId],
        );
        if (rows[0]!.n >= cfg().marketListingsMax)
          throw new HttpProblem('listing_limit', 'Too many open listings');
        await takeItems(c, auth.userId, { [req.body.item]: req.body.qty });
        const ins = await c.query<{ id: string; expires_at: Date }>(
          `INSERT INTO hub_listings (seller_id, adult, item_id, qty, price, fee, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(hours => $7))
           RETURNING id, expires_at`,
          [
            auth.userId,
            await isAdult(c, auth.userId),
            req.body.item,
            req.body.qty,
            req.body.price,
            marketFee(req.body.price),
            cfg().marketListingHours,
          ],
        );
        await bumpHubQuest(c, auth.userId, 'market_list');
        return {
          id: ins.rows[0]!.id,
          fee: marketFee(req.body.price),
          expiresAt: ins.rows[0]!.expires_at.toISOString(),
          items: await loadInventory(c, auth.userId),
        };
      });
    },
  );

  /** Buys a whole listing. Idempotent: a retried purchase is never paid twice. */
  app.post<{ Params: Static<typeof IdParams> }>(
    '/v1/hub/market/listings/:id/buy',
    { schema: { params: IdParams }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      mustBeInTown(auth.userId);
      const key = readIdempotencyKey(req.headers['idempotency-key']);
      const { response } = await withTx(db, (c) =>
        idempotent(c, auth.userId, key, 'market:buy', req.params, async () => {
          const { rows } = await c.query<{
            seller_id: string;
            adult: boolean;
            item_id: string;
            qty: number;
            price: number;
            fee: number;
            live: boolean;
          }>(
            `SELECT seller_id, adult, item_id, qty, price, fee, expires_at > now() AS live
               FROM hub_listings WHERE id = $1 AND status = 'open' FOR UPDATE`,
            [req.params.id],
          );
          const l = rows[0];
          if (!l || !l.live) throw new HttpProblem('listing_gone', 'Already sold or withdrawn');
          if (l.seller_id === auth.userId)
            throw new HttpProblem('validation_failed', 'That listing is yours');
          if (l.adult !== (await isAdult(c, auth.userId)))
            throw new HttpProblem('listing_gone', 'Not available to you');
          const blocked = await c.query(
            `SELECT 1 FROM hub_blocks WHERE (user_id = $1 AND blocked_id = $2)
                                         OR (user_id = $2 AND blocked_id = $1)`,
            [auth.userId, l.seller_id],
          );
          if (blocked.rowCount) throw new HttpProblem('listing_gone', 'Not available to you');

          await spendGold(c, auth.userId, l.price, 'market_buy');
          const earned = l.price - l.fee;
          if (earned > 0) {
            await c.query(
              `INSERT INTO gold_ledger (user_id, amount, reason, ref_id) VALUES ($1, $2, 'market_sale', $3)`,
              [l.seller_id, earned, randomUUID()],
            );
            await c.query(
              `UPDATE players SET gold = gold + $2, version = version + 1, updated_at = now()
                WHERE user_id = $1`,
              [l.seller_id, earned],
            );
          }
          await addItems(c, auth.userId, { [l.item_id]: l.qty });
          await c.query(
            `UPDATE hub_listings SET status = 'sold', buyer_id = $2, closed_at = now() WHERE id = $1`,
            [req.params.id, auth.userId],
          );
          await bumpHubQuest(c, auth.userId, 'market_buy');
          return {
            bought: { itemId: l.item_id, qty: l.qty, price: l.price },
            gold: await gold(c, auth.userId),
            items: await loadInventory(c, auth.userId),
          };
        }),
      );
      return response;
    },
  );

  /** Withdraws one of your listings: the items come back. */
  app.delete<{ Params: Static<typeof IdParams> }>(
    '/v1/hub/market/listings/:id',
    { schema: { params: IdParams } },
    async (req) => {
      const auth = requireAuth(req);
      return withTx(db, async (c) => {
        const { rows } = await c.query<{ item_id: string; qty: number }>(
          `UPDATE hub_listings SET status = 'cancelled', closed_at = now()
            WHERE id = $1 AND seller_id = $2 AND status = 'open'
            RETURNING item_id, qty`,
          [req.params.id, auth.userId],
        );
        const l = rows[0];
        if (!l) throw new HttpProblem('listing_gone', 'Already closed');
        await addItems(c, auth.userId, { [l.item_id]: l.qty });
        return { items: await loadInventory(c, auth.userId) };
      });
    },
  );

  /** The merchant's furniture, and how many of each you own. */
  app.get('/v1/hub/furniture', async (req) => {
    const auth = requireAuth(req);
    const { rows } = await db.query<{ id: string; qty: number }>(
      `SELECT furniture_id AS id, qty FROM player_furniture WHERE user_id = $1 AND qty > 0`,
      [auth.userId],
    );
    return {
      catalog: FURNITURE.map((f) => ({ id: f.id, price: f.price })),
      owned: Object.fromEntries(rows.map((r) => [r.id, r.qty])),
      gold: await gold(db, auth.userId),
    };
  });

  /** Buys one piece of furniture from the merchant. Idempotent like every purchase. */
  app.post<{ Body: Static<typeof FurnitureBody> }>(
    '/v1/hub/furniture/buy',
    { schema: { body: FurnitureBody }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      mustBeInTown(auth.userId);
      const key = readIdempotencyKey(req.headers['idempotency-key']);
      const { response } = await withTx(db, (c) =>
        idempotent(c, auth.userId, key, 'furniture:buy', req.body, async () => {
          const f = FURNITURE_BY_ID.get(req.body.item)!;
          await spendGold(c, auth.userId, f.price, 'furniture');
          const { rows } = await c.query<{ qty: number }>(
            `INSERT INTO player_furniture (user_id, furniture_id, qty) VALUES ($1, $2, 1)
             ON CONFLICT (user_id, furniture_id) DO UPDATE SET qty = player_furniture.qty + 1
             RETURNING qty`,
            [auth.userId, f.id],
          );
          return { item: f.id, owned: rows[0]!.qty, gold: await gold(c, auth.userId) };
        }),
      );
      return response;
    },
  );
}
