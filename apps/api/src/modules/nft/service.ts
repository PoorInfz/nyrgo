import { CREATURES_BY_ID } from '@nyrgo/shared';
import type { PoolClient } from 'pg';
import type { Db } from '../../db.js';
import type { NftChain, TokenMetadata } from './chain.js';

/**
 * Keeping the game in step with the chain. The token id is the creature id; the NEAR account that
 * holds the token decides which player has the creature: the one who linked that account. When a
 * token changes hands outside the game (a gift, a sale), the creature follows on the next sync.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The player whose linked account (on this network) is `account`, if any. */
async function playerFor(q: Db | PoolClient, network: string, account: string) {
  const { rows } = await q.query<{ user_id: string }>(
    `SELECT user_id FROM wallet_links WHERE network = $1 AND account_id = $2`,
    [network, account],
  );
  return rows[0]?.user_id ?? null;
}

/**
 * Reads what one NEAR account holds and moves creatures accordingly:
 * tokens it holds go to the player who linked it (if any); tokens it no longer holds are looked
 * up and go to their new holder's player (or wait, hidden, until that account is linked).
 */
export async function syncAccount(
  db: Db,
  chain: NftChain,
  network: string,
  account: string,
): Promise<{ adopted: number; moved: number }> {
  const held = (await chain.tokensFor(account)).filter((id) => UUID.test(id));
  const player = await playerFor(db, network, account);
  // Every token in our contract is a creature we minted, so a held token is authoritative even
  // if the mint looked failed at the time (a timeout after the transaction went through).
  const adopted = held.length
    ? await db.query(
        `UPDATE creature_instances
            SET onchain_status = 'minted', onchain_owner = $2, onchain_checked_at = now(),
                minted_at = COALESCE(minted_at, now()), owner_id = COALESCE($3::uuid, owner_id)
          WHERE id = ANY($1::uuid[])`,
        [held, account, player],
      )
    : { rowCount: 0 };

  const { rows: gone } = await db.query<{ id: string }>(
    `SELECT id FROM creature_instances
      WHERE onchain_owner = $1 AND onchain_status = 'minted' AND NOT (id = ANY($2::uuid[]))`,
    [account, held],
  );
  let moved = 0;
  for (const { id } of gone) {
    const holder = await chain.tokenOwner(id);
    if (!holder) continue; // not on chain any more: leave it as it is for a person to look at
    const next = await playerFor(db, network, holder);
    await db.query(
      `UPDATE creature_instances
          SET onchain_owner = $2, onchain_checked_at = now(), owner_id = COALESCE($3::uuid, owner_id)
        WHERE id = $1`,
      [id, holder, next],
    );
    moved++;
  }
  return { adopted: adopted.rowCount ?? 0, moved };
}

/** Throttled per player: a collection opened twice in a row reads the chain once. */
export class Syncer {
  private last = new Map<string, number>();
  constructor(
    private readonly db: Db,
    private readonly chain: NftChain,
    private readonly network: string,
    private readonly everyMs = 30_000,
  ) {}

  async forPlayer(userId: string, now = Date.now()): Promise<void> {
    if (now - (this.last.get(userId) ?? 0) < this.everyMs) return;
    this.last.set(userId, now);
    const { rows } = await this.db.query<{ account_id: string }>(
      `SELECT account_id FROM wallet_links WHERE user_id = $1 AND network = $2`,
      [userId, this.network],
    );
    if (rows[0]) await syncAccount(this.db, this.chain, this.network, rows[0].account_id);
  }

  /** Background pass over every account known to hold creatures. */
  async all(limit = 500): Promise<number> {
    const { rows } = await this.db.query<{ onchain_owner: string }>(
      `SELECT onchain_owner FROM creature_instances
        WHERE onchain_status = 'minted' AND onchain_owner IS NOT NULL
        GROUP BY onchain_owner ORDER BY min(onchain_checked_at) NULLS FIRST LIMIT $1`,
      [limit],
    );
    for (const r of rows) await syncAccount(this.db, this.chain, this.network, r.onchain_owner);
    return rows.length;
  }
}

/** The token's metadata (NEP-177): what wallets and marketplaces show. */
export function creatureMetadata(
  appUrl: string,
  c: { id: string; creatureId: string; level: number; ivs: unknown; acquiredAt: string },
): TokenMetadata {
  const def = CREATURES_BY_ID.get(c.creatureId)!;
  return {
    title: def.name,
    description: def.lore.es,
    media: `${appUrl}/creatures/${def.id}.webp`,
    copies: 1,
    issued_at: String(Date.now()),
    extra: JSON.stringify({
      game: 'nyrGo!',
      species: def.id,
      element: def.element,
      rarity: def.rarity,
      ivs: c.ivs,
      levelAtMint: c.level,
      caughtAt: c.acquiredAt,
    }),
  };
}
