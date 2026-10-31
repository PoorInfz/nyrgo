import type { Rarity } from '@nyrgo/shared';

/**
 * How each rarity looks when it comes out of a chest: the colours of its smoke and sparks, and
 * how big the show is. Higher rarities get more smoke, more sparks and extra rings of light.
 */
export const RARITY_FX: Record<Rarity, { colors: string[]; power: number; rings: number }> = {
  common: { colors: ['#6ee7a8', '#d1fae5'], power: 0.8, rings: 1 },
  uncommon: { colors: ['#38bdf8', '#bae6fd'], power: 0.95, rings: 1 },
  rare: { colors: ['#a78bfa', '#ddd6fe'], power: 1.1, rings: 2 },
  epic: { colors: ['#f472b6', '#c084fc'], power: 1.25, rings: 2 },
  legendary: { colors: ['#fbbf24', '#fde68a', '#fb923c'], power: 1.45, rings: 3 },
  mythic: {
    colors: ['#f87171', '#fbbf24', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6'],
    power: 1.7,
    rings: 4,
  },
};

const ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

/** The highest rarity in a set: the chest glows in its colour before it opens. */
export function topRarity(list: Rarity[]): Rarity {
  return list.reduce<Rarity>((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), 'common');
}

/** A colour as #rrggbb (the smoke needs six digits to add its own transparency). */
export function hex6(c: string): string {
  const m = /^#([0-9a-f]{3})$/i.exec(c);
  return m ? `#${[...m[1]!].map((x) => x + x).join('')}` : c.slice(0, 7);
}
