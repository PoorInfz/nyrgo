import { COSMETICS_BY_ID, type AvatarLook } from '@nyrgo/shared';
import { OUTFITS, type OutfitStyle, type TopKind } from '../avatar/outfits';

/**
 * How an explorer's look is built in 3D: which pack parts (heads, bodies, legs, hats, capes) it
 * wears and what colour each part's cloth, skin and hair take. The same look a player chose in
 * the wardrobe (or a holder outfit), so the 3D figure matches the drawn one as closely as the
 * parts allow. Pure data: the scene code turns a recipe into meshes.
 */

export type Char = 'Knight' | 'Mage' | 'Rogue' | 'Barbarian';
export type Head = Char | 'Rogue_Hooded';
/** Hats from the pack, and simple ones modelled in code. */
export type Hat =
  | 'Knight_Helmet'
  | 'Mage_Hat'
  | 'Barbarian_Hat'
  | 'cap'
  | 'beanie'
  | 'crown'
  | 'leaf'
  | 'explorer'
  | 'toque'
  | 'police'
  | 'straw'
  | 'nurse'
  | 'headphones'
  | 'circlet';

export interface Recipe {
  head: Head;
  /** Body and arms. */
  body: Char;
  legs: Char;
  hat: Hat | null;
  /** The body's own cape, in this colour. */
  cape: string | null;
  colors: {
    skin: string;
    hair: string;
    top: string;
    trim: string;
    pants: string;
    hat: string;
    hatTrim: string;
  };
  /** Small pieces modelled in code. */
  extras: {
    glasses?: string;
    scarf?: [string, string];
    backpack?: string;
    bun?: boolean;
    spikes?: boolean;
    curls?: boolean;
    beard?: string;
  };
}

const DEFAULT_PANTS = '#3b4a6b';

/** Which pack body suits each kind of top. */
const BODY_OF: Record<TopKind, Char> = {
  armor: 'Knight',
  robe: 'Mage',
  coat: 'Mage',
  lab: 'Mage',
  dress: 'Mage',
  chef: 'Mage',
  tunic: 'Rogue',
  tee: 'Rogue',
  jacket: 'Rogue',
  blouse: 'Rogue',
  suit: 'Rogue',
  uniform: 'Rogue',
  overalls: 'Barbarian',
};

/** Hair styles on the pack's four heads, plus a bun or spikes made in code. */
const HEAD_OF: Record<string, { head: Head; bun?: boolean; spikes?: boolean; curls?: boolean }> = {
  hair_short: { head: 'Knight' },
  hair_buzz: { head: 'Knight' },
  hair_ponytail: { head: 'Rogue' },
  hair_long: { head: 'Rogue' },
  hair_bun: { head: 'Rogue', bun: true },
  hair_spiky: { head: 'Mage', spikes: true },
  hair_curly: { head: 'Knight', curls: true },
};

/** The wardrobe's tops as outfit kinds. */
const TOP_KIND: Record<string, TopKind> = {
  top_tee_teal: 'tee',
  top_tee_sun: 'tee',
  top_hoodie: 'jacket',
  top_raincoat: 'coat',
  top_track: 'jacket',
  top_explorer: 'overalls',
  top_cosmic: 'robe',
};

const WARDROBE_HAT: Record<string, Hat | null> = {
  hat_none: null,
  hat_cap: 'cap',
  hat_beanie: 'beanie',
  hat_explorer: 'explorer',
  hat_leaf: 'leaf',
  hat_crown: 'crown',
};

const OUTFIT_HAT: Record<NonNullable<OutfitStyle['hat']>, Hat> = {
  cap: 'cap',
  witch: 'Mage_Hat',
  wizard: 'Mage_Hat',
  helmet: 'Knight_Helmet',
  hood: 'cap', // the hood is a head (below); never used as a hat
  toque: 'toque',
  police: 'police',
  straw: 'straw',
  nurse: 'nurse',
  headphones: 'headphones',
  circlet: 'circlet',
};

const color = (id: string, fallback: string) => COSMETICS_BY_ID.get(id)?.color ?? fallback;
const trimOf = (id: string, fallback: string) => COSMETICS_BY_ID.get(id)?.trim ?? fallback;

/** The 3D recipe for a look. */
export function recipeFor(look: AvatarLook): Recipe {
  const skin = color(look.skin, '#f5c6a0');
  const outfit = look.outfit && look.outfit !== 'outfit_none' ? OUTFITS[look.outfit] : undefined;
  if (outfit) return fromOutfit(outfit, skin);

  const hair = HEAD_OF[look.hair] ?? HEAD_OF.hair_short!;
  const kind = TOP_KIND[look.top] ?? 'tee';
  const body = BODY_OF[kind];
  const top = color(look.top, '#2bb5a0');
  const acc = look.accessory;
  const hat = WARDROBE_HAT[look.hat] ?? null;
  return {
    head: hair.head,
    body,
    legs: body === 'Knight' ? 'Rogue' : body,
    hat,
    cape: acc === 'acc_cape' ? color(acc, '#9b4ff5') : null,
    colors: {
      skin,
      hair: color(look.hairColor, '#6b4226'),
      top,
      trim: trimOf(look.top, top),
      pants: DEFAULT_PANTS,
      hat: hat ? color(look.hat, '#ef4a5b') : top,
      hatTrim: hat ? trimOf(look.hat, '#ffffff') : top,
    },
    extras: {
      ...(acc === 'acc_glasses' ? { glasses: color(acc, '#06222b') } : {}),
      ...(acc === 'acc_scarf' ? { scarf: [color(acc, '#ef4a5b'), trimOf(acc, '#ffcf4d')] } : {}),
      ...(acc === 'acc_backpack' ? { backpack: color(acc, '#22c96b') } : {}),
      // a hat covers a bun or spikes
      ...(hair.bun && !hat ? { bun: true } : {}),
      ...(hair.spikes && !hat ? { spikes: true } : {}),
      ...(hair.curls && !hat ? { curls: true } : {}),
    },
  };
}

function fromOutfit(o: OutfitStyle, skin: string): Recipe {
  const hair = HEAD_OF[o.hair ?? 'hair_short'] ?? HEAD_OF.hair_short!;
  const body = BODY_OF[o.kind];
  const hooded = o.hat === 'hood';
  const hat = o.hat && !hooded ? OUTFIT_HAT[o.hat] : null;
  const pants = o.pants ?? o.skirt?.color ?? DEFAULT_PANTS;
  return {
    head: hooded
      ? 'Rogue_Hooded'
      : o.hat === 'helmet'
        ? 'Knight'
        : o.beard
          ? 'Barbarian'
          : hair.head,
    body,
    // robes and dresses reach the shoes: the legs take the skirt's colour
    legs: body === 'Knight' ? 'Knight' : body,
    hat,
    cape: o.cape ?? null,
    colors: {
      skin,
      hair: o.hairColor ?? '#2a211c',
      top: o.top,
      trim: o.trim,
      pants,
      hat: o.hatColor ?? o.top,
      hatTrim: o.hatTrim ?? o.trim,
    },
    extras: {
      ...(o.glasses ? { glasses: o.glasses } : {}),
      ...(o.backpack ? { backpack: o.backpack } : {}),
      ...(o.beard ? { beard: o.beard } : {}),
      ...(hair.bun && !hat && !hooded ? { bun: true } : {}),
      ...(hair.spikes && !hat && !hooded ? { spikes: true } : {}),
      ...(hair.curls && !hat && !hooded ? { curls: true } : {}),
    },
  };
}

/**
 * The colour each texture cell takes for a recipe, per pack character's texture. The packs share
 * one layout: cell (row, column) of an 8×4 grid; (0,0) is skin and (0,1) hair everywhere, the
 * cloth cells differ by character (measured from which cells each part's UVs use).
 */
export function cellColors(char: Char, r: Recipe): [number, number, string][] {
  const c = r.colors;
  const cape = r.cape ?? c.trim;
  const cells: [number, number, string][] = [
    [0, 0, c.skin],
    [0, 1, c.hair],
  ];
  if (char === 'Knight') {
    cells.push([0, 3, c.top], [0, 7, c.top], [1, 0, cape]);
  } else if (char === 'Mage') {
    cells.push([2, 7, c.skin], [1, 0, c.top], [1, 1, c.hat], [1, 2, cape], [2, 3, c.pants]);
    cells.push([1, 7, c.trim]);
  } else if (char === 'Rogue') {
    cells.push([1, 0, c.top], [1, 1, r.head === 'Rogue_Hooded' ? c.hat : cape], [2, 3, c.pants]);
  } else {
    cells.push([1, 1, c.top], [1, 0, c.trim], [2, 3, c.pants], [0, 7, r.cape ?? '#6b5c53']);
  }
  return cells;
}
