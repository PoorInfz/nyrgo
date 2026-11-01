import * as THREE from 'three';
import type { Body, Town } from '../hub/engine';
import { EMOTE_ICONS, roundRect, wrap } from '../hub/engine';
import { loadLibrary, type Library } from './assets';
import { Figure } from './explorer';
import { U, buildSquare, type Square } from './plaza';

/**
 * The square drawn in 3D. It only draws: the same Town as the 2D view moves the player, predicts
 * and corrects positions and knows who is where; this reads that state every frame. Names,
 * speech and emotes are drawn on a 2D canvas laid over the 3D one, so they stay crisp.
 */

/** Where the camera sits relative to the player (units), and what it looks at. */
const CAM = new THREE.Vector3(0, 14.5, 15.5);
const LOOK_UP = 1.3;
/** Height of a name over a figure's feet (units). */
const HEAD = 2.8;
/** At most this many players are drawn as figures (the nearest ones); fewer on weak devices. */
const MAX_FIGURES = 30;
const MAX_FIGURES_LOW = 16;

export type Phase = 'day' | 'dusk' | 'night';

const PALETTE: Record<
  Phase,
  { sky: string; hemi: [string, string, number]; sun: [string, number]; fog: [number, number] }
> = {
  day: { sky: '#9fd8ff', hemi: ['#e8f6ff', '#5f8a4a', 1.5], sun: ['#fff1d6', 2.3], fog: [60, 150] },
  dusk: {
    sky: '#f7a87c',
    hemi: ['#ffd9c2', '#4a4a6a', 1.2],
    sun: ['#ffb27a', 1.7],
    fog: [50, 140],
  },
  night: {
    sky: '#1b2350',
    hemi: ['#8fa3ff', '#20263f', 0.75],
    sun: ['#a9b8ff', 0.7],
    fog: [45, 130],
  },
};

export function dayPhase(d = new Date()): Phase {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 7.5 && h < 19) return 'day';
  if ((h >= 19 && h < 21) || (h >= 6 && h < 7.5)) return 'dusk';
  return 'night';
}

interface Actor {
  fig: Figure;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  emoteUntil: number;
  pet: THREE.Sprite | null;
  petId: string | null;
}

const petTextures = new Map<string, THREE.Texture>();

export class TownView3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.5, 260);
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private square: Square;
  private actors = new Map<string, Actor>();
  private npcs: Figure[] = [];
  private focus = new THREE.Vector3();
  private last = 0;
  private start = performance.now();
  private size = { w: 1, h: 1 };
  private slowFrames = 0;
  private frames = 0;
  /** Low quality: no shadows, fewer pixels (chosen on weak devices, or after slow frames). */
  low: boolean;
  private halos: THREE.Sprite[] = [];

  static async create(canvas: HTMLCanvasElement, town: Town, phase?: Phase): Promise<TownView3D> {
    const lib = await loadLibrary();
    return new TownView3D(canvas, town, lib, phase ?? dayPhase());
  }

  private constructor(
    canvas: HTMLCanvasElement,
    private town: Town,
    private lib: Library,
    phase: Phase,
  ) {
    const nav = navigator as Navigator & { deviceMemory?: number };
    this.low = (nav.deviceMemory ?? 8) <= 3 || (navigator.hardwareConcurrency ?? 8) <= 4;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.low,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = !this.low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const p = PALETTE[phase];
    this.scene.background = new THREE.Color(p.sky);
    this.scene.fog = new THREE.Fog(p.sky, p.fog[0], p.fog[1]);
    this.hemi = new THREE.HemisphereLight(p.hemi[0], p.hemi[1], p.hemi[2]);
    this.sun = new THREE.DirectionalLight(p.sun[0], p.sun[1]);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -16;
    sc.right = sc.top = 16;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.square = buildSquare(lib, town.map);
    this.scene.add(this.square.group);

    // lamps glow in the evening
    if (phase !== 'day') {
      const tex = glowTexture();
      for (const l of this.square.lamps) {
        const s = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: tex,
            color: '#ffd27a',
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        s.position.copy(l).setY(4.1);
        s.scale.setScalar(phase === 'night' ? 3.2 : 2);
        this.scene.add(s);
        this.halos.push(s);
      }
    }

    for (const n of town.map.npcs) {
      const f = new Figure(lib, n.look);
      f.root.position.set(U(n.x), 0, U(n.y));
      f.root.rotation.y = n.facing === 'left' ? -0.7 : 0.7;
      this.scene.add(f.root);
      this.npcs.push(f);
    }
    const me = town.me();
    if (me) this.focus.set(U(me.x), 0, U(me.y));
  }

  resize(w: number, h: number, dpr: number) {
    this.size = { w, h };
    this.renderer.setPixelRatio(Math.min(dpr, this.low ? 1 : 1.75));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    // a tall phone screen sees less across: step back a little
    this.camera.fov = w < h ? 46 : 34;
    this.camera.updateProjectionMatrix();
  }

  private setLow() {
    if (this.low) return;
    this.low = true;
    this.renderer.shadowMap.enabled = false;
    this.sun.castShadow = false;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize(this.size.w, this.size.h, window.devicePixelRatio || 1);
  }

  private sync(now: number, dt: number) {
    const town = this.town;
    const me = town.me();
    // the nearest players get figures; the rest are too far to matter
    const bodies = [...town.bodies.values()];
    const max = this.low ? MAX_FIGURES_LOW : MAX_FIGURES;
    if (me && bodies.length > max)
      bodies.sort(
        (a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y),
      );
    const shown = new Set(bodies.slice(0, max).map((b) => b.id));
    for (const [id, a] of this.actors)
      if (!shown.has(id)) {
        a.fig.dispose();
        a.pet?.removeFromParent();
        this.actors.delete(id);
      }
    for (const b of bodies) {
      if (!shown.has(b.id)) continue;
      let a = this.actors.get(b.id);
      if (!a) {
        const fig = new Figure(this.lib, b.look);
        this.scene.add(fig.root);
        a = { fig, x: U(b.x), z: U(b.y), yaw: 0, speed: 0, emoteUntil: 0, pet: null, petId: null };
        this.actors.set(b.id, a);
      }
      this.place(a, b, now, dt);
    }
  }

  private place(a: Actor, b: Body, now: number, dt: number) {
    a.fig.setLook(b.look);
    const x = U(b.x);
    const z = U(b.y);
    const dx = x - a.x;
    const dz = z - a.z;
    const dist = Math.hypot(dx, dz);
    const v = dt > 0 ? dist / dt : 0;
    a.speed += (v - a.speed) * Math.min(1, dt * 12);
    if (dist > 0.002) {
      const target = Math.atan2(dx, dz);
      let d = target - a.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      a.yaw += d * Math.min(1, dt * 12);
    }
    a.x = x;
    a.z = z;
    a.fig.root.position.set(x, 0, z);
    a.fig.root.rotation.y = a.yaw;
    if (b.emote && b.emote.until !== a.emoteUntil) {
      a.emoteUntil = b.emote.until;
      a.fig.emote(b.emote.e, now);
    }
    a.fig.update(dt, now, b.moving || a.speed > 0.8 ? a.speed : 0);

    // the creature that follows, a picture standing in the world
    if (b.companion !== a.petId) {
      a.pet?.removeFromParent();
      a.pet = b.companion ? petSprite(b.companion) : null;
      a.petId = b.companion;
      if (a.pet) this.scene.add(a.pet);
    }
    const trail = b.trail[0];
    if (a.pet && trail) {
      const tx = U(trail.x) - Math.sin(a.yaw) * 0.6 + Math.cos(a.yaw) * 0.9;
      const tz = U(trail.y) - Math.cos(a.yaw) * 0.6 - Math.sin(a.yaw) * 0.9;
      a.pet.position.x += (tx - a.pet.position.x) * Math.min(1, dt * 6);
      a.pet.position.z += (tz - a.pet.position.z) * Math.min(1, dt * 6);
      a.pet.position.y = 0.05 + Math.abs(Math.sin(now / 220)) * (a.speed > 0.5 ? 0.15 : 0.04);
      const map = (a.pet.material as THREE.SpriteMaterial).map;
      if (map) map.offset.x = (Math.floor(now / 160) % 6) / 6;
      a.pet.scale.x = Math.abs(a.pet.scale.x) * (Math.sin(a.yaw) < 0 ? -1 : 1);
    }
  }

  /** Draws the frame (the Town has already moved everyone). */
  render(now: number) {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    // after a few seconds, a device that cannot keep up drops shadows and resolution
    if (this.last && !this.low) {
      this.frames++;
      if (now - this.last > 45) this.slowFrames++;
      if (this.frames === 180 && this.slowFrames > 90) this.setLow();
    }
    this.last = now;
    const t = (now - this.start) / 1000;
    this.sync(now, dt);
    for (const n of this.npcs) n.update(dt, now, 0);
    this.square.tick(t);

    const me = this.town.me();
    if (me) {
      const target = new THREE.Vector3(U(me.x), 0, U(me.y));
      if (this.focus.lengthSq() === 0) this.focus.copy(target);
      this.focus.lerp(target, Math.min(1, dt * 6));
    }
    // wide screens see more of the square from a little further back
    this.camera.position.copy(this.focus).addScaledVector(CAM, this.size.w > this.size.h ? 1.3 : 1);
    this.camera.lookAt(this.focus.x, LOOK_UP, this.focus.z);
    this.sun.position.copy(this.focus).add(new THREE.Vector3(9, 18, 7));
    this.sun.target.position.copy(this.focus);
    this.renderer.render(this.scene, this.camera);
  }

  /** Names, speech and emotes over the figures, on the 2D canvas laid over the 3D one. */
  drawOverlay(ctx: CanvasRenderingContext2D, dpr: number, meId: string | null) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = new THREE.Vector3();
    const toScreen = (x: number, y: number, z: number) => {
      v.set(x, y, z).project(this.camera);
      return {
        x: (v.x * 0.5 + 0.5) * this.size.w,
        y: (-v.y * 0.5 + 0.5) * this.size.h,
        behind: v.z > 1,
      };
    };
    for (const n of this.town.map.npcs) {
      const p = toScreen(U(n.x), HEAD + 0.2, U(n.y));
      if (!p.behind) tag(ctx, p.x, p.y, '★', '#ffcf4d');
    }
    const time = performance.now();
    for (const b of this.town.bodies.values()) {
      const a = this.actors.get(b.id);
      if (!a) continue;
      const p = toScreen(a.x, HEAD, a.z);
      if (p.behind || p.x < -80 || p.x > this.size.w + 80 || p.y < -80 || p.y > this.size.h + 40)
        continue;
      tag(ctx, p.x, p.y, b.name, b.id === meId ? '#43f289' : '#eef3ff');
      if (b.emote)
        emoteBubble(ctx, p.x, p.y - 34, EMOTE_ICONS[b.emote.e] ?? '•', b.emote.until - time);
      else if (b.bubble) speech(ctx, p.x, p.y - 16, b.bubble.text);
    }
  }

  dispose() {
    for (const a of this.actors.values()) a.fig.dispose();
    this.actors.clear();
    this.renderer.dispose();
  }
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,220,150,0.6)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function petSprite(id: string): THREE.Sprite {
  let base = petTextures.get(id);
  if (!base) {
    base = new THREE.TextureLoader().load(`/sprites/${id}-idle.webp`);
    base.colorSpace = THREE.SRGBColorSpace;
    petTextures.set(id, base);
  }
  // one texture per species: every creature of a kind shows the same frame, which is fine
  base.repeat.set(1 / 6, 1);
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: base, transparent: true, alphaTest: 0.3 }),
  );
  s.center.set(0.5, 0.1);
  s.scale.set(1.7, 1.7, 1);
  return s;
}

function tag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = 'rgba(7, 11, 31, 0.72)';
  roundRect(ctx, x - w / 2, y - 11, w, 16, 8);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 1);
}

function speech(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.font = '500 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const lines = wrap(ctx, text, 170);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
  const h = lines.length * 15 + 10;
  const top = y - h - 6;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x - w / 2, top, w, h, 9);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 6, top + h);
  ctx.lineTo(x, top + h + 7);
  ctx.lineTo(x + 6, top + h);
  ctx.fill();
  ctx.fillStyle = '#0b1024';
  lines.forEach((l, i) => ctx.fillText(l, x, top + 16 + i * 15));
}

function emoteBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  icon: string,
  left: number,
) {
  const age = Math.max(0, 2500 - left);
  const k = age < 200 ? 0.6 + 0.6 * Math.sin((age / 200) * (Math.PI / 2)) : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '19px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(icon, 0, 7);
  ctx.restore();
}
