import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { Type, type Static } from '@sinclair/typebox';
import {
  CREATURES_BY_ID,
  DEFAULT_CONFIG,
  ITEMS,
  battleXp,
  createFighter,
  instanceStats,
  invalidAction,
  resolveTurn,
  seededRandom,
  startBattle,
  type Action,
  type BattleEvent,
  type BattleState,
} from '@nyrgo/shared';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { idempotent, readIdempotencyKey } from '../../http/idempotency.js';
import { requireAuth } from '../auth/sessions.js';
import { requireInteractable } from '../anticheat/movement.js';
import { assertInRange, distanceToSpawn } from '../capture/routes.js';
import { addCreatureXp, loadOwned, setHp } from '../creatures/owned.js';
import { grantReward, PLAYER_TZ_SQL } from '../progress/rewards.js';
import { bumpMissions } from '../economy/missions.js';

const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
type IdParams = Static<typeof IdParams>;

const HEAL_ITEMS = ITEMS.filter((i) => i.kind === 'heal').map((i) => i.id);

const StartBody = Type.Object(
  { creature: Type.String({ format: 'uuid' }) },
  { additionalProperties: false },
);

const ActionBody = Type.Object(
  {
    action: Type.Union([
      Type.Object(
        { kind: Type.Literal('skill'), skill: Type.String({ maxLength: 40 }) },
        { additionalProperties: false },
      ),
      Type.Object(
        { kind: Type.Literal('item'), item: Type.Union(HEAL_ITEMS.map((i) => Type.Literal(i))) },
        { additionalProperties: false },
      ),
      Type.Object({ kind: Type.Literal('flee') }, { additionalProperties: false }),
    ]),
  },
  { additionalProperties: false },
);
type ActionBody = Static<typeof ActionBody>;

const HealBody = Type.Object(
  { item: Type.Union(HEAL_ITEMS.map((i) => Type.Literal(i))) },
  { additionalProperties: false },
);

/** Wild creatures fight with middle individual values. */
const WILD_IVS = { hp: 7, atk: 7, def: 7, spd: 7 };

/** The random source of one turn: secret per battle, different for every turn. */
const turnRandom = (seed: string, turn: number) => seededRandom(`${seed}:${turn}`);

interface BattleRow {
  id: string;
  user_id: string;
  encounter_id: string | null;
  instance_id: string | null;
  seed: string;
  state: BattleState;
  turn: number;
  result: string | null;
  rewarded: boolean;
}

/** What the client sees: the state without the seed. */
function view(b: { id: string; state: BattleState }, events: BattleEvent[] = [], extra = {}) {
  const { player, foe } = b.state;
  const side = (f: typeof player) => ({
    creatureId: f.creatureId,
    level: f.level,
    hp: f.hp,
    maxHp: f.maxHp,
    skills: f.skills,
    passive: f.passive,
    mods: f.mods,
  });
  return {
    id: b.id,
    turn: b.state.turn,
    result: b.state.result,
    player: side(player),
    foe: side(foe),
    items: b.state.items,
    events,
    ...extra,
  };
}

async function healItems(c: PoolClient, userId: string): Promise<Record<string, number>> {
  const { rows } = await c.query<{ item_id: string; qty: number }>(
    `SELECT item_id, qty FROM inventory WHERE user_id = $1 AND item_id = ANY($2::text[]) AND qty > 0`,
    [userId, HEAL_ITEMS],
  );
  return Object.fromEntries(rows.map((r) => [r.item_id, r.qty]));
}

/** Wins that paid a reward today (the player's local day), for the daily cap. */
async function rewardedWinsToday(c: PoolClient, userId: string): Promise<number> {
  const { rows } = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM battles
      WHERE user_id = $1 AND rewarded
        AND finished_at >= (date_trunc('day', now() AT TIME ZONE ${PLAYER_TZ_SQL}) AT TIME ZONE ${PLAYER_TZ_SQL})`,
    [userId],
  );
  return rows[0]!.n;
}

export async function battleRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /**
   * Starts a battle between one of the player's creatures and the wild creature of an open
   * encounter. Resumes the running battle if there is one.
   */
  app.post<{ Params: IdParams; Body: Static<typeof StartBody> }>(
    '/v1/encounters/:id/battle',
    {
      schema: { params: IdParams, body: StartBody },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req) => {
      const auth = requireAuth(req);
      return withTx(db, async (c) => {
        const { rows } = await c.query<{
          user_id: string;
          spawn_id: string;
          status: string;
          open: boolean;
          foe_hp: number | null;
          won_at: Date | null;
          definition_id: string;
          level: number;
        }>(
          `SELECT e.user_id, e.spawn_id, e.status, e.expires_at > now() AS open, e.foe_hp, e.won_at,
                  s.definition_id, COALESCE(e.level, s.level) AS level
             FROM encounters e JOIN spawns s ON s.id = e.spawn_id
            WHERE e.id = $1 FOR UPDATE OF e`,
          [req.params.id],
        );
        const enc = rows[0];
        if (!enc || enc.user_id !== auth.userId)
          throw new HttpProblem('not_found', 'Unknown encounter');

        const running = await c.query<BattleRow>(
          `SELECT * FROM battles WHERE encounter_id = $1 AND result IS NULL`,
          [req.params.id],
        );
        if (running.rows[0]) return view(running.rows[0]);

        if (enc.status === 'caught')
          throw new HttpProblem('already_caught', 'Already in your collection');
        if (enc.status === 'fled') throw new HttpProblem('creature_fled', 'This creature ran away');
        if (!enc.open) throw new HttpProblem('spawn_expired', 'This creature has gone');
        if (enc.won_at || enc.foe_hp === 0) {
          throw new HttpProblem('already_won', 'This creature is worn out: try to capture it');
        }
        await requireInteractable(c, auth.userId);
        assertInRange(await distanceToSpawn(c, auth.userId, enc.spawn_id));

        const mine = await loadOwned(c, auth.userId, req.body.creature);
        if (!mine) throw new HttpProblem('not_found', 'Unknown creature');
        if (mine.hp <= 0)
          throw new HttpProblem('creature_exhausted', 'This creature needs to rest');

        const pDef = CREATURES_BY_ID.get(mine.creatureId)!;
        const fDef = CREATURES_BY_ID.get(enc.definition_id)!;
        const player = createFighter({
          creatureId: mine.creatureId,
          element: pDef.element,
          level: mine.level,
          stats: mine.stats,
          skills: pDef.skills,
          passive: pDef.passive,
          hp: mine.hp,
        });
        const foeStats = instanceStats(fDef.stats, enc.level, WILD_IVS);
        const foe = createFighter({
          creatureId: fDef.id,
          element: fDef.element,
          level: enc.level,
          stats: foeStats,
          skills: fDef.skills,
          passive: fDef.passive,
          hp: enc.foe_hp ?? foeStats.hp,
        });
        const seed = randomBytes(6).readUIntBE(0, 6).toString();
        const { state, events } = startBattle(
          player,
          foe,
          await healItems(c, auth.userId),
          turnRandom(seed, 0),
        );
        // the creature's current HP becomes its stored HP: recovery pauses during the battle
        await setHp(c, mine.id, mine.hp);
        await c.query(`UPDATE encounters SET foe_max_hp = $2 WHERE id = $1`, [
          req.params.id,
          foeStats.hp,
        ]);
        const ins = await c.query<{ id: string }>(
          `INSERT INTO battles (user_id, kind, seed, encounter_id, instance_id, state, turns)
           VALUES ($1, 'wild', $2, $3, $4, $5, $6) RETURNING id`,
          [auth.userId, seed, req.params.id, mine.id, state, JSON.stringify([{ turn: 0, events }])],
        );
        return view({ id: ins.rows[0]!.id, state }, events);
      });
    },
  );

  app.get<{ Params: IdParams }>(
    '/v1/battles/:id',
    { schema: { params: IdParams } },
    async (req) => {
      const auth = requireAuth(req);
      const { rows } = await db.query<BattleRow>(`SELECT * FROM battles WHERE id = $1`, [
        req.params.id,
      ]);
      const b = rows[0];
      if (!b || b.user_id !== auth.userId || !b.state)
        throw new HttpProblem('not_found', 'Unknown battle');
      return view(b);
    },
  );

  /**
   * One turn: the player's action and the wild creature's answer, resolved on the server with
   * the battle's secret seed. Requires an Idempotency-Key so a retried request is not a second
   * turn.
   */
  app.post<{ Params: IdParams; Body: ActionBody }>(
    '/v1/battles/:id/turn',
    {
      schema: { params: IdParams, body: ActionBody },
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (req) => {
      const auth = requireAuth(req);
      const key = readIdempotencyKey(req.headers['idempotency-key']);
      const { response } = await withTx(db, (c) =>
        idempotent(c, auth.userId, key, `turn:${req.params.id}`, req.body, async () => {
          const { rows } = await c.query<BattleRow>(
            `SELECT * FROM battles WHERE id = $1 FOR UPDATE`,
            [req.params.id],
          );
          const b = rows[0];
          if (!b || b.user_id !== auth.userId || !b.state)
            throw new HttpProblem('not_found', 'Unknown battle');
          const action = req.body.action as Action;
          const why = invalidAction(b.state, action);
          if (why === 'battle_over') throw new HttpProblem('conflict', 'This battle is over');
          if (why === 'out_of_items')
            throw new HttpProblem('out_of_items', 'No patches of that kind left');
          if (why) throw new HttpProblem('invalid_action', 'That move is not available', why);
          // Fleeing is always allowed; attacking or healing needs the player to still be there.
          if (action.kind !== 'flee') await requireInteractable(c, auth.userId);

          if (action.kind === 'item') {
            const used = await c.query(
              `UPDATE inventory SET qty = qty - 1 WHERE user_id = $1 AND item_id = $2 AND qty > 0`,
              [auth.userId, action.item],
            );
            if (used.rowCount === 0)
              throw new HttpProblem('out_of_items', 'No patches of that kind left');
          }

          const turn = b.turn + 1;
          const { state, events } = resolveTurn(b.state, action, turnRandom(b.seed, turn));
          await c.query(
            `UPDATE battles SET state = $2, turn = $3, turns = turns || $4::jsonb,
                    result = $5, finished_at = CASE WHEN $5::text IS NULL THEN NULL ELSE now() END
              WHERE id = $1`,
            [b.id, state, turn, JSON.stringify([{ turn, action, events }]), state.result],
          );

          let outcome: Record<string, unknown> = {};
          if (state.result) outcome = await finish(c, auth.userId, b, state);
          return view({ id: b.id, state }, events, outcome);
        }),
      );
      return response;
    },
  );

  /** Uses a patch on a creature outside battle. */
  app.post<{ Params: IdParams; Body: Static<typeof HealBody> }>(
    '/v1/me/creatures/:id/heal',
    { schema: { params: IdParams, body: HealBody } },
    async (req) => {
      const auth = requireAuth(req);
      return withTx(db, async (c) => {
        const mine = await loadOwned(c, auth.userId, req.params.id);
        if (!mine) throw new HttpProblem('not_found', 'Unknown creature');
        const fighting = await c.query(
          `SELECT 1 FROM battles WHERE instance_id = $1 AND result IS NULL`,
          [mine.id],
        );
        if (fighting.rowCount)
          throw new HttpProblem('battle_active', 'Heal it from the battle screen');
        const used = await c.query(
          `UPDATE inventory SET qty = qty - 1 WHERE user_id = $1 AND item_id = $2 AND qty > 0`,
          [auth.userId, req.body.item],
        );
        if (used.rowCount === 0)
          throw new HttpProblem('out_of_items', 'No patches of that kind left');
        const heal = ITEMS.find((i) => i.id === req.body.item)!.effects.heal ?? 0;
        const hp = Math.min(mine.maxHp, mine.hp + heal);
        await setHp(c, mine.id, hp);
        return { ...mine, hp };
      });
    },
  );
}

/**
 * End of a battle: the player's creature keeps its HP; the wild creature keeps its HP for this
 * encounter (worn down = easier to capture). A win pays the creature XP always and the player
 * a reward up to the daily cap; one rewarded win per encounter.
 */
async function finish(c: PoolClient, userId: string, b: BattleRow, state: BattleState) {
  const out: Record<string, unknown> = {};
  if (b.encounter_id) {
    await c.query(
      `UPDATE encounters SET foe_hp = $2, won_at = CASE WHEN $3 THEN now() ELSE won_at END WHERE id = $1`,
      [b.encounter_id, state.foe.hp, state.result === 'win'],
    );
  }
  const mine = b.instance_id ? await loadOwned(c, userId, b.instance_id) : null;
  if (!mine) return out;
  if (state.result !== 'win') {
    await setHp(c, mine.id, state.player.hp);
    return out;
  }
  out.creatureXp = await addCreatureXp(c, mine, battleXp(state.foe.level), state.player.hp);
  await bumpMissions(c, userId, { kind: 'win' });
  const eco = DEFAULT_CONFIG.economy;
  if ((await rewardedWinsToday(c, userId)) < eco.rewards.pveWin.dailyCap) {
    await c.query(`UPDATE battles SET rewarded = true WHERE id = $1`, [b.id]);
    out.reward = await grantReward(c, userId, {
      xp: eco.rewards.pveWin.xp,
      gold: eco.rewards.pveWin.gold,
      reason: 'pve_win',
      refId: b.id,
    });
  } else {
    out.reward = null;
  }
  return out;
}
