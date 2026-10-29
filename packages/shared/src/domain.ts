/** Core domain enumerations shared by the API, the web client and the simulation. */

export const ELEMENTS = [
  'fire',
  'water',
  'nature',
  'electric',
  'shadow',
  'light',
  'earth',
  'ice',
  'wind',
  'cosmic',
] as const;
export type Element = (typeof ELEMENTS)[number];

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

export const AGE_BANDS = ['13-15', '16-17', '18+'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** Web3 features (wallet, NFTs, marketplace, claims) are only ever shown to adults. */
export function canUseWeb3(ageBand: AgeBand): boolean {
  return ageBand === '18+';
}
