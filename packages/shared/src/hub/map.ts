import { HUB_SPRITES, type HubGround, type HubSprite } from './art.js';
import { DEFAULT_AVATAR, type AvatarLook } from '../content/cosmetics.js';

/**
 * The town square (Central Plaza): the hub's first district. One description of the world shared
 * by the server (which validates every move against it) and the client (which draws it).
 * Coordinates are world pixels; 1 art pixel = 1 world pixel; a tile is 32 px.
 */

export const TILE = 32;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placed {
  sprite: HubSprite;
  /** Top-left corner of the sprite. */
  x: number;
  y: number;
  /** Parts of it you cannot walk through (absolute world rects). */
  solid: Rect[];
}

export type InteractionKind = 'exit' | 'gym' | 'arena' | 'market' | 'house' | 'npc';

export interface Interaction {
  id: string;
  kind: InteractionKind;
  /** Where the prompt appears (world px); usable within `radius`. */
  x: number;
  y: number;
  radius: number;
}

export interface Npc {
  id: string;
  /** Feet position. */
  x: number;
  y: number;
  look: AvatarLook;
  facing: 'left' | 'right';
}

export interface HubMap {
  id: string;
  width: number;
  height: number;
  ground: HubGround;
  /** Ground patches drawn over the base ground (paths). */
  patches: { ground: HubGround; rect: Rect }[];
  objects: Placed[];
  interactions: Interaction[];
  npcs: Npc[];
  /** Solid areas that are not drawn objects (NPCs standing around). */
  blocked: Rect[];
  /** Where players appear (feet). */
  spawn: { x: number; y: number };
}

const size = (s: HubSprite) => HUB_SPRITES[s];

/** A building: its body is solid; the door is an interaction just below it. */
function building(sprite: HubSprite, x: number, y: number) {
  const { w, h } = size(sprite);
  const placed: Placed = {
    sprite,
    x,
    y,
    solid: [{ x: x + 6, y: y + Math.round(h * 0.3), w: w - 12, h: Math.round(h * 0.62) }],
  };
  return { placed, door: { x: x + Math.round(w / 2), y: y + h + 6 } };
}

/** A tree: only the trunk and the lower crown block the way. */
function tree(sprite: HubSprite, x: number, y: number): Placed {
  const { w, h } = size(sprite);
  return {
    sprite,
    x,
    y,
    solid: [
      {
        x: x + Math.round(w * 0.28),
        y: y + Math.round(h * 0.62),
        w: Math.round(w * 0.44),
        h: Math.round(h * 0.3),
      },
    ],
  };
}

/** A small prop with a solid base of the given height. */
function prop(sprite: HubSprite, x: number, y: number, base = 14): Placed {
  const { w, h } = size(sprite);
  return { sprite, x, y, solid: [{ x: x + 4, y: y + h - base, w: w - 8, h: base }] };
}

function plaza(x: number, y: number): Placed {
  // the fountain, the four lamp posts, the trees and the board inside the plaza art
  const r = (lx: number, ly: number, w: number, h: number): Rect => ({
    x: x + lx,
    y: y + ly,
    w,
    h,
  });
  return {
    sprite: 'plaza',
    x,
    y,
    solid: [
      r(176, 150, 126, 92), // fountain basin
      r(62, 190, 22, 40), // lamp, left
      r(388, 190, 22, 40), // lamp, right
      r(140, 390, 22, 44), // lamp, bottom left
      r(318, 390, 22, 44), // lamp, bottom right
      r(0, 330, 120, 110), // trees, bottom left
      r(362, 372, 86, 70), // notice board
      r(0, 0, 196, 64), // top-left trees
      r(300, 0, 150, 64), // top-right tree
    ],
  };
}

function look(over: Partial<AvatarLook>): AvatarLook {
  return { ...DEFAULT_AVATAR, ...over };
}

function centralPlaza(): HubMap {
  const width = 1560;
  const height = 1090;
  const top = 36;
  const gym = building('gym', 96, top);
  const arena = building('arena', 352, top);
  const market = building('market', 630, top);
  const houseRed = building('house-red', 900, top);
  const houseBlue = building('house-blue', 1100, top);
  const housePurple = building('house-purple', 1290, top);
  const px = Math.round((width - size('plaza').w) / 2);
  const py = 318;
  const portalX = Math.round(width / 2 - size('portal').w / 2);
  const portalY = py + size('plaza').h + 70;
  const portal: Placed = {
    sprite: 'portal',
    x: portalX,
    y: portalY,
    solid: [{ x: portalX + 10, y: portalY + 40, w: size('portal').w - 20, h: 70 }],
  };

  const objects: Placed[] = [
    gym.placed,
    arena.placed,
    market.placed,
    houseRed.placed,
    houseBlue.placed,
    housePurple.placed,
    plaza(px, py),
    portal,
    // west side
    tree('tree-pine', 20, 300),
    tree('tree-round', 120, 420),
    tree('tree-pine', 10, 560),
    tree('tree-cherry', 160, 640),
    prop('well', 330, 560, 26),
    prop('bench-long', 300, 420, 22),
    prop('pond', 30, 900, 60),
    tree('tree-round', 220, 880),
    prop('flower-box', 300, 1000, 30),
    // east side
    prop('statue', 1110, 520, 40),
    prop('bench', 1250, 430, 18),
    prop('umbrella', 1350, 410, 20),
    tree('tree-pine', 1460, 300),
    tree('tree-round', 1420, 560),
    tree('tree-cherry', 1300, 700),
    tree('tree-pine', 1450, 840),
    prop('flowers', 1180, 920, 22),
    prop('fence', 1200, 1020, 20),
    // around the portal
    prop('signpost', portalX - 60, portalY + 30, 18),
    prop('lamp', portalX + size('portal').w + 20, portalY + 4, 16),
    prop('lamp', portalX - 120, portalY + 4, 16),
    prop('flower-pot', portalX - 160, portalY + 70, 14),
    prop('trophy', 1040, 300, 16),
    prop('banner-blue', 1180, 290, 14),
    prop('board', 480, 290, 16),
  ];

  const npcs: Npc[] = [
    {
      id: 'guide',
      x: px + 250,
      y: py + 300,
      facing: 'left',
      look: look({
        skin: 'skin_3',
        hair: 'hair_ponytail',
        hairColor: 'hc_mint',
        top: 'top_explorer',
        hat: 'hat_explorer',
      }),
    },
    {
      id: 'coach',
      x: gym.door.x + 70,
      y: gym.door.y + 40,
      facing: 'left',
      look: look({
        skin: 'skin_4',
        hair: 'hair_spiky',
        hairColor: 'hc_black',
        top: 'top_track',
        hat: 'hat_cap',
      }),
    },
    {
      id: 'merchant',
      x: market.door.x + 80,
      y: market.door.y + 36,
      facing: 'left',
      look: look({
        skin: 'skin_1',
        hair: 'hair_bun',
        hairColor: 'hc_blond',
        top: 'top_raincoat',
        accessory: 'acc_scarf',
      }),
    },
  ];

  const interactions: Interaction[] = [
    {
      id: 'exit',
      kind: 'exit',
      x: portalX + Math.round(size('portal').w / 2),
      y: portalY + 118,
      radius: 70,
    },
    { id: 'gym', kind: 'gym', x: gym.door.x, y: gym.door.y, radius: 56 },
    { id: 'arena', kind: 'arena', x: arena.door.x, y: arena.door.y, radius: 56 },
    { id: 'market', kind: 'market', x: market.door.x, y: market.door.y, radius: 56 },
    { id: 'house-red', kind: 'house', x: houseRed.door.x, y: houseRed.door.y, radius: 50 },
    { id: 'house-blue', kind: 'house', x: houseBlue.door.x, y: houseBlue.door.y, radius: 50 },
    { id: 'house-purple', kind: 'house', x: housePurple.door.x, y: housePurple.door.y, radius: 50 },
    ...npcs.map((n) => ({ id: `npc:${n.id}`, kind: 'npc' as const, x: n.x, y: n.y, radius: 60 })),
  ];

  return {
    id: 'plaza',
    width,
    height,
    ground: 'grass',
    patches: [
      // the street in front of the buildings, and the way down to the portal
      { ground: 'sand', rect: { x: 60, y: top + 200, w: width - 120, h: 84 } },
      {
        ground: 'sand',
        rect: { x: Math.round(width / 2) - 50, y: py + size('plaza').h - 20, w: 100, h: 110 },
      },
    ],
    objects,
    interactions,
    npcs,
    blocked: npcs.map((n) => ({ x: n.x - 12, y: n.y - 10, w: 24, h: 12 })),
    // in front of the portal (its screen faces south), where players arrive and leave
    spawn: { x: Math.round(width / 2), y: portalY + size('portal').h + 22 },
  };
}

export const HUB_MAPS: Record<string, HubMap> = { plaza: centralPlaza() };

/** A body's footprint at its feet: what collides with the world. */
export const FOOT = { w: 18, h: 8 } as const;

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Whether someone standing with their feet at (x, y) fits in the map. */
export function canStand(map: HubMap, x: number, y: number): boolean {
  const foot: Rect = { x: x - FOOT.w / 2, y: y - FOOT.h, w: FOOT.w, h: FOOT.h };
  if (
    foot.x < 8 ||
    foot.y < 8 ||
    foot.x + foot.w > map.width - 8 ||
    foot.y + foot.h > map.height - 4
  )
    return false;
  for (const o of map.objects) for (const r of o.solid) if (overlaps(foot, r)) return false;
  for (const r of map.blocked) if (overlaps(foot, r)) return false;
  return true;
}

/**
 * Moves from `from` towards `to`, sliding along walls: tries the full step, then each axis on its
 * own, so a player pushing diagonally into a wall keeps moving along it.
 */
export function walk(
  map: HubMap,
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number } {
  if (canStand(map, to.x, to.y)) return to;
  if (canStand(map, to.x, from.y)) return { x: to.x, y: from.y };
  if (canStand(map, from.x, to.y)) return { x: from.x, y: to.y };
  return from;
}

/** The interaction within reach of (x, y), nearest first. */
export function interactionAt(map: HubMap, x: number, y: number): Interaction | null {
  let best: Interaction | null = null;
  let bestD = Infinity;
  for (const i of map.interactions) {
    const d = Math.hypot(i.x - x, i.y - y);
    if (d <= i.radius && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}
