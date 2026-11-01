import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COSMETICS,
  DEFAULT_AVATAR,
  FURNITURE,
  HOLDER_OUTFITS,
  HUB_MAPS,
  hubMap,
  type AvatarLook,
} from '@nyrgo/shared';
import { Town, newBody } from '../src/hub/engine';
import { EMOTE_CLIP } from '../src/town3d/explorer';
import { cellColors, recipeFor, type Recipe } from '../src/town3d/looks';
import { EMOTE_ICONS } from '../src/hub/engine';

/** The JSON part of a .glb (its node and animation names). */
function glb(name: string) {
  const b = readFileSync(path.join(process.cwd(), 'public/town3d', name));
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8')) as {
    nodes: { name?: string; mesh?: number }[];
    animations?: { name: string }[];
    scenes: { nodes: number[] }[];
  };
}

const explorer = glb('explorer.glb');
const meshNames = new Set(explorer.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name));
const clips = new Set((explorer.animations ?? []).map((a) => a.name));
const town = glb('town.glb');
const townIds = new Set(town.scenes[0]!.nodes.map((i) => town.nodes[i]!.name));
const inside = glb('interior.glb');
const interiorIds = new Set(inside.scenes[0]!.nodes.map((i) => inside.nodes[i]!.name));

/** Every part a recipe asks the model file for. */
function partsOf(r: Recipe): string[] {
  const parts = [
    r.head === 'Rogue_Hooded' ? 'Rogue_Head_Hooded' : `${r.head}_Head`,
    `${r.body}_Body`,
    `${r.body}_ArmLeft`,
    `${r.body}_ArmRight`,
    `${r.legs}_LegLeft`,
    `${r.legs}_LegRight`,
  ];
  if (r.hair) parts.push(`${r.hair}_Head`);
  if (r.hat && /^(Knight|Mage|Barbarian)_/.test(r.hat)) parts.push(r.hat);
  if (r.cape) parts.push(`${r.body}_Cape`);
  return parts;
}

const bySlot = (slot: string) => COSMETICS.filter((c) => c.slot === slot).map((c) => c.id);

describe('the 3D town', () => {
  it('builds every wardrobe look from parts the model file has', () => {
    const looks: AvatarLook[] = [];
    for (const hair of bySlot('hair'))
      for (const top of bySlot('top'))
        for (const hat of bySlot('hat'))
          for (const accessory of bySlot('accessory'))
            looks.push({ ...DEFAULT_AVATAR, hair, top, hat, accessory });
    for (const look of looks) {
      const r = recipeFor(look);
      for (const p of partsOf(r))
        expect(meshNames, `${p} for ${JSON.stringify(look)}`).toContain(p);
      for (const c of Object.values(r.colors)) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('dresses every holder outfit, with the player own skin tone', () => {
    for (const o of HOLDER_OUTFITS) {
      const r = recipeFor({ ...DEFAULT_AVATAR, skin: 'skin_5', outfit: o.id });
      for (const p of partsOf(r)) expect(meshNames, `${p} for ${o.id}`).toContain(p);
      expect(r.colors.skin).toBe('#6e4630');
    }
    // the knight wears the knight's armour and helmet; the wizard the pointed hat
    expect(recipeFor({ ...DEFAULT_AVATAR, outfit: 'skin_knight' })).toMatchObject({
      body: 'Knight',
      hat: 'Knight_Helmet',
    });
    expect(recipeFor({ ...DEFAULT_AVATAR, outfit: 'skin_wizard' }).hat).toBe('Mage_Hat');
    expect(recipeFor({ ...DEFAULT_AVATAR, outfit: 'skin_ranger' }).head).toBe('Rogue_Hooded');
  });

  it('follows the wardrobe: skin, hair colour, top colour and accessories', () => {
    const r = recipeFor({
      ...DEFAULT_AVATAR,
      skin: 'skin_4',
      hairColor: 'hc_mint',
      top: 'top_tee_sun',
      accessory: 'acc_glasses',
      hat: 'hat_crown',
    });
    expect(r.colors).toMatchObject({ skin: '#a8714d', hair: '#43f289', top: '#ffcf4d' });
    expect(r.hat).toBe('crown');
    expect(r.extras.glasses).toBeDefined();
    // skin and hair are the same texture cells on every pack character
    for (const char of ['Knight', 'Mage', 'Rogue', 'Barbarian'] as const) {
      const cells = cellColors(char, r);
      expect(cells).toContainEqual([0, 0, '#a8714d']);
      expect(cells).toContainEqual([0, 1, '#43f289']);
      for (const [row, col] of cells) {
        expect(row).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThan(4);
        expect(col).toBeGreaterThanOrEqual(0);
        expect(col).toBeLessThan(8);
      }
    }
  });

  it('has the animations the town plays, and one for every emote', () => {
    for (const c of ['Idle', 'Walking_A', 'Running_A']) expect(clips).toContain(c);
    for (const e of Object.keys(EMOTE_ICONS)) {
      const clip = EMOTE_CLIP[e as keyof typeof EMOTE_CLIP];
      expect(clip, e).toBeDefined();
      expect(clips).toContain(clip);
    }
  });

  it('has every town model the square is built from', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/town3d/plaza.ts'), 'utf8');
    const used = new Set<string>();
    for (const m of src.matchAll(/model\(\s*lib,\s*'([^']+)'/g)) used.add(m[1]!);
    for (const m of src.matchAll(
      /\[\s*'([a-z-]+)',\s*[-\w./ +]+,\s*[-\w./ +]+,\s*\d+(?:\.\d+)?,\s*-?[\d.]+\s*\]/g,
    ))
      used.add(m[1]!);
    for (const id of ['gym', 'arena', 'market', 'house-red', 'house-blue', 'house-purple'])
      used.add(id);
    expect(used.size).toBeGreaterThan(20);
    for (const id of used) expect(townIds, id).toContain(id);
  });

  it('has a 3D piece for every piece of furniture, and every model the rooms use', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/town3d/rooms.ts'), 'utf8');
    for (const f of FURNITURE) expect(src, f.id).toContain(`case '${f.id}':`);
    const used = new Set<string>();
    for (const m of src.matchAll(/(?:interior\.get|k|put)\(\s*'([a-zA-Z_]+)'/g)) used.add(m[1]!);
    expect(used.size).toBeGreaterThan(20);
    for (const id of used) expect(interiorIds, id).toContain(id);
  });

  it('builds the gym, arena and house shells from their maps', () => {
    // the rooms read their walls and door by position in the map's solid areas
    for (const id of ['gym', 'arena', 'house:x']) {
      const m = hubMap(id)!;
      expect(m.blocked.length).toBeGreaterThanOrEqual(9);
      expect(m.interactions.some((i) => i.kind === 'door')).toBe(true);
    }
    expect(HUB_MAPS.gym!.blocked[0]!.y).toBe(0);
  });

  it('walks away from the camera, however the camera is turned', () => {
    const town = new Town(HUB_MAPS.plaza!);
    town.meId = 'me';
    town.bodies.set(
      'me',
      newBody({
        id: 'me',
        name: 'me',
        level: 1,
        look: DEFAULT_AVATAR,
        companion: null,
        x: 900,
        y: 290,
      }),
    );
    // the camera turned a quarter to the east: "up" walks west
    town.inputYaw = Math.PI / 2;
    town.input = { x: 0, y: -1 };
    town.update(0.25, 0);
    const me = town.me()!;
    expect(me.x).toBeLessThan(900 - 20);
    expect(Math.abs(me.y - 290)).toBeLessThan(1);
  });

  it('gives every hair style its own shape', () => {
    const shapes = new Set(
      bySlot('hair').map((hair) => {
        const r = recipeFor({ ...DEFAULT_AVATAR, hair });
        const x = r.extras;
        return JSON.stringify([
          r.head,
          r.hair,
          x.bun,
          x.spikes,
          x.curls,
          x.long,
          x.tail,
          x.stubble,
        ]);
      }),
    );
    expect(shapes.size).toBe(bySlot('hair').length);
  });
});
