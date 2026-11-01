import * as THREE from 'three';
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AvatarLook } from '@nyrgo/shared';
import type { Figures as Library } from './assets';
import { cellColors, recipeFor, type Char, type Recipe } from './looks';
import { extras, proceduralHat } from './props';

/**
 * A player's figure in the 3D town: the pack's body parts chosen by the look, recoloured, on one
 * rig, playing the town's animations (idle, walk, run, emotes).
 */

export type Emote = 'wave' | 'heart' | 'laugh' | 'cheer' | 'question' | 'sad';

/** The clip each emote plays. */
export const EMOTE_CLIP: Record<Emote, string> = {
  wave: 'Interact',
  heart: 'Spellcast_Raise',
  laugh: 'Cheer',
  cheer: 'Jump_Full_Short',
  question: 'PickUp',
  sad: 'Hit_B',
};

/** The recoloured textures' size: the pack's gradients need no more (64 kB each on the GPU). */
const TEX = 128;
const bases = new Map<string, ImageData>();
const materials = new Map<string, THREE.MeshLambertMaterial>();

/** A pack character's texture, as pixels at 256 px (its gradients need no more). */
function basePixels(lib: Library, char: Char): ImageData | null {
  let data = bases.get(char);
  if (data) return data;
  const img = lib.textures.get(char);
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img as CanvasImageSource, 0, 0, TEX, TEX);
  data = ctx.getImageData(0, 0, TEX, TEX);
  bases.set(char, data);
  return data;
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * The character's texture with some cells repainted: each pixel takes the new colour scaled by
 * how light it was against its cell's average, so the pack's shading gradients stay.
 */
function recoloured(lib: Library, char: Char, cells: [number, number, string][]) {
  const key = `${char}|${cells.map((c) => c.join(',')).join(';')}`;
  let m = materials.get(key);
  if (m) return m;
  const base = basePixels(lib, char);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX;
  const ctx = canvas.getContext('2d')!;
  if (base) {
    const out = new ImageData(new Uint8ClampedArray(base.data), TEX, TEX);
    const cw = TEX / 8;
    const ch = TEX / 4;
    const col = new THREE.Color();
    for (const [row, column, hex] of cells) {
      col.set(hex);
      // HSL of the colour as written (sRGB), like the texture's pixels
      const hsl = col.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
      const rgb = { r: 0, g: 0, b: 0 };
      const px = new THREE.Color();
      const x0 = column * cw;
      const y0 = row * ch;
      let sum = 0;
      for (let y = y0; y < y0 + ch; y++)
        for (let x = x0; x < x0 + cw; x++) {
          const i = (y * TEX + x) * 4;
          sum += lum(base.data[i]!, base.data[i + 1]!, base.data[i + 2]!);
        }
      const ref = Math.max(1, sum / (cw * ch));
      for (let y = y0; y < y0 + ch; y++)
        for (let x = x0; x < x0 + cw; x++) {
          const i = (y * TEX + x) * 4;
          // the pack's shading as a gentle shift in lightness: the colour's hue stays true
          // (scaling RGB would push light colours to saturated ones: blond to orange)
          const k = lum(base.data[i]!, base.data[i + 1]!, base.data[i + 2]!) / ref;
          const l = Math.min(
            0.97,
            Math.max(0.03, hsl.l + Math.max(-0.08, Math.min(0.08, (k - 1) * 0.2))),
          );
          px.setHSL(hsl.h, hsl.s, l, THREE.SRGBColorSpace).getRGB(rgb, THREE.SRGBColorSpace);
          out.data[i] = rgb.r * 255;
          out.data[i + 1] = rgb.g * 255;
          out.data[i + 2] = rgb.b * 255;
        }
    }
    ctx.putImageData(out, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshLambertMaterial({ map: tex });
  materials.set(key, m);
  return m;
}

const charOf = (part: string) => part.split('_')[0] as Char;

export interface HeadPieces {
  /** The face (an open shell for most heads: their hair is the top of the skull). */
  face: THREE.BufferGeometry;
  /** The hair (and the barbarian's beard). */
  hair: THREE.BufferGeometry;
  /** Only its biggest piece (without the mage's little knot at the nape, say). */
  hairMain: THREE.BufferGeometry;
  /** The eyebrows: painted from the hair cell too, but they belong with the face. */
  brows: THREE.BufferGeometry;
  /** The top and back of the skull (only whole on the barbarian's bald head). */
  skull: THREE.BufferGeometry;
  /** The face without that skull. */
  rest: THREE.BufferGeometry;
}

const pieces = new Map<string, HeadPieces>();
/**
 * A pack head cut apart by its texture: the triangles painted from the hair cell (row 0,
 * column 1 of the 8×4 grid) are hair, except small pieces in front (the eyebrows); the rest is
 * the face. The heads share one shape, so a face can wear another pack's hair.
 */
export function headPieces(lib: Library, name: string): HeadPieces | null {
  let p = pieces.get(name);
  if (p) return p;
  const src = lib.parts.get(name);
  if (!src) return null;
  const g = src.geometry;
  const uv = g.getAttribute('uv');
  const pos = g.getAttribute('position');
  const index = g.getIndex();
  if (!uv || !index || !pos) return null;
  const isHair = (v: number) => {
    const u = uv.getX(v);
    const w = uv.getY(v);
    return u >= 1 / 8 && u < 2 / 8 && w < 1 / 4;
  };
  const face: number[] = [];
  const hairTris: number[][] = [];
  for (let i = 0; i < index.count; i += 3) {
    const t = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (t.filter(isHair).length >= 2) hairTris.push(t);
    else face.push(...t);
  }
  // hair triangles in connected pieces (by shared corners, also across split vertices)
  const keyOf = (v: number) =>
    `${pos.getX(v).toFixed(3)},${pos.getY(v).toFixed(3)},${pos.getZ(v).toFixed(3)}`;
  const parent = hairTris.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const owner = new Map<string, number>();
  hairTris.forEach((t, i) => {
    for (const v of t) {
      const k = keyOf(v);
      const o = owner.get(k);
      if (o === undefined) owner.set(k, i);
      else parent[find(i)] = find(o);
    }
  });
  const groups = new Map<number, number[][]>();
  hairTris.forEach((t, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), t]);
  });
  const hair: number[] = [];
  const brows: number[] = [];
  let main: number[][] = [];
  const box = new THREE.Box3();
  const v3 = new THREE.Vector3();
  for (const tris of groups.values()) {
    box.makeEmpty();
    for (const t of tris) for (const v of t) box.expandByPoint(v3.fromBufferAttribute(pos, v));
    const size = box.getSize(new THREE.Vector3());
    // (the pack's positions are quantised to -1…1 across the head)
    const small = size.x < 0.6 && size.y < 0.35 && box.min.z > 0.3 && box.max.y < 0.4;
    (small ? brows : hair).push(...tris.flat());
    if (!small && tris.length > main.length) main = tris;
  }
  // the skull: the face's triangles above the ears or behind them (whole only when bald)
  const skull: number[] = [];
  const rest: number[] = [];
  for (let i = 0; i < face.length; i += 3) {
    let y = 0;
    let z = 0;
    for (let k = 0; k < 3; k++) {
      y += pos.getY(face[i + k]!) / 3;
      z += pos.getZ(face[i + k]!) / 3;
    }
    (y > 0.2 || z < -0.15 ? skull : rest).push(face[i]!, face[i + 1]!, face[i + 2]!);
  }
  const part = (ids: number[]) => {
    const out = g.clone();
    out.setIndex(ids);
    return out;
  };
  p = {
    face: part(face),
    hair: part(hair),
    hairMain: part(main.flat()),
    brows: part(brows),
    skull: part(skull),
    rest: part(rest),
  };
  pieces.set(name, p);
  return p;
}

/** The loader makes names unique across the file's scenes (head, head_1, …): the bone's own name. */
const boneName = (name: string) => name.replace(/_\d+$/, '');

export class Figure {
  readonly root = new THREE.Group();
  private rig: THREE.Object3D;
  private bones = new Map<string, THREE.Object3D>();
  private parts: THREE.Object3D[] = [];
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private lookKey = '';
  /** The emote being played, until it ends. */
  private emoting: { clip: string; until: number } | null = null;

  constructor(
    private lib: Library,
    look: AvatarLook,
  ) {
    this.rig = cloneRig(lib.rig);
    // the rig came with the knight's own meshes: the figure brings its own parts
    const drop: THREE.Object3D[] = [];
    this.rig.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) drop.push(o);
      else this.bones.set(o.name, o);
    });
    for (const o of drop) o.removeFromParent();
    this.root.add(this.rig);
    this.mixer = new THREE.AnimationMixer(this.rig);
    for (const [name, clip] of lib.clips) this.actions.set(name, this.mixer.clipAction(clip));
    this.setLook(look);
    this.play('Idle');
  }

  setLook(look: AvatarLook) {
    const key = JSON.stringify(look);
    if (key === this.lookKey) return;
    this.lookKey = key;
    for (const p of this.parts) p.removeFromParent();
    this.parts = [];
    this.build(recipeFor(look));
  }

  private build(r: Recipe) {
    const skinned = [
      `${r.body}_Body`,
      `${r.body}_ArmLeft`,
      `${r.body}_ArmRight`,
      `${r.legs}_LegLeft`,
      `${r.legs}_LegRight`,
    ];
    const rigid: string[] = [];
    if (r.hat === 'Knight_Helmet' || r.hat === 'Mage_Hat' || r.hat === 'Barbarian_Hat')
      rigid.push(r.hat);
    if (r.cape) rigid.push(`${r.body}_Cape`);

    const mat = (part: string) => recoloured(this.lib, charOf(part), cellColors(charOf(part), r));
    /** A skinned piece: `geometry` (or the part's own) on this figure's bones. */
    const skin = (name: string, material: THREE.Material, geometry?: THREE.BufferGeometry) => {
      const src = this.lib.parts.get(name) as THREE.SkinnedMesh | undefined;
      if (!src?.isSkinnedMesh) return;
      const m = new THREE.SkinnedMesh(geometry ?? src.geometry, material);
      const bones = src.skeleton.bones.map(
        (b) => (this.bones.get(boneName(b.name)) as THREE.Bone | undefined) ?? b,
      );
      m.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), src.bindMatrix);
      m.castShadow = true;
      m.frustumCulled = false;
      this.rig.add(m);
      this.parts.push(m);
    };
    for (const name of skinned) skin(name, mat(name));

    // the head: a face, its eyebrows, and the chosen hair (or the whole hooded head)
    if (r.head === 'Rogue_Hooded') skin('Rogue_Head_Hooded', mat('Rogue_Head_Hooded'));
    else {
      const faceName = `${r.head}_Head`;
      const face = headPieces(this.lib, faceName);
      if (face) {
        skin(faceName, mat(faceName), face.face);
        skin(faceName, mat(faceName), face.brows);
        // the barbarian's beard is his "hair": shown only on a bearded look
        if (r.head === 'Barbarian' && r.extras.beard) {
          const beard = recoloured(this.lib, 'Barbarian', [[0, 1, r.extras.beard]]);
          skin(faceName, beard, face.hair);
        }
      }
      if (r.hair) {
        const hairName = `${r.hair}_Head`;
        const hair = headPieces(this.lib, hairName);
        if (hair && r.extras.stubble) {
          // a shaved head: the hair is a short shade of its colour over the skin
          const scalp = new THREE.Color(r.colors.skin).lerp(new THREE.Color(r.colors.hair), 0.6);
          const cells = cellColors(charOf(hairName), r).map(([row, col, c]) =>
            row === 0 && col === 1
              ? ([row, col, `#${scalp.getHexString()}`] as const)
              : [row, col, c],
          ) as [number, number, string][];
          skin(hairName, recoloured(this.lib, charOf(hairName), cells), hair.hairMain);
        } else if (hair) skin(hairName, mat(hairName), r.extras.bun ? hair.hairMain : hair.hair);
      }
    }
    for (const name of rigid) {
      const src = this.lib.parts.get(name);
      const bone = src?.parent ? this.bones.get(boneName(src.parent.name)) : undefined;
      if (!src || !bone) continue;
      const m = new THREE.Mesh(src.geometry, mat(name));
      m.position.copy(src.position);
      m.quaternion.copy(src.quaternion);
      m.scale.copy(src.scale);
      m.castShadow = true;
      bone.add(m);
      this.parts.push(m);
    }
    const head = this.bones.get('head');
    const chest = this.bones.get('chest');
    if (head && r.hat) {
      const hat = proceduralHat(r.hat, r.colors.hat, r.colors.hatTrim);
      if (hat) {
        head.add(hat);
        this.parts.push(hat);
      }
    }
    const x = extras(r);
    for (const o of x.head) head?.add(o);
    for (const o of x.chest) chest?.add(o);
    this.parts.push(...x.head, ...x.chest);
  }

  private play(name: string, fade = 0.2, once = false) {
    const next = this.actions.get(name);
    if (!next) return;
    if (next === this.current) {
      // the same emote again starts over; a looping clip just carries on
      if (once) next.reset().play();
      return;
    }
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    next.play();
    this.current = next;
  }

  /** Starts an emote's animation (it ends by itself). */
  emote(e: string, now: number) {
    const clip = EMOTE_CLIP[e as Emote];
    const action = clip ? this.actions.get(clip) : undefined;
    if (!clip || !action) return;
    this.play(clip, 0.15, true);
    this.emoting = { clip, until: now + action.getClip().duration * 1000 - 150 };
  }

  /** Holds the idle pose at `t` seconds (for still pictures). */
  pose(t: number) {
    this.emoting = null;
    this.play('Idle', 0);
    this.mixer.setTime(t);
  }

  /** Moves the animation on; `speed` is how fast the figure walks, in units per second. */
  update(dt: number, now: number, speed: number) {
    if (this.emoting && (speed > 0.3 || now > this.emoting.until)) this.emoting = null;
    if (!this.emoting) {
      if (speed > 0.3) {
        this.play(speed > 2.6 ? 'Running_A' : 'Walking_A');
        // keep the feet on the ground: the clip's pace follows the real speed
        if (this.current) this.current.timeScale = speed > 2.6 ? speed / 4.2 : speed / 1.9;
      } else this.play('Idle', 0.25);
    }
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
  }
}
