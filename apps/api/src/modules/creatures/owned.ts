import type { PoolClient } from 'pg';
import {
  CREATURES_BY_ID,
  creatureLevelForXp,
  instanceStats,
  restedHp,
  type Ivs,
  type Stats,
} from '@nyrgo/shared';
import type { Db } from '../../db.js';

type Q = Db | PoolClient;

export interface OwnedView {
  id: string;
  creatureId: string;
  level: number;
  xp: number;
  ivs: Ivs;
  stats: Stats;
  /** HP right now, including what it has recovered since it was last hurt. */
  hp: number;
  maxHp: number;
  acquiredVia: string;
  acquiredAt: string;
  /** Set when the creature is an NFT: being minted, or held by a NEAR account. */
  onchain: { status: 'minting' | 'minted'; account: string | null } | null;
}

interface Row {
  id: string;
  definition_id: string;
  level: number;
  xp: string;
  ivs: Ivs;
  hp_current: number;
  hp_updated_at: Date;
  acquired_via: string;
  acquired_at: Date;
  onchain_status: 'minting' | 'minted' | null;
  onchain_owner: string | null;
  now: Date;
}

function view(r: Row): OwnedView {
  const stats = instanceStats(CREATURES_BY_ID.get(r.definition_id)!.stats, r.level, r.ivs);
  const minutes = (r.now.getTime() - r.hp_updated_at.getTime()) / 60_000;
  return {
    id: r.id,
    creatureId: r.definition_id,
    level: r.level,
    xp: Number(r.xp),
    ivs: r.ivs,
    stats,
    hp: restedHp(r.hp_current, stats.hp, minutes),
    maxHp: stats.hp,
    acquiredVia: r.acquired_via,
    acquiredAt: r.acquired_at.toISOString(),
    onchain: r.onchain_status ? { status: r.onchain_status, account: r.onchain_owner } : null,
  };
}

const COLUMNS = `id, definition_id, level, xp, ivs, hp_current, hp_updated_at, acquired_via, acquired_at,
  onchain_status, onchain_owner, now() AS now`;

/**
 * A creature that is an NFT belongs, in the game, to whoever holds the token: it shows up for
 * the player whose linked NEAR account holds it, and for nobody else.
 */
const VISIBLE = `(onchain_owner IS NULL
  OR onchain_owner = (SELECT w.account_id FROM wallet_links w WHERE w.user_id = owner_id))`;

export async function listOwned(q: Q, userId: string): Promise<OwnedView[]> {
  const { rows } = await q.query<Row>(
    `SELECT ${COLUMNS} FROM creature_instances WHERE owner_id = $1 AND ${VISIBLE}
      ORDER BY acquired_at DESC, id`,
    [userId],
  );
  return rows.map(view);
}

/** One of the player's creatures, locked for update when inside a transaction. */
export async function loadOwned(
  c: PoolClient,
  userId: string,
  id: string,
): Promise<OwnedView | null> {
  const { rows } = await c.query<Row>(
    `SELECT ${COLUMNS} FROM creature_instances WHERE id = $1 AND owner_id = $2 AND ${VISIBLE}
      FOR UPDATE`,
    [id, userId],
  );
  return rows[0] ? view(rows[0]) : null;
}

/** Stores a creature's HP as of now (recovery restarts from this value). */
export async function setHp(c: PoolClient, id: string, hp: number): Promise<void> {
  await c.query(
    `UPDATE creature_instances SET hp_current = $2, hp_updated_at = now() WHERE id = $1`,
    [id, Math.max(0, Math.round(hp))],
  );
}

/**
 * Adds XP to a creature and levels it up. Its HP rises by however much its maximum grew, so a
 * level-up never leaves it more hurt than before.
 */
export async function addCreatureXp(
  c: PoolClient,
  owned: OwnedView,
  xp: number,
  hpNow: number,
): Promise<{ level: number; leveledUp: boolean; xp: number }> {
  const total = owned.xp + xp;
  const level = Math.max(owned.level, creatureLevelForXp(total));
  const newMax = instanceStats(CREATURES_BY_ID.get(owned.creatureId)!.stats, level, owned.ivs).hp;
  const hp = Math.min(newMax, hpNow + (newMax - owned.maxHp));
  await c.query(
    `UPDATE creature_instances SET xp = $2, level = $3, hp_current = $4, hp_updated_at = now() WHERE id = $1`,
    [owned.id, total, level, hp],
  );
  return { level, leveledUp: level > owned.level, xp };
}
