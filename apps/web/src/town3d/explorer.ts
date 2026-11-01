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
      const tr = col.r * 255;
      const tg = col.g * 255;
      const tb = col.b * 255;
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
          const k = lum(base.data[i]!, base.data[i + 1]!, base.data[i + 2]!) / ref;
          out.data[i] = tr * k;
          out.data[i + 1] = tg * k;
          out.data[i + 2] = tb * k;
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
      r.head === 'Rogue_Hooded' ? 'Rogue_Head_Hooded' : `${r.head}_Head`,
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
    for (const name of skinned) {
      const src = this.lib.parts.get(name) as THREE.SkinnedMesh | undefined;
      if (!src?.isSkinnedMesh) continue;
      const m = new THREE.SkinnedMesh(src.geometry, mat(name));
      const bones = src.skeleton.bones.map(
        (b) => (this.bones.get(boneName(b.name)) as THREE.Bone | undefined) ?? b,
      );
      m.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), src.bindMatrix);
      m.castShadow = true;
      m.frustumCulled = false;
      this.rig.add(m);
      this.parts.push(m);
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
