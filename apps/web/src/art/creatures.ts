import type { Draw } from './common.js';
import { sparkle, svg } from './kit.js';
import { LINES_A } from './lines-a.js';
import { LINES_B } from './lines-b.js';
import { LINES_C } from './lines-c.js';
import { LINES_D } from './lines-d.js';
import { LINES_E } from './lines-e.js';
import { LINES_F } from './lines-f.js';

/**
 * 2D portraits for the 50 creatures, drawn as vector art in a monster-collecting style:
 * soft gradients, cel shading, coloured outlines and an elemental glow. Every design is an
 * original animal or object built from what the creature's name and lore mean.
 * Rarity adds gold sparkles around the figure. Output is deterministic.
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const DRAWINGS: Readonly<Record<string, Draw>> = {
  ...LINES_A,
  ...LINES_B,
  ...LINES_C,
  ...LINES_D,
  ...LINES_E,
  ...LINES_F,
};

const SPARKS: Record<Rarity, [number, number, number][]> = {
  common: [],
  uncommon: [[226, 30, 8]],
  rare: [
    [226, 30, 9],
    [28, 46, 7],
  ],
  epic: [
    [228, 28, 11],
    [26, 44, 8],
    [240, 110, 6],
  ],
  legendary: [
    [228, 26, 12],
    [26, 40, 9],
    [242, 106, 7],
    [16, 128, 6],
  ],
  mythic: [
    [230, 24, 13],
    [24, 38, 10],
    [244, 104, 8],
    [14, 126, 7],
    [128, 8, 7],
  ],
};

export function hasArt(id: string): boolean {
  return Object.hasOwn(DRAWINGS, id);
}

/** The complete SVG document for one creature. */
export function creatureSvg(id: string, name: string, rarity: Rarity): string {
  const draw = DRAWINGS[id];
  if (!draw) throw new Error(`no art for ${id}`);
  const sparks = SPARKS[rarity].map(([x, y, r]) => sparkle(x, y, r)).join('');
  return svg(id, name, draw(id) + sparks);
}
