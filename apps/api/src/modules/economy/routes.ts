import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { Type, type Static } from '@sinclair/typebox';
import {
  CREATURES_BY_ID,
  DEFAULT_CONFIG,
  ITEMS,
  ITEMS_BY_ID,
  RECIPES,
  evolutionBlock,
  instanceStats,
  rollPoiLoot,
  seededRandom,
} from '@nyrgo/shared';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { idempotent, readIdempotencyKey } from '../../http/idempotency.js';
import { requireAuth } from '../auth/sessions.js';
import { requireInteractable } from '../anticheat/movement.js';
import { ensureStarterKit, loadInventory } from '../capture/routes.js';
import { loadOwned } from '../creatures/owned.js';
import { grantReward } from '../progress/rewards.js';
import { bumpMissions, todaysMissions } from './missions.js';

const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
type IdParams = Static<typeof IdParams>;

const SHOP = ITEMS.filter((i) => i.price !== null);
/** Most of one item bought in a single purchase. */
export const MAX_BUY = 20;

const BuyBody = Type.Object(
  {
    item: Type.Union(SHOP.map((i) => Type.Literal(i.id))),
    qty: Type.Integer({ minimum: 1, maximum: MAX_BUY }),
  },
  { additionalProperties: false },
);
const CraftBody = Type.Object(
  { recipe: Type.Union(RECIPES.map((r) => Type.Literal(r.id))) },
  { additionalProperties: false },
);
const MissionParams = Type.Object({ id: Type.String({ maxLength: 40 }) });

async function addItems(c: PoolClient, userId: string, items: Record<string, number>) {
  const entries = Object.entries(items).filter(([, n]) => n > 0);
  if (entries.length === 0) return;
  await c.query(
    `INSERT INTO inventory (user_id, item_id, qty)
     SELECT $1, item, qty FROM unnest($2::text[], $3::int[]) AS t(item, qty)
     ON CONFLICT (user_id, item_id) DO UPDATE SET qty = inventory.qty + EXCLUDED.qty`,
    [userId, entries.map(([k]) => k), entries.map(([, v]) => v)],
  );
}

/** Takes items out of the inventory, or throws without taking anything. */
async function takeItems(c: PoolClient, userId: string, items: Record<string, number>) {
  for (const [id, n] of Object.entries(items)) {
    const res = await c.query(
      `UPDATE inventory SET qty = qty - $3 WHERE user_id = $1 AND item_id = $2 AND qty >= $3`,
      [userId, id, n],
    );
    if (res.rowCount === 0) {
      throw new HttpProblem('out_of_items', 'Not enough items', `Need ${n} × ${id}`);
    }
  }
}

/** Spends Gold through the ledger, or throws without spending anything. */
async function spendGold(c: PoolClient, userId: string, amount: number, reason: string) {
  if (amount <= 0) return;
  const { rows } = await c.query<{ gold: string }>(
    `SELECT gold FROM players WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  if (Number(rows[0]!.gold) < amount) {
    throw new HttpProblem('insufficient_gold', 'Not enough Gold', `Need ${amount}`);
  }
  await c.query(
    `INSERT INTO gold_ledger (user_id, amount, reason, ref_id) VALUES ($1, $2, $3, $4)`,
    [userId, -amount, reason, randomUUID()],
  );
  await c.query(
    `UPDATE players SET gold = gold - $2, version = version + 1, updated_at = now() WHERE user_id = $1`,
    [userId, amount],
  );
}

async function playerState(c: PoolClient | Db, userId: string) {
  const { rows } = await c.query<{ gold: string; level: number; xp: string }>(
    `SELECT gold, level, xp FROM players WHERE user_id = $1`,
    [userId],
  );
  return { gold: Number(rows[0]!.gold), level: rows[0]!.level, xp: Number(rows[0]!.xp) };
}

export async function economyRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const cfg = DEFAULT_CONFIG;

  /**
   * Visiting a place within 40 m gives Gold, XP and a few items, once per place every few
   * minutes. The loot is rolled on the server.
   */
  app.post<{ Params: IdParams }>(
    '/v1/pois/:id/visit',
    { schema: { params: IdParams }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      return withTx(db, async (c) => {
        // one visit at a time per player and place
        await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          `visit:${auth.userId}:${req.params.id}`,
        ]);
        const { rows } = await c.query<{ d: number | null; ok: boolean }>(
          `SELECT ST_Distance(p.geom, l.geom) AS d,
                  NOT p.hidden AND NOT is_excluded(p.geom, $3::text[]) AS ok
             FROM pois p
             LEFT JOIN LATERAL (SELECT geom FROM location_samples
                                 WHERE user_id = $2 AND geom IS NOT NULL
                                 ORDER BY created_at DESC LIMIT 1) l ON true
            WHERE p.id = $1`,
          [req.params.id, auth.userId, cfg.world.poiIgnoredExclusions],
        );
        const poi = rows[0];
        if (!poi || !poi.ok) throw new HttpProblem('not_found', 'Unknown place');
        await requireInteractable(c, auth.userId);
        if (poi.d === null)
          throw new HttpProblem('location_required', 'Need a recent location fix');
        if (poi.d > cfg.world.interactionRadiusM) {
          throw new HttpProblem(
            'too_far',
            'Get closer to the place',
            `Within ${cfg.world.interactionRadiusM} m; you are ${Math.round(poi.d)} m away`,
          );
        }
        const prev = await c.query<{ ready_at: Date; ready: boolean }>(
          `SELECT last_visit_at + make_interval(mins => $3) AS ready_at,
                  last_visit_at + make_interval(mins => $3) <= now() AS ready
             FROM poi_visits WHERE user_id = $1 AND poi_id = $2`,
          [auth.userId, req.params.id, cfg.world.poiCooldownMin],
        );
        if (prev.rows[0] && !prev.rows[0].ready) {
          throw new HttpProblem(
            'cooldown_active',
            'Visited recently',
            `Again from ${prev.rows[0].ready_at.toISOString()}`,
          );
        }
        const { rows: visit } = await c.query<{ ready_at: Date }>(
          `INSERT INTO poi_visits (user_id, poi_id) VALUES ($1, $2)
           ON CONFLICT (user_id, poi_id) DO UPDATE SET last_visit_at = now(), visits = poi_visits.visits + 1
           RETURNING last_visit_at + make_interval(mins => $3) AS ready_at`,
          [auth.userId, req.params.id, cfg.world.poiCooldownMin],
        );
        await ensureStarterKit(c, auth.userId);
        const loot = rollPoiLoot(seededRandom(randomBytes(16).toString('hex')));
        await addItems(c, auth.userId, loot.items);
        const reward = await grantReward(c, auth.userId, {
          xp: cfg.economy.rewards.poiInteract.xp,
          gold: loot.gold,
          reason: 'poi_visit',
          refId: randomUUID(),
        });
        await bumpMissions(c, auth.userId, { kind: 'visit' });
        return { items: loot.items, reward, nextVisitAt: visit[0]!.ready_at.toISOString() };
      });
    },
  );

  app.get('/v1/shop', async () => ({
    items: SHOP.map((i) => ({ id: i.id, price: i.price, kind: i.kind })),
    maxPerPurchase: MAX_BUY,
  }));

  /** Buys items with Gold. Idempotent so a retried purchase is never paid twice. */
  app.post<{ Body: Static<typeof BuyBody> }>(
    '/v1/shop/buy',
    { schema: { body: BuyBody }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      const key = readIdempotencyKey(req.headers['idempotency-key']);
      const { response } = await withTx(db, (c) =>
        idempotent(c, auth.userId, key, 'shop:buy', req.body, async () => {
          const item = ITEMS_BY_ID.get(req.body.item)!;
          await spendGold(c, auth.userId, item.price! * req.body.qty, 'shop');
          await addItems(c, auth.userId, { [item.id]: req.body.qty });
          return {
            bought: { id: item.id, qty: req.body.qty },
            ...(await playerState(c, auth.userId)),
            items: await loadInventory(c, auth.userId),
          };
        }),
      );
      return response;
    },
  );

  /** Crafts one item from a recipe: inputs and Gold go, the output arrives. */
  app.post<{ Body: Static<typeof CraftBody> }>(
    '/v1/craft',
    { schema: { body: CraftBody }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      const key = readIdempotencyKey(req.headers['idempotency-key']);
      const { response } = await withTx(db, (c) =>
        idempotent(c, auth.userId, key, 'craft', req.body, async () => {
          const recipe = RECIPES.find((r) => r.id === req.body.recipe)!;
          const me = await playerState(c, auth.userId);
          if (me.level < recipe.unlockLevel) {
            throw new HttpProblem(
              'level_required',
              'Level too low',
              `Needs level ${recipe.unlockLevel}`,
            );
          }
          await takeItems(c, auth.userId, recipe.inputs);
          await spendGold(c, auth.userId, recipe.gold, 'craft');
          await addItems(c, auth.userId, { [recipe.output]: 1 });
          return {
            crafted: recipe.output,
            ...(await playerState(c, auth.userId)),
            items: await loadInventory(c, auth.userId),
          };
        }),
      );
      return response;
    },
  );

  app.get('/v1/me/missions', async (req) => {
    const auth = requireAuth(req);
    return todaysMissions(db, auth.userId);
  });

  app.post<{ Params: Static<typeof MissionParams> }>(
    '/v1/me/missions/:id/claim',
    { schema: { params: MissionParams } },
    async (req) => {
      const auth = requireAuth(req);
      return withTx(db, async (c) => {
        const { day, missions } = await todaysMissions(c, auth.userId);
        const m = missions.find((x) => x.id === req.params.id);
        if (!m) throw new HttpProblem('not_found', 'Not one of today’s missions');
        const claim = await c.query(
          `UPDATE mission_progress SET rewarded_at = now()
            WHERE user_id = $1 AND mission_id = $2 AND period_start = $3::date
              AND completed_at IS NOT NULL AND rewarded_at IS NULL`,
          [auth.userId, m.id, day],
        );
        if (claim.rowCount === 0) {
          throw new HttpProblem(
            m.rewarded ? 'conflict' : 'not_ready',
            m.rewarded ? 'Already claimed' : 'Not completed yet',
          );
        }
        const r = cfg.economy.rewards.dailyMission;
        const reward = await grantReward(c, auth.userId, {
          xp: r.xp,
          gold: r.gold,
          reason: 'mission',
          refId: randomUUID(),
        });
        return { reward, missions: (await todaysMissions(c, auth.userId)).missions };
      });
    },
  );

  /**
   * Evolves a creature that meets its condition (level, or days held), paying Gold and
   * materials. Same creature, new form: individual values and XP stay, HP keeps its proportion.
   */
  app.post<{ Params: IdParams }>(
    '/v1/me/creatures/:id/evolve',
    { schema: { params: IdParams }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      return withTx(db, async (c) => {
        const mine = await loadOwned(c, auth.userId, req.params.id);
        if (!mine) throw new HttpProblem('not_found', 'Unknown creature');
        const fighting = await c.query(
          `SELECT 1 FROM battles WHERE instance_id = $1 AND result IS NULL`,
          [mine.id],
        );
        if (fighting.rowCount) throw new HttpProblem('battle_active', 'Finish the battle first');
        const def = CREATURES_BY_ID.get(mine.creatureId)!;
        const heldDays = (Date.now() - Date.parse(mine.acquiredAt)) / 86_400_000;
        const block = evolutionBlock(def, mine.level, heldDays);
        if (block) {
          const evo = def.evolution;
          throw new HttpProblem(
            'not_ready',
            'Cannot evolve yet',
            block === 'level'
              ? `Needs level ${evo!.level}`
              : block === 'hold_days'
                ? `Needs ${evo!.holdDays} days in your collection`
                : 'Has no evolution',
          );
        }
        const evo = def.evolution!;
        await takeItems(c, auth.userId, evo.materials as Record<string, number>);
        await spendGold(c, auth.userId, evo.gold, 'evolution');
        const next = CREATURES_BY_ID.get(evo.to)!;
        const maxHp = instanceStats(next.stats, mine.level, mine.ivs).hp;
        const hp = Math.max(mine.hp > 0 ? 1 : 0, Math.round((mine.hp / mine.maxHp) * maxHp));
        await c.query(
          `UPDATE creature_instances SET definition_id = $2, evolved_from = $3, hp_current = $4, hp_updated_at = now()
            WHERE id = $1`,
          [mine.id, next.id, def.id, hp],
        );
        await c.query(
          `INSERT INTO dex_entries (user_id, definition_id, caught_at, caught_count) VALUES ($1, $2, now(), 1)
           ON CONFLICT (user_id, definition_id) DO UPDATE SET
             caught_at = COALESCE(dex_entries.caught_at, now()), caught_count = dex_entries.caught_count + 1`,
          [auth.userId, next.id],
        );
        return {
          from: def.id,
          creature: await loadOwned(c, auth.userId, mine.id),
          ...(await playerState(c, auth.userId)),
        };
      });
    },
  );
}
