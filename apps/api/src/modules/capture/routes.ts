import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { Type, type Static } from '@sinclair/typebox';
import {
  CREATURES_BY_ID,
  DEFAULT_CONFIG,
  ITEMS_BY_ID,
  MAX_IV,
  STARTERS,
  captureChance,
  captureFactor,
  creatureXpForLevel,
  weaknessFactor,
  instanceStats,
  type Ivs,
  type Rarity,
} from '@nyrgo/shared';
import { isUniqueViolation, withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { idempotent, readIdempotencyKey } from '../../http/idempotency.js';
import { requireAuth } from '../auth/sessions.js';
import { requireInteractable } from '../anticheat/movement.js';
import { grantReward } from '../progress/rewards.js';
import { listOwned } from '../creatures/owned.js';
import { bumpMissions } from '../economy/missions.js';

const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
type IdParams = Static<typeof IdParams>;

const CAPTURE_ITEMS = [...ITEMS_BY_ID.values()]
  .filter((i) => i.kind === 'capture')
  .map((i) => i.id);

const CaptureBody = Type.Object(
  {
    item: Type.Union(CAPTURE_ITEMS.map((id) => Type.Literal(id))),
    /** Timing score from the throw, 0–1. Client-reported, so its weight is capped by config. */
    skill: Type.Number({ minimum: 0, maximum: 1 }),
  },
  { additionalProperties: false },
);
type CaptureBody = Static<typeof CaptureBody>;

const StarterBody = Type.Object(
  { creatureId: Type.Union(STARTERS.map((s) => Type.Literal(s.id))) },
  { additionalProperties: false },
);

/** Gives a player the starter kit the first time it is needed. */
export async function ensureStarterKit(c: PoolClient, userId: string): Promise<void> {
  const { rowCount } = await c.query(
    `UPDATE players SET kit_granted_at = now() WHERE user_id = $1 AND kit_granted_at IS NULL`,
    [userId],
  );
  if (rowCount === 0) return;
  const kit = Object.entries(DEFAULT_CONFIG.capture.starterKit);
  await c.query(
    `INSERT INTO inventory (user_id, item_id, qty)
     SELECT $1, item, qty FROM unnest($2::text[], $3::int[]) AS t(item, qty)
     ON CONFLICT (user_id, item_id) DO UPDATE SET qty = inventory.qty + EXCLUDED.qty`,
    [userId, kit.map(([k]) => k), kit.map(([, v]) => v)],
  );
}

async function markDex(c: PoolClient, userId: string, creatureId: string, caught: boolean) {
  await c.query(
    `INSERT INTO dex_entries (user_id, definition_id, caught_at, caught_count)
     VALUES ($1, $2, CASE WHEN $3 THEN now() END, CASE WHEN $3 THEN 1 ELSE 0 END)
     ON CONFLICT (user_id, definition_id) DO UPDATE SET
       caught_at = COALESCE(dex_entries.caught_at, EXCLUDED.caught_at),
       caught_count = dex_entries.caught_count + EXCLUDED.caught_count`,
    [userId, creatureId, caught],
  );
}

const rollIvs = (): Ivs => ({
  hp: randomInt(MAX_IV + 1),
  atk: randomInt(MAX_IV + 1),
  def: randomInt(MAX_IV + 1),
  spd: randomInt(MAX_IV + 1),
});

/** A uniform roll in [0, 1) from the OS random source (never from the client). */
const roll = () => randomInt(2 ** 32) / 2 ** 32;

async function addCreature(
  c: PoolClient,
  userId: string,
  creatureId: string,
  level: number,
  via: 'capture' | 'starter',
  ref: string,
) {
  const def = CREATURES_BY_ID.get(creatureId)!;
  const ivs = rollIvs();
  const stats = instanceStats(def.stats, level, ivs);
  const { rows } = await c.query<{ id: string; acquired_at: Date }>(
    `INSERT INTO creature_instances (definition_id, owner_id, level, xp, ivs, hp_current, acquired_via, acquired_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, acquired_at`,
    [creatureId, userId, level, creatureXpForLevel(level), ivs, stats.hp, via, ref],
  );
  return {
    id: rows[0]!.id,
    creatureId,
    level,
    ivs,
    stats,
    hp: stats.hp,
    acquiredVia: via,
    acquiredAt: rows[0]!.acquired_at.toISOString(),
  };
}

/** Distance from the player's latest precise fix to a spawn. */
export async function distanceToSpawn(
  c: PoolClient,
  userId: string,
  spawnId: string,
): Promise<number> {
  const { rows } = await c.query<{ d: number | null }>(
    `SELECT ST_Distance(s.geom, l.geom) AS d
       FROM spawns s,
            LATERAL (SELECT geom FROM location_samples
                      WHERE user_id = $1 AND geom IS NOT NULL
                      ORDER BY created_at DESC LIMIT 1) AS l
      WHERE s.id = $2`,
    [userId, spawnId],
  );
  const d = rows[0]?.d;
  if (d === undefined || d === null)
    throw new HttpProblem('location_required', 'Need a recent location fix');
  return d;
}

export function assertInRange(d: number) {
  const r = DEFAULT_CONFIG.world.interactionRadiusM;
  if (d > r)
    throw new HttpProblem(
      'too_far',
      'Get closer to the creature',
      `Within ${r} m; you are ${Math.round(d)} m away`,
    );
}

export async function captureRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const cap = DEFAULT_CONFIG.capture;

  /** Starts (or resumes) an encounter with a spawn the player is standing next to. */
  app.post<{ Params: IdParams }>(
    '/v1/spawns/:id/encounter',
    { schema: { params: IdParams }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      return withTx(db, async (c) => {
        const { rows } = await c.query<{
          definition_id: string;
          level: number;
          expires_at: Date;
          live: boolean;
        }>(
          `SELECT definition_id, level, expires_at,
                  window_start <= now() AND expires_at > now() AS live
             FROM spawns WHERE id = $1`,
          [req.params.id],
        );
        const spawn = rows[0];
        if (!spawn) throw new HttpProblem('not_found', 'Unknown creature');

        // Two requests for the same player and spawn (a double tap, a remounted screen) queue
        // here, so the second one resumes the encounter the first one created.
        await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          `encounter:${auth.userId}:${req.params.id}`,
        ]);
        const { rows: prior } = await c.query<{
          id: string;
          status: string;
          attempts: number;
          expires_at: Date;
          foe_hp: number | null;
          foe_max_hp: number | null;
          won_at: Date | null;
        }>(
          `SELECT id, status, attempts, expires_at, foe_hp, foe_max_hp, won_at FROM encounters WHERE user_id = $1 AND spawn_id = $2 FOR UPDATE`,
          [auth.userId, req.params.id],
        );
        const existing = prior[0];
        if (existing?.status === 'caught')
          throw new HttpProblem('already_caught', 'Already in your collection');
        if (existing?.status === 'fled')
          throw new HttpProblem('creature_fled', 'This creature ran away');
        if (!existing && !spawn.live)
          throw new HttpProblem('spawn_expired', 'This creature has gone');

        await requireInteractable(c, auth.userId);
        assertInRange(await distanceToSpawn(c, auth.userId, req.params.id));
        await ensureStarterKit(c, auth.userId);

        let enc = existing;
        if (!enc) {
          const ins = await c.query<{
            id: string;
            status: string;
            attempts: number;
            expires_at: Date;
            foe_hp: number | null;
            foe_max_hp: number | null;
            won_at: Date | null;
          }>(
            `INSERT INTO encounters (user_id, spawn_id, expires_at)
             VALUES ($1, $2, $3::timestamptz + make_interval(mins => $4))
             RETURNING id, status, attempts, expires_at, foe_hp, foe_max_hp, won_at`,
            [auth.userId, req.params.id, spawn.expires_at, cap.encounterGraceMin],
          );
          enc = ins.rows[0]!;
          await markDex(c, auth.userId, spawn.definition_id, false);
        }
        const def = CREATURES_BY_ID.get(spawn.definition_id)!;
        return {
          id: enc.id,
          spawnId: req.params.id,
          creatureId: spawn.definition_id,
          level: spawn.level,
          rarity: def.rarity,
          status: enc.status,
          attempts: enc.attempts,
          expiresAt: enc.expires_at.toISOString(),
          /** Null until a battle has started; 0 once worn out (easiest to capture). */
          foeHp: enc.foe_hp,
          foeMaxHp: enc.foe_max_hp,
          worn: enc.won_at !== null,
          inventory: await loadInventory(c, auth.userId),
        };
      });
    },
  );

  /**
   * One throw. The chance is computed and rolled on the server; the client only sends which
   * vault and its timing score. Requires an Idempotency-Key so a retried request never spends
   * two vaults or rolls twice.
   */
  app.post<{ Params: IdParams; Body: CaptureBody }>(
    '/v1/encounters/:id/capture',
    {
      schema: { params: IdParams, body: CaptureBody },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req) => {
      const auth = requireAuth(req);
      const key = readIdempotencyKey(req.headers['idempotency-key']);
      const { response } = await withTx(db, (c) =>
        idempotent(c, auth.userId, key, `capture:${req.params.id}`, req.body, async () => {
          const { rows } = await c.query<{
            id: string;
            user_id: string;
            spawn_id: string;
            status: string;
            attempts: number;
            open: boolean;
            definition_id: string;
            level: number;
            foe_hp: number | null;
            foe_max_hp: number | null;
            fighting: boolean;
          }>(
            `SELECT e.id, e.user_id, e.spawn_id, e.status, e.attempts, e.expires_at > now() AS open,
                    s.definition_id, s.level, e.foe_hp, e.foe_max_hp,
                    EXISTS (SELECT 1 FROM battles b WHERE b.encounter_id = e.id AND b.result IS NULL) AS fighting
               FROM encounters e JOIN spawns s ON s.id = e.spawn_id
              WHERE e.id = $1 FOR UPDATE OF e`,
            [req.params.id],
          );
          const enc = rows[0];
          if (!enc || enc.user_id !== auth.userId)
            throw new HttpProblem('not_found', 'Unknown encounter');
          if (enc.status === 'caught')
            throw new HttpProblem('already_caught', 'Already in your collection');
          if (enc.status === 'fled')
            throw new HttpProblem('creature_fled', 'This creature ran away');
          if (!enc.open) throw new HttpProblem('spawn_expired', 'This creature has gone');
          if (enc.fighting) throw new HttpProblem('battle_active', 'Finish the battle first');

          await requireInteractable(c, auth.userId);
          assertInRange(await distanceToSpawn(c, auth.userId, enc.spawn_id));
          await ensureStarterKit(c, auth.userId);

          const used = await c.query<{ qty: number }>(
            `UPDATE inventory SET qty = qty - 1 WHERE user_id = $1 AND item_id = $2 AND qty > 0 RETURNING qty`,
            [auth.userId, req.body.item],
          );
          if (used.rowCount === 0)
            throw new HttpProblem('out_of_items', 'No vaults of that kind left');

          const def = CREATURES_BY_ID.get(enc.definition_id)!;
          const item = ITEMS_BY_ID.get(req.body.item)!;
          const chance = captureChance(
            cap,
            def.rarity,
            item.effects.captureMultiplier ?? 1,
            // a creature worn down in battle is up to twice as easy to store
            captureFactor(def.captureDifficulty, enc.level) *
              (enc.foe_hp === null || enc.foe_max_hp === null
                ? 1
                : weaknessFactor(enc.foe_hp, enc.foe_max_hp)),
            req.body.skill,
          );
          const r = roll();
          const success = r < chance;
          const fled = !success && roll() < cap.fleeChance[def.rarity as Rarity];

          const attempt = await c.query<{ id: string }>(
            `INSERT INTO capture_attempts (user_id, spawn_id, encounter_id, item_id, skill_score, chance, roll, success)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [auth.userId, enc.spawn_id, enc.id, req.body.item, req.body.skill, chance, r, success],
          );
          await c.query(
            `UPDATE encounters SET attempts = attempts + 1, status = $2,
                    ended_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END
              WHERE id = $1`,
            [enc.id, success ? 'caught' : fled ? 'fled' : 'open'],
          );

          const eco = DEFAULT_CONFIG.economy;
          const base = success ? eco.rewards.captureSuccess : eco.rewards.captureFail;
          const reward = await grantReward(c, auth.userId, {
            xp: Math.round(base.xp * eco.rarityXpMultiplier[def.rarity as Rarity]),
            gold: base.gold,
            reason: success ? 'capture' : 'capture_attempt',
            refId: attempt.rows[0]!.id,
          });

          await bumpMissions(c, auth.userId, { kind: 'throw' });
          let creature = null;
          if (success) {
            await bumpMissions(c, auth.userId, { kind: 'catch', creatureId: enc.definition_id });
            creature = await addCreature(
              c,
              auth.userId,
              enc.definition_id,
              enc.level,
              'capture',
              enc.spawn_id,
            );
            await markDex(c, auth.userId, enc.definition_id, true);
          }
          return {
            result: success ? 'caught' : fled ? 'fled' : 'escaped',
            chance: Math.round(chance * 1000) / 1000,
            attempts: enc.attempts + 1,
            itemsLeft: used.rows[0]!.qty,
            reward,
            creature,
          };
        }),
      );
      return response;
    },
  );

  app.get('/v1/me/inventory', async (req) => {
    const auth = requireAuth(req);
    return withTx(db, async (c) => {
      await ensureStarterKit(c, auth.userId);
      return { items: await loadInventory(c, auth.userId) };
    });
  });

  app.get('/v1/me/creatures', async (req) => {
    const auth = requireAuth(req);
    return { creatures: await listOwned(db, auth.userId) };
  });

  /** Which creatures this player has seen and caught. */
  app.get('/v1/me/dex', async (req) => {
    const auth = requireAuth(req);
    const { rows } = await db.query<{
      definition_id: string;
      seen_at: Date;
      caught_at: Date | null;
      caught_count: number;
    }>(
      `SELECT definition_id, seen_at, caught_at, caught_count FROM dex_entries WHERE user_id = $1`,
      [auth.userId],
    );
    return {
      entries: rows.map((r) => ({
        creatureId: r.definition_id,
        seenAt: r.seen_at.toISOString(),
        caughtAt: r.caught_at?.toISOString() ?? null,
        caughtCount: r.caught_count,
      })),
    };
  });

  /** Picks the first creature. Once per player. */
  app.post<{ Body: Static<typeof StarterBody> }>(
    '/v1/me/starter',
    { schema: { body: StarterBody } },
    async (req, reply) => {
      const auth = requireAuth(req);
      try {
        const creature = await withTx(db, async (c) => {
          const made = await addCreature(
            c,
            auth.userId,
            req.body.creatureId,
            cap.starterLevel,
            'starter',
            randomUUID(),
          );
          await markDex(c, auth.userId, req.body.creatureId, true);
          await ensureStarterKit(c, auth.userId);
          return made;
        });
        return reply.code(201).send(creature);
      } catch (err) {
        if (isUniqueViolation(err))
          throw new HttpProblem('starter_taken', 'You already have a starter');
        throw err;
      }
    },
  );
}

export async function loadInventory(c: PoolClient | Db, userId: string) {
  const { rows } = await c.query<{ item_id: string; qty: number }>(
    `SELECT item_id, qty FROM inventory WHERE user_id = $1 AND qty > 0 ORDER BY item_id`,
    [userId],
  );
  return rows.map((r) => ({ id: r.item_id, qty: r.qty }));
}
