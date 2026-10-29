import type { Rarity } from './domain.js';
import type { Ivs } from './progression.js';
import { MAX_IV } from './progression.js';

/**
 * Creature NFTs: how many of each species can ever exist, and how good one individual is.
 * The supply is written into the contract when a species is registered and can never be raised,
 * so scarcity is checkable on chain by anyone.
 */

/** Most NFTs that can ever be minted of one species, by its rarity. */
export const NFT_SUPPLY_BY_RARITY: Record<Rarity, number> = {
  common: 1000,
  uncommon: 400,
  rare: 120,
  epic: 30,
  legendary: 10,
  mythic: 3,
};

export const NFT_GRADES = ['D', 'C', 'B', 'A', 'S'] as const;
export type NftGrade = (typeof NFT_GRADES)[number];

/**
 * How good this individual is, from its individual values (IVs, 0–15 per stat, 0–60 in all):
 * D under 20, C 20–29, B 30–39, A 40–49, S 50 and over. With random IVs about 13 % are D,
 * 35 % C, 36 % B, 14 % A and 1.5 % S: the best ones are the scarce ones.
 */
export function nftGrade(ivs: Ivs): NftGrade {
  const total = ivs.hp + ivs.atk + ivs.def + ivs.spd;
  if (total >= 50) return 'S';
  if (total >= 40) return 'A';
  if (total >= 30) return 'B';
  if (total >= 20) return 'C';
  return 'D';
}

/** IV total as a share of the maximum, 0–100. */
export function ivPercent(ivs: Ivs): number {
  return Math.round(((ivs.hp + ivs.atk + ivs.def + ivs.spd) / (4 * MAX_IV)) * 100);
}
