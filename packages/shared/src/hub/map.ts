import { HUB_SPRITES, type HubGround, type HubSprite } from './art.js';
import { DEFAULT_AVATAR, type AvatarLook } from '../content/cosmetics.js';

/**
 * The town: the square (Central Plaza) and the buildings you can walk into (gym, arena). One
 * description of the world shared by the server (which validates every move against it) and the
 * client (which draws it). Coordinates are world pixels; on the square 1 art pixel = 1 world
 * pixel; interiors are drawn at 2×. A tile is 32 px.
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

export type InteractionKind = 'exit' | 'gym' | 'arena' | 'market' | 'house' | 'npc' | 'door';

export interface Interaction {
  id: string;
  kind: InteractionKind;
  /** Where the prompt appears (world px); usable within `radius`. */
  x: number;
  y: number;
  radius: number;
  /** For doors: the room it leads to and where you appear there (feet). */
  to?: { room: string; x: number; y: number };
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
  /** Repeated ground texture, or null for interiors (their art is the floor). */
  ground: HubGround | null;
  /** An interior's picture, drawn at the top-left, scaled. */
  background?: { sprite: HubSprite; scale: number };
  /** Ground patches drawn over the base ground (paths). */
  patches: { ground: HubGround; rect: Rect }[];
  objects: Placed[];
  interactions: Interaction[];
  npcs: Npc[];
  /** Solid areas that are not drawn objects (NPCs standing around). */
  blocked: Rect[];
  /** Where players appear (feet). */
  spawn: { x: number; y: number };
  /** How large people and creatures are drawn, relative to the 40×56 px explorer. */
  actorScale?: number;
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
  // A compact square: the town's three big buildings along the north street, two houses on
  // each side along their own lanes, the plaza in the middle and the portal to the south.
  const width = 1400;
  const height = 1080;
  const top = 30;
  const px = 450;
  const py = 360;
  const plazaArt = size('plaza');
  // the plaza art's north gate and south exit, in world pixels
  const gateX = px + 250;
  const exitX = px + 242;
  const gym = building('gym', gateX - 117 - 30 - 217, top);
  const arena = building('arena', gateX - 117, top);
  const market = building('market', gateX + 118 + 30, top);
  const houseW1 = building('house-red', 36, 330);
  const houseW2 = building('house-purple', 40, 610);
  const houseE1 = building('house-blue', width - 36 - size('house-blue').w, 330);
  const houseE2 = building('house-red', width - 36 - size('house-red').w, 610);
  const streetY = top + 220;
  const laneW = { x: 236, w: 70 };
  const laneE = { x: width - 236 - 70, w: 70 };
  const portalX = exitX - Math.round(size('portal').w / 2);
  const portalY = py + plazaArt.h + 62;
  const portal: Placed = {
    sprite: 'portal',
    x: portalX,
    y: portalY,
    solid: [{ x: portalX + 10, y: portalY + 40, w: size('portal').w - 20, h: 70 }],
  };
  // an arch over a lane: only its two posts are in the way
  const arch = (x: number, y: number): Placed => {
    const { w, h } = size('arch');
    return {
      sprite: 'arch',
      x,
      y,
      solid: [
        { x: x + 2, y: y + h - 16, w: 22, h: 14 },
        { x: x + w - 24, y: y + h - 16, w: 22, h: 14 },
      ],
    };
  };

  const objects: Placed[] = [
    gym.placed,
    arena.placed,
    market.placed,
    houseW1.placed,
    houseW2.placed,
    houseE1.placed,
    houseE2.placed,
    plaza(px, py),
    portal,
    // the north street: lamps on its south edge, the market's corner, a first-aid post
    prop('lamp-tall', 330, streetY - 52, 14),
    prop('lamp-tall', gateX - 120, streetY - 52, 14),
    prop('lamp-tall', gateX + 84, streetY - 52, 14),
    prop('lamp-tall', width - 366, streetY - 52, 14),
    prop('vending', market.placed.x + size('market').w + 6, top + 128, 18),
    prop('first-aid', gym.placed.x - 62, top + 128, 18),
    prop('board', 196, top + 150, 16),
    // the north corners
    tree('tree-pine', 10, 0),
    tree('tree-round', 110, 40),
    tree('tree-pine', width - 105, 0),
    tree('tree-round', width - 215, 40),
    // arches where the lanes leave the street
    arch(laneW.x - 18, streetY + 34),
    arch(laneE.x - 18, streetY + 34),
    // between the west lane and the plaza
    prop('bench-wood', 324, 430, 18),
    prop('flower-pot', 400, 520, 14),
    prop('well', 340, 600, 24),
    prop('bush', 380, 730, 20),
    prop('flowers', 320, 790, 20),
    prop('banner-blue', 330, 330, 14),
    prop('planter', 400, 330, 18),
    // between the plaza and the east lane
    prop('statue', px + plazaArt.w + 40, 410, 40),
    prop('umbrella', px + plazaArt.w + 40, 620, 20),
    prop('bench', px + plazaArt.w + 30, 720, 18),
    prop('trophy', px + plazaArt.w + 110, 560, 16),
    prop('banner-blue', width - 440, 330, 14),
    prop('flower-pot', px + plazaArt.w + 130, 790, 14),
    // the south-west garden
    prop('pond', 50, 900, 60),
    tree('tree-cherry', 240, 880),
    prop('flower-box', 60, 1020, 30),
    tree('tree-round', 380, 900),
    // the south-east garden
    prop('statue-knight', 1000, 880, 40),
    tree('tree-cherry', 1120, 870),
    tree('tree-pine', width - 110, 880),
    prop('flower-bed', 1150, 1010, 30),
    // around the portal
    prop('lamp', portalX - 70, portalY + 4, 16),
    prop('lamp', portalX + size('portal').w + 16, portalY + 4, 16),
    prop('signpost', portalX - 120, portalY + 46, 18),
    prop('flower-pot', portalX + size('portal').w + 80, portalY + 70, 14),
    prop('hedge', portalX - 210, height - 46, 40),
    prop('hedge', portalX + size('portal').w + 44, height - 46, 40),
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
      id: 'merchant',
      x: market.door.x + 76,
      y: market.door.y + 40,
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
      // the portal can be used from any side
      id: 'exit',
      kind: 'exit',
      x: portalX + Math.round(size('portal').w / 2),
      y: portalY + 60,
      radius: 120,
    },
    {
      id: 'gym',
      kind: 'gym',
      x: gym.door.x,
      y: gym.door.y,
      radius: 56,
      to: { room: 'gym', ...ROOM_ENTRY.gym },
    },
    {
      id: 'arena',
      kind: 'arena',
      x: arena.door.x,
      y: arena.door.y,
      radius: 56,
      to: { room: 'arena', ...ROOM_ENTRY.arena },
    },
    { id: 'market', kind: 'market', x: market.door.x, y: market.door.y, radius: 56 },
    { id: 'house-red', kind: 'house', x: houseW1.door.x, y: houseW1.door.y, radius: 50 },
    { id: 'house-purple', kind: 'house', x: houseW2.door.x, y: houseW2.door.y, radius: 50 },
    { id: 'house-blue', kind: 'house', x: houseE1.door.x, y: houseE1.door.y, radius: 50 },
    { id: 'house-red-2', kind: 'house', x: houseE2.door.x, y: houseE2.door.y, radius: 50 },
    ...npcs.map((n) => ({ id: `npc:${n.id}`, kind: 'npc' as const, x: n.x, y: n.y, radius: 60 })),
  ];

  PLAZA_DOORS.gym = { x: gym.door.x, y: gym.door.y + 22 };
  PLAZA_DOORS.arena = { x: arena.door.x, y: arena.door.y + 22 };
  // the server sends each visitor back to the house door they used; this is the fallback
  PLAZA_DOORS.house = { x: houseE1.door.x, y: houseE1.door.y + 22 };

  const path = (x: number, y: number, w: number, h: number) => ({
    ground: 'path' as const,
    rect: { x, y, w, h },
  });
  const stub = (door: { x: number; y: number }, toX: number) => {
    const x0 = Math.min(door.x - 36, toX);
    const x1 = Math.max(door.x + 36, toX);
    return path(x0, door.y - 10, x1 - x0, 62);
  };
  return {
    id: 'plaza',
    width,
    height,
    ground: 'grass',
    patches: [
      // the north street in front of the big buildings
      path(170, streetY, width - 340, 76),
      // a lane down each side, past the houses
      path(laneW.x, streetY, laneW.w, 640),
      path(laneE.x, streetY, laneE.w, 640),
      stub(houseW1.door, laneW.x + laneW.w),
      stub(houseW2.door, laneW.x + laneW.w),
      stub(houseE1.door, laneE.x),
      stub(houseE2.door, laneE.x),
      // from the plaza's west and east sides to the lanes
      path(laneW.x, py + 230, px - laneW.x + 20, 56),
      path(px + plazaArt.w - 20, py + 230, laneE.x - px - plazaArt.w + 20, 56),
      // up from the plaza's north gate to the street
      path(gateX - 44, streetY + 60, 88, py - streetY - 30),
      // down from the plaza to the portal
      path(exitX - 50, py + plazaArt.h - 24, 100, 96),
    ],
    objects,
    interactions,
    npcs,
    blocked: npcs.map((n) => ({ x: n.x - 12, y: n.y - 10, w: 24, h: 12 })),
    // just out of the portal, on the path up to the square
    spawn: { x: exitX, y: portalY - 14 },
    actorScale: 1.4,
  };
}

/** Where you stand on the square after leaving a building. */
const PLAZA_DOORS: Record<string, { x: number; y: number }> = {};

/** Interiors are drawn at twice the art's size, so people fit their furniture. */
const ROOM_SCALE = 2;
const r2 = (x: number, y: number, w: number, h: number): Rect => ({
  x: x * ROOM_SCALE,
  y: y * ROOM_SCALE,
  w: w * ROOM_SCALE,
  h: h * ROOM_SCALE,
});

/** Where you appear inside each building (feet, world px). */
const ROOM_ENTRY: Record<'gym' | 'arena' | 'house', { x: number; y: number }> = {
  gym: { x: 187 * ROOM_SCALE, y: 352 * ROOM_SCALE },
  arena: { x: 160 * ROOM_SCALE, y: 342 * ROOM_SCALE },
  house: { x: 155 * ROOM_SCALE, y: 300 * ROOM_SCALE },
};

/**
 * An interior: its art as the floor, walls and furniture as solid rects (in art pixels, measured
 * on the sheet), a door back to the square and the people who work there.
 */
function interior(o: {
  id: 'gym' | 'arena' | 'house';
  /** The room's id when it differs from its kind (each house is its own room). */
  roomId?: string;
  sprite: HubSprite;
  solid: Rect[];
  door: { x: number; y: number };
  npcs: Npc[];
}): HubMap {
  const { w, h } = size(o.sprite);
  const npcs = o.npcs.map((n) => ({ ...n, x: n.x * ROOM_SCALE, y: n.y * ROOM_SCALE }));
  return {
    id: o.roomId ?? o.id,
    width: w * ROOM_SCALE,
    height: h * ROOM_SCALE,
    ground: null,
    background: { sprite: o.sprite, scale: ROOM_SCALE },
    patches: [],
    objects: [],
    interactions: [
      {
        id: 'out',
        kind: 'door',
        x: o.door.x * ROOM_SCALE,
        y: o.door.y * ROOM_SCALE,
        radius: 70,
        to: { room: 'plaza', ...PLAZA_DOORS[o.id]! },
      },
      ...npcs.map((n) => ({ id: `npc:${n.id}`, kind: 'npc' as const, x: n.x, y: n.y, radius: 70 })),
    ],
    npcs,
    blocked: [
      ...o.solid.map((r) => r2(r.x, r.y, r.w, r.h)),
      ...npcs.map((n) => ({ x: n.x - 14, y: n.y - 12, w: 28, h: 14 })),
    ],
    spawn: ROOM_ENTRY[o.id],
    // the room's art is drawn at 2×; people too, so they fit the furniture
    actorScale: ROOM_SCALE,
  };
}

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

function gymRoom(): HubMap {
  return interior({
    id: 'gym',
    sprite: 'room-gym',
    solid: [
      R(0, 0, 372, 118), // back wall, screen and console
      R(0, 0, 22, 413), // left wall
      R(350, 0, 22, 413), // right wall
      R(0, 335, 150, 78), // front wall, left of the door
      R(224, 335, 148, 78), // front wall, right of the door
      R(35, 118, 30, 64), // red tank, left
      R(308, 118, 30, 64), // red tank, right
      R(82, 118, 30, 34), // green tank, left
      R(262, 118, 30, 34), // green tank, right
      R(24, 192, 50, 90), // bench and weights, left
      R(298, 200, 52, 80), // weights, right
      R(30, 300, 52, 40), // plant, left
      R(290, 300, 52, 40), // plant, right
    ],
    door: { x: 187, y: 392 },
    npcs: [
      {
        id: 'coach',
        x: 187,
        y: 178,
        facing: 'left',
        look: look({
          skin: 'skin_4',
          hair: 'hair_spiky',
          hairColor: 'hc_black',
          top: 'top_track',
          hat: 'hat_cap',
        }),
      },
    ],
  });
}

function arenaRoom(): HubMap {
  return interior({
    id: 'arena',
    sprite: 'room-arena',
    solid: [
      R(0, 0, 321, 100), // back wall and the big screen
      R(0, 0, 62, 393), // stands, left
      R(259, 0, 62, 393), // stands, right
      R(0, 325, 130, 68), // front wall, left of the door
      R(194, 325, 127, 68), // front wall, right of the door
      R(60, 100, 46, 44), // machine, left
      R(214, 100, 46, 44), // machine, right
      R(62, 285, 42, 40), // plant, left
      R(220, 285, 42, 40), // plant, right
    ],
    door: { x: 160, y: 380 },
    npcs: [
      {
        id: 'host',
        x: 160,
        y: 140,
        facing: 'right',
        look: look({
          skin: 'skin_2',
          hair: 'hair_long',
          hairColor: 'hc_violet',
          top: 'top_cosmic',
          hat: 'hat_crown',
          accessory: 'acc_cape',
        }),
      },
    ],
  });
}

/**
 * A player's house: the cottage interior from the owner's art, already furnished with its basics
 * (bed, desks, kitchen); what the player buys stands on the open floor. One room per owner.
 */
function houseRoom(roomId: string): HubMap {
  return interior({
    id: 'house',
    roomId,
    sprite: 'room-house',
    solid: [
      R(0, 0, 322, 70), // back wall and windows
      R(0, 0, 18, 394), // left wall
      R(300, 0, 22, 394), // right wall
      R(30, 60, 95, 62), // desk and chair, back left
      R(190, 70, 95, 55), // desk and shelves, back right
      R(30, 120, 62, 90), // bed
      R(220, 120, 80, 75), // cupboard and fridge
      R(30, 215, 48, 100), // desk, front left
      R(228, 225, 72, 90), // table, chairs and plant
      R(0, 318, 120, 76), // front wall, left of the door
      R(190, 318, 132, 76), // front wall, right of the door
    ],
    door: { x: 155, y: 372 },
    npcs: [],
  });
}

const HOUSE_PREFIX = 'house:';
/** The room id of a player's house. */
export const houseRoomId = (ownerId: string) => `${HOUSE_PREFIX}${ownerId}`;
/** The owner of a house room, or null for any other room. */
export const houseOwnerOf = (roomId: string) =>
  roomId.startsWith(HOUSE_PREFIX) ? roomId.slice(HOUSE_PREFIX.length) : null;

// the square first: the rooms' doors lead back to its building doors
const plazaMap = centralPlaza();
export const HUB_MAPS: Record<string, HubMap> = {
  plaza: plazaMap,
  gym: gymRoom(),
  arena: arenaRoom(),
};

/** Any room's map: the fixed ones, or a house (all houses share one layout). */
export function hubMap(roomId: string): HubMap | undefined {
  return HUB_MAPS[roomId] ?? (houseOwnerOf(roomId) ? houseRoom(roomId) : undefined);
}

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
