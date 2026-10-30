/**
 * The explorer's look: what the player's avatar wears on the map. Purely cosmetic (no effect on
 * play), bought with Gold earned in the game. Price 0 means everyone has it from the start.
 */

export type CosmeticSlot = 'skin' | 'hair' | 'hairColor' | 'top' | 'hat' | 'accessory';

export const COSMETIC_SLOTS: readonly CosmeticSlot[] = [
  'skin',
  'hair',
  'hairColor',
  'top',
  'hat',
  'accessory',
] as const;

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  /** Gold; 0 = free for everyone. */
  price: number;
  name: { es: string; en: string };
  /** Main colour, and a second one for trims, where the piece has them. */
  color?: string;
  trim?: string;
}

const C = (
  id: string,
  slot: CosmeticSlot,
  price: number,
  es: string,
  en: string,
  color?: string,
  trim?: string,
): CosmeticDef => ({
  id,
  slot,
  price,
  name: { es, en },
  ...(color ? { color } : {}),
  ...(trim ? { trim } : {}),
});

export const COSMETICS: readonly CosmeticDef[] = [
  // skin tones (all free)
  C('skin_1', 'skin', 0, 'Tono 1', 'Tone 1', '#ffe0c7'),
  C('skin_2', 'skin', 0, 'Tono 2', 'Tone 2', '#f5c6a0'),
  C('skin_3', 'skin', 0, 'Tono 3', 'Tone 3', '#d9a17a'),
  C('skin_4', 'skin', 0, 'Tono 4', 'Tone 4', '#a8714d'),
  C('skin_5', 'skin', 0, 'Tono 5', 'Tone 5', '#6e4630'),

  // hair styles
  C('hair_short', 'hair', 0, 'Corto', 'Short'),
  C('hair_ponytail', 'hair', 0, 'Coleta', 'Ponytail'),
  C('hair_buzz', 'hair', 0, 'Rapado', 'Buzz cut'),
  C('hair_spiky', 'hair', 80, 'De punta', 'Spiky'),
  C('hair_bun', 'hair', 80, 'Moño', 'Bun'),
  C('hair_long', 'hair', 120, 'Largo', 'Long'),
  C('hair_curly', 'hair', 120, 'Rizado', 'Curly'),

  // hair colours (free)
  C('hc_black', 'hairColor', 0, 'Negro', 'Black', '#2a211c'),
  C('hc_brown', 'hairColor', 0, 'Castaño', 'Brown', '#6b4226'),
  C('hc_blond', 'hairColor', 0, 'Rubio', 'Blond', '#e8c066'),
  C('hc_red', 'hairColor', 0, 'Pelirrojo', 'Red', '#b5482a'),
  C('hc_grey', 'hairColor', 0, 'Gris', 'Grey', '#a7adb4'),
  C('hc_mint', 'hairColor', 150, 'Menta', 'Mint', '#43f289'),
  C('hc_violet', 'hairColor', 150, 'Violeta', 'Violet', '#9b4ff5'),

  // tops
  C('top_tee_teal', 'top', 0, 'Camiseta turquesa', 'Teal tee', '#2bb5a0', '#1d7f71'),
  C('top_tee_sun', 'top', 0, 'Camiseta amarilla', 'Yellow tee', '#ffcf4d', '#c99a1c'),
  C('top_hoodie', 'top', 100, 'Sudadera', 'Hoodie', '#3f6fd8', '#2b4f9e'),
  C('top_raincoat', 'top', 150, 'Chubasquero', 'Raincoat', '#ffb300', '#c27f00'),
  C('top_track', 'top', 180, 'Chándal', 'Tracksuit', '#ef4a5b', '#ffffff'),
  C('top_explorer', 'top', 250, 'Chaqueta de exploración', 'Explorer jacket', '#8a6b3f', '#5c4626'),
  C('top_cosmic', 'top', 600, 'Traje cósmico', 'Cosmic suit', '#2b1d5c', '#92fde8'),

  // hats
  C('hat_none', 'hat', 0, 'Sin gorro', 'No hat'),
  C('hat_cap', 'hat', 60, 'Gorra', 'Cap', '#ef4a5b', '#ffffff'),
  C('hat_beanie', 'hat', 80, 'Gorro de lana', 'Beanie', '#3f6fd8', '#ffcf4d'),
  C('hat_explorer', 'hat', 250, 'Sombrero de exploración', 'Explorer hat', '#c9a46a', '#5c4626'),
  C('hat_leaf', 'hat', 300, 'Hoja de la suerte', 'Lucky leaf', '#43f289', '#22c96b'),
  C('hat_crown', 'hat', 800, 'Corona', 'Crown', '#ffcf4d', '#ef4a5b'),

  // accessories
  C('acc_none', 'accessory', 0, 'Nada', 'Nothing'),
  C('acc_glasses', 'accessory', 70, 'Gafas', 'Glasses', '#06222b'),
  C('acc_scarf', 'accessory', 90, 'Bufanda', 'Scarf', '#ef4a5b', '#ffcf4d'),
  C('acc_backpack', 'accessory', 120, 'Mochila', 'Backpack', '#22c96b', '#06222b'),
  C('acc_cape', 'accessory', 400, 'Capa', 'Cape', '#9b4ff5', '#ead9ff'),
];

export const COSMETICS_BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

export type AvatarLook = Record<CosmeticSlot, string>;

/** What every new explorer wears. */
export const DEFAULT_AVATAR: AvatarLook = {
  skin: 'skin_2',
  hair: 'hair_short',
  hairColor: 'hc_brown',
  top: 'top_tee_teal',
  hat: 'hat_none',
  accessory: 'acc_none',
};

/** Why a look cannot be worn with these owned items, or null if it can. */
export function invalidLook(
  look: Record<string, unknown>,
  owned: ReadonlySet<string>,
): string | null {
  for (const slot of COSMETIC_SLOTS) {
    const id = look[slot];
    if (typeof id !== 'string') return `missing ${slot}`;
    const def = COSMETICS_BY_ID.get(id);
    if (!def || def.slot !== slot) return `unknown ${slot}`;
    if (def.price > 0 && !owned.has(id)) return `not owned: ${id}`;
  }
  if (Object.keys(look).some((k) => !(COSMETIC_SLOTS as readonly string[]).includes(k)))
    return 'unknown slot';
  return null;
}

/** A stored look, repaired: anything unknown falls back to the default for that slot. */
export function normaliseLook(look: unknown): AvatarLook {
  const src = (look && typeof look === 'object' ? look : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_AVATAR };
  for (const slot of COSMETIC_SLOTS) {
    const id = src[slot];
    if (typeof id === 'string' && COSMETICS_BY_ID.get(id)?.slot === slot) out[slot] = id;
  }
  return out;
}
