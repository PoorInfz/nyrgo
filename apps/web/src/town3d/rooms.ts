import * as THREE from 'three';
import { FURNITURE_BY_ID, type HubMap, type Rect } from '@nyrgo/shared';
import type { Library } from './assets';
import { at, batch, board, fit, flowers, portal, speckle, U } from './plaza';
import { flat } from './props';

/**
 * The buildings' insides in 3D (gym, arena, a house), laid out from the same interior maps the
 * server checks: the walls stand on the map's wall areas, the fixed furniture on its solid areas,
 * the door where the map's door is. The front wall is kept low so the camera sees in.
 * A house also shows its owner's furniture where they placed it.
 */

export type RoomKind = 'gym' | 'arena' | 'house';

export interface Stage {
  group: THREE.Group;
  tick: (t: number) => void;
  lamps: THREE.Vector3[];
  colliders: THREE.Box3[];
  /** Indoors: lit and coloured differently from the square. */
  indoor: boolean;
}

/** Which of a room's solid areas are its walls (indexes into the map's `blocked`). */
const SHELL: Record<
  RoomKind,
  { back: number; left: number; right: number; front: [number, number] }
> = {
  gym: { back: 0, left: 1, right: 2, front: [3, 4] },
  arena: { back: 0, left: 1, right: 2, front: [3, 4] },
  house: { back: 0, left: 1, right: 2, front: [9, 10] },
};

const WALL_H = 4.6;
const cx = (r: Rect) => r.x + r.w / 2;
const cy = (r: Rect) => r.y + r.h / 2;

export function roomKind(map: HubMap): RoomKind | null {
  if (map.id === 'gym' || map.id === 'arena') return map.id;
  if (map.id.startsWith('house:')) return 'house';
  return null;
}

function box(w: number, h: number, d: number, color: string, emissive?: string) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color, emissive));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt: number, rb: number, h: number, color: string, emissive?: string, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), flat(color, emissive));
  m.castShadow = true;
  return m;
}

/** Wooden planks for the house's floor. */
function planks() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const tones = ['#c98f55', '#b97f48', '#d49b60', '#bf8850'];
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = tones[i % 4]!;
    ctx.fillRect(0, i * 16, 128, 16);
    ctx.fillStyle = 'rgba(80,45,20,0.35)';
    ctx.fillRect(0, i * 16 + 15, 128, 1);
    ctx.fillRect(((i * 37) % 100) + 10, i * 16, 1, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A screen with the game's name on it (the gym's and the arena's big screens). */
function screen(w: number, h: number, title: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.round((256 * h) / w);
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#1b1550');
  g.addColorStop(1, '#3a1d6e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = color;
  ctx.font = `800 ${Math.round(c.height * 0.32)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const frame = box(w + 0.3, h + 0.3, 0.25, '#2a2433');
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  face.position.z = 0.14;
  const g2 = new THREE.Group();
  g2.add(frame, face);
  return g2;
}

/** The walls, floor and door of a room. */
function shell(map: HubMap, kind: RoomKind, colliders: THREE.Box3[]) {
  const g = new THREE.Group();
  const s = SHELL[kind];
  const b = map.blocked;
  const back = U(b[s.back]!.y + b[s.back]!.h);
  const left = U(b[s.left]!.x + b[s.left]!.w);
  const right = U(b[s.right]!.x);
  const fl = b[s.front[0]]!;
  const fr = b[s.front[1]]!;
  const front = U(fl.y);
  const doorL = U(fl.x + fl.w);
  const doorR = U(fr.x);
  const W = right - left;
  const D = front - back;

  const floorTex =
    kind === 'house'
      ? planks()
      : kind === 'gym'
        ? speckle('#4f6a8f', ['#5c79a0', '#45607f', '#6a86ad'], 220)
        : speckle('#e3c98f', ['#d4b678', '#efd9a8', '#c9a86a'], 220);
  floorTex.repeat.set(W / 3, (D + 4) / 3);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 1, D + 4),
    new THREE.MeshLambertMaterial({ map: floorTex }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(left + W / 2, 0, back + (D + 4) / 2 - 0.5);
  floor.receiveShadow = true;
  floor.userData.live = true;
  g.add(floor);

  const wallColor = kind === 'house' ? '#f3e2c4' : kind === 'gym' ? '#dfe7f3' : '#3a2d5c';
  const trim = kind === 'house' ? '#b97f48' : kind === 'gym' ? '#3f6fd8' : '#ffcf4d';
  const wall = (x: number, z: number, w: number, d: number, h = WALL_H) => {
    const m = box(w, h, d, wallColor);
    m.position.set(x, h / 2, z);
    const band = box(w + 0.02, 0.25, d + 0.02, trim);
    band.position.set(x, h - 0.4, z);
    const base = box(w + 0.02, 0.3, d + 0.02, trim);
    base.position.set(x, 0.15, z);
    g.add(m, band, base);
    if (h > 2) colliders.push(new THREE.Box3().setFromObject(m));
  };
  wall(left + W / 2, back - 0.25, W + 1, 0.5);
  wall(left - 0.25, back + D / 2, 0.5, D + 0.5);
  wall(right + 0.25, back + D / 2, 0.5, D + 0.5);
  // the front wall is low, so the camera looks into the room over it
  wall((left + doorL) / 2, front + 0.25, doorL - left + 0.5, 0.5, 0.9);
  wall((doorR + right) / 2, front + 0.25, right - doorR + 0.5, 0.5, 0.9);
  // windows on the back wall of a house
  if (kind === 'house') {
    for (let i = 0; i < 3; i++) {
      const x = left + (W * (i + 0.5)) / 3;
      const win = box(2.2, 1.8, 0.1, '#bfe9ff', '#4a8ab0');
      win.position.set(x, 2.6, back + 0.02);
      const frame = box(2.5, 2.1, 0.08, '#8a5a32');
      frame.position.set(x, 2.6, back);
      g.add(frame, win);
    }
  }
  return { g, left, right, back, front, W, D };
}

/** The gym's equipment on its solid areas. */
function gym(map: HubMap, g: THREE.Group, interior: Map<string, THREE.Object3D>) {
  const b = map.blocked;
  const [, , , , , redL, redR, greenL, greenR, bench, weights, plantL, plantR] = b;
  // punching bags where the red tanks were drawn
  for (const r of [redL!, redR!]) {
    const bag = new THREE.Group();
    const post = cyl(0.1, 0.1, 4, '#5c6478');
    post.position.y = 2;
    const arm = box(1.1, 0.12, 0.12, '#5c6478');
    arm.position.set(0.5, 3.9, 0);
    const sack = cyl(0.42, 0.42, 1.7, '#e0414f');
    sack.position.set(1, 2.4, 0);
    const band = cyl(0.44, 0.44, 0.18, '#2a2433');
    band.position.set(1, 2.4, 0);
    bag.add(post, arm, sack, band);
    g.add(at(bag, cx(r) - 30, cy(r)));
  }
  // kettlebells on green mats
  for (const r of [greenL!, greenR!]) {
    const mat = box(U(r.w) + 0.6, 0.08, U(r.h) + 0.6, '#3fbf6a');
    const k = new THREE.Group();
    k.add(mat);
    for (let i = 0; i < 3; i++) {
      const bell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), flat('#2a2433'));
      bell.position.set(-0.6 + i * 0.6, 0.32, 0);
      bell.castShadow = true;
      k.add(bell);
    }
    g.add(at(k, cx(r), cy(r)));
  }
  // a weight bench with its bar
  {
    const r = bench!;
    const k = new THREE.Group();
    const seat = box(0.8, 0.2, 2.4, '#2a2433');
    seat.position.y = 0.75;
    const legs = box(0.6, 0.65, 0.3, '#5c6478');
    legs.position.set(0, 0.33, -0.8);
    const legs2 = legs.clone();
    legs2.position.z = 0.8;
    const bar = cyl(0.05, 0.05, 2.6, '#c3cad6');
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 1.7, -0.9);
    const p1 = cyl(0.42, 0.42, 0.16, '#3f6fd8');
    p1.rotation.z = Math.PI / 2;
    p1.position.set(-1.1, 1.7, -0.9);
    const p2 = p1.clone();
    p2.position.x = 1.1;
    for (const x of [-0.8, 0.8]) {
      const up = box(0.12, 1.7, 0.12, '#5c6478');
      up.position.set(x, 0.85, -0.9);
      k.add(up);
    }
    k.add(seat, legs, legs2, bar, p1, p2);
    g.add(at(k, cx(r), cy(r)));
  }
  // a dumbbell rack
  {
    const r = weights!;
    const k = new THREE.Group();
    const rack = box(1.4, 0.9, 2.6, '#5c6478');
    rack.position.y = 0.45;
    k.add(rack);
    for (let i = 0; i < 4; i++) {
      for (const x of [-0.35, 0.35]) {
        const db = cyl(0.16, 0.16, 0.5, i % 2 ? '#ef4a5b' : '#ffcf4d');
        db.rotation.x = Math.PI / 2;
        db.position.set(x, 1.05, -0.95 + i * 0.63);
        k.add(db);
      }
    }
    g.add(at(k, cx(r), cy(r)));
  }
  for (const r of [plantL!, plantR!])
    g.add(at(fit(interior.get('cactus_medium_A'), 1.8), cx(r), cy(r)));
  // the big screen and the coach's console on the back wall
  const sc = screen(6, 2.6, 'nyrGo! GYM', '#92fde8');
  sc.position.set(U(b[0]!.w / 2), 3, U(b[0]!.y + b[0]!.h) + 0.1);
  g.add(sc);
  const rug = tint(fit(interior.get('rug_rectangle_stripes_A'), 7), '#2bb5a0');
  g.add(at(rug, b[0]!.w / 2, b[0]!.y + b[0]!.h + 200));
}

/** The arena's stands, screen and machines. */
function arena(
  map: HubMap,
  g: THREE.Group,
  interior: Map<string, THREE.Object3D>,
  area: { left: number; right: number; back: number; front: number },
) {
  const b = map.blocked;
  const [, standL, standR, , , machL, machR, plantL, plantR] = b;
  // stands: three steps along each side, coloured seats
  for (const [r, dir] of [
    [standL!, 1],
    [standR!, -1],
  ] as const) {
    const xEdge = dir === 1 ? U(r.x + r.w) : U(r.x);
    for (let i = 0; i < 3; i++) {
      const step = box(1.3, 0.7 * (i + 1), U(r.h) - 3, '#5a4a8a');
      step.position.set(xEdge - dir * (0.65 + i * 1.3), 0.35 * (i + 1), U(r.y + r.h / 2));
      g.add(step);
      for (let k = 0; k < 8; k++) {
        const seat = box(
          0.7,
          0.25,
          0.7,
          ['#ef4a5b', '#ffcf4d', '#3f6fd8', '#43f289'][(k + i) % 4]!,
        );
        seat.position.set(
          step.position.x,
          0.7 * (i + 1) + 0.12,
          U(r.y) + 3 + (k * (U(r.h) - 6)) / 7,
        );
        g.add(seat);
      }
    }
  }
  // the ring painted on the floor
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.8, 48), flat('#ef4a5b'));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set((area.left + area.right) / 2, 0.03, (area.back + area.front) / 2 + 1);
  ring.userData.live = true;
  g.add(ring);
  const line = box(0.25, 0.02, 7.4, '#ffffff');
  line.position.set((area.left + area.right) / 2, 0.03, (area.back + area.front) / 2 + 1);
  line.userData.live = true;
  g.add(line);
  // machines: consoles with a lit screen
  for (const r of [machL!, machR!]) {
    const k = new THREE.Group();
    const body = box(1.3, 1.6, 1, '#2a2433');
    body.position.y = 0.8;
    const face = box(1, 0.6, 0.05, '#92fde8', '#2ac9a8');
    face.position.set(0, 1.25, 0.52);
    const btns = box(0.9, 0.12, 0.4, '#ffcf4d', '#403000');
    btns.position.set(0, 0.85, 0.5);
    k.add(body, face, btns);
    g.add(at(k, cx(r), cy(r)));
  }
  for (const r of [plantL!, plantR!])
    g.add(at(fit(interior.get('cactus_medium_A'), 1.6), cx(r), cy(r)));
  const sc = screen(8, 3.2, 'ARENA', '#ffcf4d');
  sc.position.set(U(b[0]!.w / 2), 3, U(b[0]!.y + b[0]!.h) + 0.1);
  g.add(sc);
}

/** A house's built-in furniture (bed, desks, kitchen, table). */
function house(map: HubMap, g: THREE.Group, interior: Map<string, THREE.Object3D>) {
  const b = map.blocked;
  const [, , , deskL, deskR, bed, kitchen, deskF, table] = b;
  const put = (id: string, w: number, x: number, y: number, rot = 0) =>
    g.add(at(fit(interior.get(id), w), x, y, rot));
  put('table_medium_long', 2.6, cx(deskL!), cy(deskL!) - 10);
  put('chair_A_wood', 0.9, cx(deskL!), cy(deskL!) + 40, Math.PI);
  put('lamp_table', 0.6, cx(deskL!) - 50, cy(deskL!) - 20);
  put('shelf_B_large_decorated', 2.8, cx(deskR!), deskR!.y + 20);
  put('cabinet_medium_decorated', 2.6, cx(deskR!), cy(deskR!) + 20);
  put('bed_single_A', 2.0, cx(bed!), cy(bed!));
  put('fridge_A', 1.8, kitchen!.x + kitchen!.w - 30, cy(kitchen!));
  put('kitchencounter_straight_A_decorated', 1.9, kitchen!.x + 40, cy(kitchen!));
  put('cabinet_small_decorated', 1.4, cx(deskF!), cy(deskF!));
  put('table_round_A', 2.6, cx(table!), cy(table!));
  put('chair_B', 0.9, cx(table!) - 60, cy(table!), Math.PI / 2);
  put('chair_B', 0.9, cx(table!) + 60, cy(table!), -Math.PI / 2);
  g.add(
    at(tint(fit(interior.get('rug_oval_A'), 4), '#5aa0d8'), map.width / 2, map.height / 2 + 40),
  );
}

const atlases = new Map<unknown, ImageData>();
/** A pack texture as pixels at 128 px (cached per image). */
function pixels(img: CanvasImageSource): ImageData {
  let d = atlases.get(img);
  if (!d) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, 128, 128);
    d = ctx.getImageData(0, 0, 128, 128);
    atlases.set(img, d);
  }
  return d;
}

const hslOf = (d: ImageData, i: number, out: { h: number; s: number; l: number }) =>
  new THREE.Color()
    .setRGB(d.data[i]! / 255, d.data[i + 1]! / 255, d.data[i + 2]! / 255, THREE.SRGBColorSpace)
    .getHSL(out, THREE.SRGBColorSpace);

/** The main colour's hue of a mesh: the most used saturated colour under its UVs (not wood). */
function mainHue(mesh: THREE.Mesh, d: ImageData, flipY: boolean): number | null {
  const uv = mesh.geometry.getAttribute('uv');
  if (!uv) return null;
  const bins = new Array<number>(24).fill(0);
  const hsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i < uv.count; i++) {
    const u = Math.min(127, Math.max(0, Math.floor(uv.getX(i) * 128)));
    const vv = flipY ? 1 - uv.getY(i) : uv.getY(i);
    const v = Math.min(127, Math.max(0, Math.floor(vv * 128)));
    hslOf(d, (v * 128 + u) * 4, hsl);
    const wood = hsl.h < 0.12 && hsl.s < 0.6 && hsl.l < 0.55;
    if (hsl.s > 0.3 && !wood) bins[Math.floor(hsl.h * 24) % 24]! += 1;
  }
  const best = bins.indexOf(Math.max(...bins));
  return bins[best]! > 0 ? (best + 0.5) / 24 : null;
}

const tinted = new Map<string, THREE.Material>();
/**
 * Recolours a model's main colour (its fabric, say): every pixel of that hue takes `to`, keeping
 * how light it was. The pack's models share one texture, so the result is a new material.
 */
function tint(o: THREE.Object3D, to: string) {
  const t = new THREE.Color(to).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshStandardMaterial;
    const img = src.map?.image as CanvasImageSource | undefined;
    if (!img || !src.map) return;
    const base = pixels(img);
    const hue = mainHue(m, base, src.map.flipY);
    if (hue === null) return;
    const key = `${src.uuid}|${hue}|${to}`;
    let mat = tinted.get(key);
    if (!mat) {
      const data = new ImageData(new Uint8ClampedArray(base.data), 128, 128);
      const hsl = { h: 0, s: 0, l: 0 };
      const px = new THREE.Color();
      const rgb = { r: 0, g: 0, b: 0 };
      for (let i = 0; i < data.data.length; i += 4) {
        hslOf(base, i, hsl);
        const dh = Math.min(Math.abs(hsl.h - hue), 1 - Math.abs(hsl.h - hue));
        if (dh < 0.06 && hsl.s > 0.25) {
          px.setHSL(
            t.h,
            t.s,
            Math.min(0.92, Math.max(0.08, t.l + (hsl.l - 0.5) * 0.6)),
            THREE.SRGBColorSpace,
          ).getRGB(rgb, THREE.SRGBColorSpace);
          data.data[i] = rgb.r * 255;
          data.data[i + 1] = rgb.g * 255;
          data.data[i + 2] = rgb.b * 255;
        }
      }
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      c.getContext('2d')!.putImageData(data, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.flipY = src.map.flipY;
      tex.colorSpace = THREE.SRGBColorSpace;
      const clone = src.clone();
      clone.map = tex;
      mat = clone;
      tinted.set(key, mat);
    }
    m.material = mat;
  });
  return o;
}

/** A tall bookcase full of books. */
function bookcase(interior: Map<string, THREE.Object3D>) {
  const g = new THREE.Group();
  const back = box(2, 2.8, 0.5, '#8a5a32');
  back.position.y = 1.4;
  g.add(back);
  for (let i = 0; i < 3; i++) {
    const shelf = box(2.05, 0.1, 0.62, '#6b4226');
    shelf.position.set(0, 0.5 + i * 0.85, 0.06);
    const books = fit(interior.get('book_set'), 1.3);
    books.position.set(i % 2 ? 0.2 : -0.2, 0.55 + i * 0.85, 0.12);
    g.add(shelf, books);
  }
  return g;
}

/** A piece of the owner's furniture, in 3D. */
export function furniture(
  id: string,
  interior: Map<string, THREE.Object3D>,
  lib: Library,
): THREE.Object3D {
  const k = (m: string, w: number) => fit(interior.get(m), w);
  const g = new THREE.Group();
  switch (id) {
    case 'plant-small':
      return k('cactus_small_A', 0.9);
    case 'plant-white':
      return k('cactus_medium_A', 1.4);
    case 'plant-flowers': {
      const pot = cyl(0.45, 0.35, 0.7, '#e07b4a');
      pot.position.y = 0.35;
      const f = flowers(7, 1.1, 1.1);
      f.position.y = 0.55;
      g.add(pot, f);
      return g;
    }
    case 'barrel':
      return fit(lib.town.get('barrel'), 1);
    case 'stool-red':
      return tint(k('chair_stool', 0.8), '#e0414f');
    case 'chair-wood':
      return k('chair_A_wood', 0.9);
    case 'chair-blue':
      return k('chair_B', 0.9);
    case 'nightstand':
      return k('cabinet_small_decorated', 1.2);
    case 'rug-red':
      return tint(k('rug_rectangle_A', 3.2), '#d9404f');
    case 'rug-blue':
      return tint(k('rug_rectangle_stripes_A', 3.6), '#3f6fd8');
    case 'rug-purple':
      return tint(k('rug_oval_A', 3.4), '#8a5ad8');
    case 'banner-red':
      return fit(lib.town.get('flag-red'), undefined, 2.6);
    case 'banner-gold':
      return tint(fit(lib.town.get('flag'), undefined, 2.6), '#e8b83a');
    case 'shelf-small':
      return k('shelf_B_small_decorated', 1.6);
    case 'bookcase':
      return bookcase(interior);
    case 'table-round':
      return k('table_round_A', 2.2);
    case 'sofa-cream':
      return tint(k('couch', 2.6), '#efe2c4');
    case 'sofa-blue':
      return tint(k('couch_pillows', 2.6), '#4f7fe0');
    case 'sofa-white':
      return tint(k('armchair', 1.6), '#f2f2f2');
    case 'loveseat-red':
      return tint(k('armchair_pillows', 1.8), '#d9404f');
    case 'sofa-red':
      return tint(k('couch_pillows', 3), '#d9404f');
    case 'dresser':
      return k('cabinet_medium_decorated', 2);
    case 'noticeboard':
      return board();
    case 'bed-red':
      return tint(k('bed_single_A', 1.8), '#d9404f');
    case 'bed-blue':
      return tint(k('bed_single_B', 1.8), '#3f8ae0');
    case 'tv': {
      const stand = k('cabinet_medium', 2);
      const set = box(1.8, 1.1, 0.15, '#1b1530');
      set.position.y = 1.65;
      const face = box(1.6, 0.9, 0.02, '#3fb0ee', '#1a4a7a');
      face.position.set(0, 1.65, 0.09);
      g.add(stand, set, face);
      return g;
    }
    case 'computer': {
      const desk = k('table_small', 1.4);
      const mon = box(0.9, 0.6, 0.08, '#1b1530');
      mon.position.y = 1.45;
      const face = box(0.8, 0.5, 0.02, '#43f289', '#105a3a');
      face.position.set(0, 1.45, 0.05);
      const kb = box(0.7, 0.04, 0.25, '#e4e6ee');
      kb.position.set(0, 1.03, 0.3);
      g.add(desk, mon, face, kb);
      return g;
    }
    case 'aquarium': {
      const stand = box(1.6, 0.7, 0.8, '#8a5a32');
      stand.position.y = 0.35;
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.9, 0.7),
        new THREE.MeshLambertMaterial({
          color: '#7fd8ff',
          emissive: '#103a5a',
          transparent: true,
          opacity: 0.6,
        }),
      );
      glass.position.y = 1.15;
      const fish = box(0.22, 0.12, 0.05, '#ff9a3c', '#402000');
      fish.position.set(0.2, 1.2, 0);
      fish.userData.fish = true;
      g.add(stand, glass, fish);
      return g;
    }
    case 'water-cooler': {
      const body = box(0.6, 1.1, 0.6, '#e4e6ee');
      body.position.y = 0.55;
      const jug = cyl(0.26, 0.26, 0.7, '#7fd8ff', '#103a5a');
      jug.position.y = 1.45;
      g.add(body, jug);
      return g;
    }
    case 'trophy': {
      const ped = box(0.8, 0.9, 0.8, '#b9c0cc');
      ped.position.y = 0.45;
      const cup = cyl(0.36, 0.14, 0.55, '#ffcf4d', '#3a2a00');
      cup.position.y = 1.25;
      const foot = cyl(0.2, 0.25, 0.12, '#ffcf4d', '#3a2a00');
      foot.position.y = 0.96;
      g.add(ped, cup, foot);
      return g;
    }
    case 'clock': {
      const body = box(0.8, 2.6, 0.5, '#8a5a32');
      body.position.y = 1.3;
      const face = cyl(0.3, 0.3, 0.05, '#fff3d6');
      face.rotation.x = Math.PI / 2;
      face.position.set(0, 2.1, 0.27);
      const pend = cyl(0.12, 0.12, 0.04, '#ffcf4d');
      pend.rotation.x = Math.PI / 2;
      pend.position.set(0, 1.0, 0.27);
      g.add(body, face, pend);
      return g;
    }
    case 'arcade': {
      const body = box(1, 2.2, 0.9, '#7b3fc4');
      body.position.y = 1.1;
      const face = box(0.8, 0.6, 0.05, '#92fde8', '#2ac9a8');
      face.position.set(0, 1.55, 0.46);
      const pad = box(0.85, 0.12, 0.35, '#ffcf4d');
      pad.position.set(0, 1.05, 0.55);
      g.add(body, face, pad);
      return g;
    }
    case 'crystal': {
      const base = cyl(0.45, 0.55, 0.3, '#5a4a8a');
      base.position.y = 0.15;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), flat('#b78cff', '#5a2ab0'));
      gem.position.y = 1.0;
      gem.scale.y = 1.4;
      gem.userData.spin = true;
      g.add(base, gem);
      return g;
    }
    default:
      return g;
  }
}

/** Builds a room's stage. */
export function buildRoom(
  lib: Library,
  interior: Map<string, THREE.Object3D>,
  map: HubMap,
  kind: RoomKind,
): Stage {
  const colliders: THREE.Box3[] = [];
  const statics = new THREE.Group();
  const s = shell(map, kind, colliders);
  statics.add(s.g);
  if (kind === 'gym') gym(map, statics, interior);
  else if (kind === 'arena') arena(map, statics, interior, s);
  else house(map, statics, interior);

  // the door out: a glowing mat where the map's door is
  const live = new THREE.Group();
  const door = map.interactions.find((i) => i.kind === 'door');
  const tickers: ((t: number) => void)[] = [];
  if (door) {
    const p = portal(3.2);
    // only the glowing circle and its light: no stones around it indoors
    p.g.children
      .filter((c) => c !== p.swirl && c !== p.ring && c !== p.beam)
      .forEach((c) => c.removeFromParent());
    at(p.g, door.x, door.y - 20);
    live.add(p.g);
    tickers.push((t) => {
      p.swirl.rotation.z = -t * 1.4;
      (p.beam.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 2.2) * 0.2;
    });
  }
  // the floor and the door move or shine: they stay out of the merged batch
  const floors: THREE.Object3D[] = [];
  statics.traverse((o) => {
    if (o.userData.live) floors.push(o);
  });
  for (const f of floors) {
    f.updateMatrixWorld(true);
    const parent = f.parent!;
    parent.remove(f);
    f.applyMatrix4(parent.matrixWorld);
    live.add(f);
  }
  const group = new THREE.Group();
  group.add(batch(statics), live);
  return { group, tick: (t) => tickers.forEach((x) => x(t)), lamps: [], colliders, indoor: true };
}

/** The owner's furniture, as placed (bottom centre on its x, y; rugs lie centred on it). */
export function furnitureGroup(
  layout: { f: string; x: number; y: number; flip: boolean }[],
  interior: Map<string, THREE.Object3D>,
  lib: Library,
): { group: THREE.Group; tick: (t: number) => void } {
  const group = new THREE.Group();
  const spinners: THREE.Object3D[] = [];
  const fish: THREE.Object3D[] = [];
  for (const p of layout) {
    const def = FURNITURE_BY_ID.get(p.f);
    if (!def) continue;
    const o = furniture(p.f, interior, lib);
    o.traverse((x) => {
      if (x.userData.spin) spinners.push(x);
      if (x.userData.fish) fish.push(x);
      x.castShadow = true;
    });
    // pieces stand against the wall behind them, facing the room (or turned when flipped)
    o.position.set(U(p.x), 0, U(def.rug ? p.y : p.y) - (def.rug ? 0 : 0.4));
    if (p.flip) o.rotation.y = Math.PI / 2;
    group.add(o);
  }
  return {
    group,
    tick: (t) => {
      for (const s of spinners) s.rotation.y = t;
      fish.forEach((f, i) => (f.position.x = Math.sin(t * 0.8 + i) * 0.5));
    },
  };
}
