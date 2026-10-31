import type { PoolClient } from 'pg';
import {
  HOLDER_TIERS,
  TOKEN,
  TOKEN_UNIT,
  canUseWeb3,
  tierFor,
  wholeTokens,
  type AgeBand,
  type HolderTier,
} from '@nyrgo/shared';
import type { Db } from '../../db.js';
import type { NearRpc } from '../wallet/rpc.js';

/**
 * Test token holder ranks (testnet). Every hour the job reads the token balance of each adult's
 * linked account and keeps it for `TOKEN.holdHours` (+1 day). A rank is the highest one the
 * *smallest* balance of the whole window reaches, and only once the account has been watched for
 * the whole window: tokens bought just before a catch and sold after it count for nothing.
 */

const HOUR = 3_600_000;
/** Slack for the hourly job running a little late. */
const SLACK = 90 * 60_000;
/** Older than this, the balances are too stale to grant anything (the job has stopped). */
const STALE = 6 * 3_600_000;

export interface Snapshot {
  at: Date;
  balance: bigint;
}

export interface Rank {
  /** The rank in force now, or null. */
  tier: HolderTier | null;
  /** The latest balance seen (smallest unit), or null if never read. */
  balance: bigint | null;
  checkedAt: Date | null;
  /** The rank the latest balance would give, and when it starts counting (if not already). */
  next: { tier: HolderTier; countsAt: Date } | null;
  stale: boolean;
}

/** The rank from an account's snapshots (oldest first), as of `now`. Pure, for tests. */
export function rankFrom(snaps: Snapshot[], now: Date): Rank {
  const last = snaps[snaps.length - 1];
  if (!last) return { tier: null, balance: null, checkedAt: null, next: null, stale: false };
  const stale = now.getTime() - last.at.getTime() > STALE;
  const windowStart = now.getTime() - TOKEN.holdHours * HOUR;
  const covered = snaps[0]!.at.getTime() <= windowStart + SLACK;
  let tier: HolderTier | null = null;
  if (covered && !stale) {
    const inWindow = snaps.filter((s) => s.at.getTime() >= windowStart - SLACK);
    const min = inWindow.reduce((m, s) => (s.balance < m ? s.balance : m), last.balance);
    tier = tierFor(min);
  }
  // what the latest balance would give, and since when it has been held at that level
  const target = tierFor(last.balance);
  let next: Rank['next'] = null;
  if (target && (!tier || HOLDER_TIERS.indexOf(target) > HOLDER_TIERS.indexOf(tier))) {
    const need = BigInt(target.amount) * TOKEN_UNIT;
    let since = snaps[0]!.at;
    for (let i = 0; i < snaps.length; i++) {
      if (snaps[i]!.balance < need) since = snaps[i + 1]?.at ?? last.at;
    }
    next = { tier: target, countsAt: new Date(since.getTime() + TOKEN.holdHours * HOUR) };
  }
  return { tier, balance: last.balance, checkedAt: last.at, next, stale };
}

/** The rank of a player's currently linked account on `network`. */
export async function rankOf(c: Db | PoolClient, userId: string, network: string): Promise<Rank> {
  const { rows } = await c.query<{ taken_at: Date; balance: string }>(
    `SELECT s.taken_at, s.balance FROM holder_snapshots s
       JOIN wallet_links w ON w.user_id = s.user_id AND w.account_id = s.account_id
      WHERE s.user_id = $1 AND w.network = $2
        AND s.taken_at > now() - make_interval(hours => $3)
      ORDER BY s.taken_at`,
    [userId, network, TOKEN.holdHours + 24],
  );
  return rankFrom(
    rows.map((r) => ({ at: r.taken_at, balance: BigInt(r.balance) })),
    new Date(),
  );
}

/** Reads and keeps one account's balance now. */
async function snapshot(
  c: Db | PoolClient,
  rpc: NearRpc,
  contract: string,
  userId: string,
  account: string,
): Promise<bigint> {
  const balance = (await rpc.ftBalance!(contract, account)) ?? 0n;
  await c.query(
    `INSERT INTO holder_snapshots (user_id, account_id, balance) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, taken_at) DO UPDATE SET balance = EXCLUDED.balance`,
    [userId, account, balance.toString()],
  );
  return balance;
}

/** Takes one player's balance now (the "check again" button). */
export async function snapshotPlayer(
  db: Db,
  rpc: NearRpc,
  contract: string,
  network: string,
  userId: string,
): Promise<'ok' | 'no_wallet' | 'not_adult'> {
  const { rows } = await db.query<{ age_band: AgeBand; account_id: string | null }>(
    `SELECT u.age_band, w.account_id FROM users u
       LEFT JOIN wallet_links w ON w.user_id = u.id AND w.network = $2
      WHERE u.id = $1`,
    [userId, network],
  );
  const u = rows[0];
  if (!u || !canUseWeb3(u.age_band)) return 'not_adult';
  if (!u.account_id) return 'no_wallet';
  await snapshot(db, rpc, contract, userId, u.account_id);
  return 'ok';
}

/**
 * The hourly job: a balance for every adult with a linked account, old rows dropped, and holder
 * outfits taken off anyone whose rank no longer includes them.
 */
export async function runHolders(
  db: Db,
  rpc: NearRpc | null,
  contract: string | null,
  network: string,
): Promise<Record<string, number | string>> {
  if (!rpc?.ftBalance || !contract) return { skipped: 'holder ranks are off' };
  const { rows } = await db.query<{ user_id: string; account_id: string; age_band: AgeBand }>(
    `SELECT w.user_id, w.account_id, u.age_band FROM wallet_links w
       JOIN users u ON u.id = w.user_id
      WHERE w.network = $1`,
    [network],
  );
  let read = 0;
  let failed = 0;
  const adults = rows.filter((r) => canUseWeb3(r.age_band));
  // a few at a time: the public RPC is shared
  for (let i = 0; i < adults.length; i += 5) {
    const results = await Promise.allSettled(
      adults.slice(i, i + 5).map((r) => snapshot(db, rpc, contract, r.user_id, r.account_id)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') read++;
      else failed++;
    }
  }
  const dropped = await db.query(
    `DELETE FROM holder_snapshots s
      WHERE s.taken_at < now() - make_interval(hours => $1)
         OR NOT EXISTS (SELECT 1 FROM wallet_links w
                         WHERE w.user_id = s.user_id AND w.account_id = s.account_id)`,
    [TOKEN.holdHours + 24],
  );
  const undressed = await takeOffOutfits(db, network);
  return { read, failed, dropped: dropped.rowCount ?? 0, undressed };
}

/** Players wearing a holder outfit whose rank does not include outfits go back to their explorer. */
export async function takeOffOutfits(db: Db, network: string): Promise<number> {
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT user_id FROM players WHERE avatar->>'outfit' LIKE 'skin\\_%'`,
  );
  let n = 0;
  for (const r of rows) {
    const rank = await rankOf(db, r.user_id, network);
    if (rank.tier?.outfits) continue;
    await db.query(
      `UPDATE players SET avatar = jsonb_set(avatar, '{outfit}', '"outfit_none"'), updated_at = now()
        WHERE user_id = $1`,
      [r.user_id],
    );
    n++;
  }
  return n;
}

/** What the profile shows. */
export function rankView(rank: Rank, contract: string | null, account: string | null) {
  return {
    contract,
    account,
    symbol: TOKEN.symbol,
    holdHours: TOKEN.holdHours,
    balance: rank.balance === null ? null : wholeTokens(rank.balance),
    checkedAt: rank.checkedAt?.toISOString() ?? null,
    stale: rank.stale,
    tier: rank.tier?.id ?? null,
    next: rank.next
      ? { tier: rank.next.tier.id, countsAt: rank.next.countsAt.toISOString() }
      : null,
    tiers: HOLDER_TIERS,
  };
}
