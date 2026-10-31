/**
 * The nyrGo! token as the game tries it on NEAR testnet (no value, no sale). Holders get a rank
 * from the smallest balance they kept over the last days; each rank boosts their NEAR catch tips
 * and the higher ones unlock holder outfits. Ranks are fixed token amounts (here, the shares of
 * the testnet supply the owner asked for), so they do not shrink as more people hold.
 */

export const TOKEN = {
  symbol: 'NYRGO',
  decimals: 18,
  /** Whole tokens minted once to the game account. */
  supply: 1_000_000_000,
  /** A rank counts the smallest balance seen over this many hours. */
  holdHours: 24,
  /** How often balances are read (hours). */
  snapshotHours: 1,
  /** At most this share of a day's tip budget may go to boosts; beyond it, plain tips. */
  boostShareOfBudget: 0.25,
} as const;

export interface HolderTier {
  id: 'h1' | 'h2' | 'h3' | 'h4' | 'h5';
  /** Whole tokens needed, held for `TOKEN.holdHours`. */
  amount: number;
  /** Percent added to each NEAR catch tip. */
  tipBoostPct: number;
  /** Unlocks the holder outfits. */
  outfits: boolean;
}

/** Lowest first. Shares of the 1,000,000,000 testnet supply: 0.1 %, 0.3 %, 0.5 %, 1 %, 2 %. */
export const HOLDER_TIERS: readonly HolderTier[] = [
  { id: 'h1', amount: 1_000_000, tipBoostPct: 10, outfits: false },
  { id: 'h2', amount: 3_000_000, tipBoostPct: 15, outfits: false },
  { id: 'h3', amount: 5_000_000, tipBoostPct: 25, outfits: true },
  { id: 'h4', amount: 10_000_000, tipBoostPct: 50, outfits: true },
  { id: 'h5', amount: 20_000_000, tipBoostPct: 100, outfits: true },
] as const;

/** One whole token in the contract's smallest unit. */
export const TOKEN_UNIT = 10n ** BigInt(TOKEN.decimals);

/** The highest rank a balance (smallest unit) reaches, or null. */
export function tierFor(balance: bigint): HolderTier | null {
  let best: HolderTier | null = null;
  for (const t of HOLDER_TIERS) if (balance >= BigInt(t.amount) * TOKEN_UNIT) best = t;
  return best;
}

/** Whole tokens, rounded down, for display. */
export const wholeTokens = (balance: bigint) => Number(balance / TOKEN_UNIT);
