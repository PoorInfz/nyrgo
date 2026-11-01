import * as THREE from 'three';
import type { Hat, Recipe } from './looks';

/**
 * Small pieces modelled in code, in the pack's low-poly style: hats the pack does not have and
 * accessories (glasses, scarf, backpack, a bun or spikes of hair). Built in the head bone's space:
 * the head fills x ±0.54, y 0…1.1 and looks towards +z.
 */

const mats = new Map<string, THREE.MeshLambertMaterial>();
/** One flat-shaded material per colour, shared by every figure. */
export function flat(color: string, emissive?: string): THREE.MeshLambertMaterial {
  const key = `${color}|${emissive ?? ''}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    if (emissive) m.emissive = new THREE.Color(emissive);
    mats.set(key, m);
  }
  return m;
}

const geos = new Map<string, THREE.BufferGeometry>();
/** Geometry cache: the same hat on twenty heads is one geometry. */
function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = geos.get(key);
  if (!g) geos.set(key, (g = make()));
  return g;
}

function mesh(
  g: THREE.BufferGeometry,
  m: THREE.Material,
  pos: [number, number, number],
  scale?: [number, number, number],
  rot?: [number, number, number],
) {
  const o = new THREE.Mesh(g, m);
  o.position.set(...pos);
  if (scale) o.scale.set(...scale);
  if (rot) o.rotation.set(...rot);
  o.castShadow = true;
  return o;
}

const dome = () =>
  geo('dome', () => new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2));
const disc = () => geo('disc', () => new THREE.CylinderGeometry(1, 1, 1, 14));
const ball = () => geo('ball', () => new THREE.IcosahedronGeometry(1, 1));
const cone = () => geo('cone', () => new THREE.ConeGeometry(1, 1, 6));
const ring = () => geo('ring', () => new THREE.TorusGeometry(1, 0.12, 6, 16));
const box = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));

/** A hat modelled in code, on the head bone. */
export function proceduralHat(kind: Hat, c: string, trim: string): THREE.Object3D | null {
  const g = new THREE.Group();
  const add = (...o: THREE.Object3D[]) => g.add(...o);
  switch (kind) {
    case 'cap':
      add(
        mesh(dome(), flat(c), [0, 0.62, -0.02], [0.6, 0.55, 0.6]),
        mesh(disc(), flat(c), [0, 0.66, 0.42], [0.4, 0.05, 0.32]),
        mesh(disc(), flat(trim), [0, 0.92, 0.42], [0.22, 0.2, 0.04], [Math.PI / 2 - 0.5, 0, 0]),
        mesh(ball(), flat(trim), [0, 1.16, -0.02], [0.07, 0.07, 0.07]),
      );
      break;
    case 'beanie':
      add(
        mesh(dome(), flat(c), [0, 0.62, -0.02], [0.61, 0.72, 0.6]),
        mesh(disc(), flat(trim), [0, 0.66, -0.02], [0.62, 0.16, 0.61]),
        mesh(ball(), flat(trim), [0, 1.36, -0.02], [0.15, 0.15, 0.15]),
      );
      break;
    case 'crown':
      add(mesh(disc(), flat(c, '#3a2a00'), [0, 1.12, 0], [0.38, 0.22, 0.38]));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(
          mesh(
            cone(),
            flat(c, '#3a2a00'),
            [Math.sin(a) * 0.32, 1.32, Math.cos(a) * 0.32],
            [0.1, 0.22, 0.1],
          ),
        );
      }
      add(mesh(ball(), flat(trim, '#300000'), [0, 1.12, 0.38], [0.08, 0.08, 0.05]));
      break;
    case 'leaf':
      add(
        mesh(ball(), flat(c), [0.05, 1.22, 0], [0.34, 0.06, 0.18], [0, 0, 0.5]),
        mesh(disc(), flat(trim), [-0.16, 1.1, 0], [0.03, 0.18, 0.03], [0, 0, 0.5]),
      );
      break;
    case 'explorer':
      add(
        mesh(disc(), flat(c), [0, 0.98, 0], [0.48, 0.32, 0.48]),
        mesh(disc(), flat(c), [0, 0.84, 0.02], [0.86, 0.04, 0.82]),
        mesh(disc(), flat(trim), [0, 0.9, 0], [0.49, 0.08, 0.49]),
      );
      break;
    case 'toque':
      add(
        mesh(disc(), flat(c), [0, 1.08, 0], [0.42, 0.42, 0.42]),
        mesh(ball(), flat(c), [0, 1.42, 0], [0.5, 0.3, 0.5]),
      );
      break;
    case 'police':
      add(
        mesh(disc(), flat(c), [0, 0.92, 0], [0.55, 0.3, 0.55]),
        mesh(disc(), flat(c), [0, 1.08, 0.02], [0.64, 0.06, 0.64]),
        mesh(disc(), flat(trim), [0, 0.86, 0], [0.56, 0.08, 0.56]),
        mesh(disc(), flat('#1b1530'), [0, 0.8, 0.46], [0.36, 0.04, 0.24]),
        mesh(ball(), flat(trim, '#302000'), [0, 0.98, 0.55], [0.08, 0.08, 0.04]),
      );
      break;
    case 'straw':
      add(
        mesh(disc(), flat(c), [0, 0.86, 0], [1.0, 0.04, 1.0]),
        mesh(disc(), flat(c), [0, 1.0, 0], [0.5, 0.28, 0.5]),
        mesh(disc(), flat(trim), [0, 0.92, 0], [0.51, 0.08, 0.51]),
      );
      break;
    case 'nurse':
      add(
        mesh(box(), flat(c), [0, 1.08, 0.08], [0.62, 0.24, 0.3]),
        mesh(box(), flat(trim), [0, 1.08, 0.24], [0.16, 0.05, 0.02]),
        mesh(box(), flat(trim), [0, 1.08, 0.24], [0.05, 0.16, 0.02]),
      );
      break;
    case 'headphones': {
      const band = mesh(
        geo('band', () => new THREE.TorusGeometry(0.62, 0.06, 6, 16, Math.PI)),
        flat(trim),
        [0, 0.5, 0],
      );
      add(
        band,
        mesh(disc(), flat(c), [0.6, 0.48, 0], [0.2, 0.12, 0.2], [0, 0, Math.PI / 2]),
        mesh(disc(), flat(c), [-0.6, 0.48, 0], [0.2, 0.12, 0.2], [0, 0, Math.PI / 2]),
      );
      break;
    }
    case 'circlet':
      add(
        mesh(
          ring(),
          flat(c, '#302000'),
          [0, 0.86, 0],
          [0.56, 0.56, 0.56],
          [Math.PI / 2 - 0.12, 0, 0],
        ),
        mesh(ball(), flat(trim, '#003040'), [0, 0.92, 0.55], [0.08, 0.08, 0.05]),
      );
      break;
    default:
      return null;
  }
  return g;
}

/** Accessories on the head bone (glasses, scarf, hair) and on the chest (backpack). */
export function extras(r: Recipe): { head: THREE.Object3D[]; chest: THREE.Object3D[] } {
  const head: THREE.Object3D[] = [];
  const chest: THREE.Object3D[] = [];
  const x = r.extras;
  if (x.glasses) {
    const m = flat(x.glasses);
    head.push(
      mesh(ring(), m, [0.2, 0.42, 0.53], [0.15, 0.15, 0.15]),
      mesh(ring(), m, [-0.2, 0.42, 0.53], [0.15, 0.15, 0.15]),
      mesh(box(), m, [0, 0.44, 0.54], [0.12, 0.03, 0.03]),
    );
  }
  if (x.scarf) {
    head.push(
      mesh(ring(), flat(x.scarf[0]), [0, -0.04, 0.02], [0.4, 0.4, 0.9], [Math.PI / 2, 0, 0]),
      mesh(box(), flat(x.scarf[1]), [0.18, -0.25, 0.36], [0.16, 0.34, 0.08], [0.2, 0, 0.1]),
    );
  }
  head.push(...hairPieces(r));
  if (x.backpack) {
    chest.push(
      mesh(box(), flat(x.backpack), [0, -0.12, -0.48], [0.56, 0.6, 0.28]),
      mesh(box(), flat('#2a211c'), [0, -0.24, -0.63], [0.42, 0.2, 0.05]),
    );
  }
  return { head, chest };
}

/** Points spread evenly over a sphere (a Fibonacci spiral), as unit vectors. */
function spread(n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    out.push(new THREE.Vector3(Math.cos(i * golden) * r, y, Math.sin(i * golden) * r));
  }
  return out;
}

/** A shade of a colour (k < 1 darker, k > 1 lighter). */
function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

/** Round, slightly faceted pieces of hair. */
const lump = () => geo('lump', () => new THREE.IcosahedronGeometry(1, 1));

/**
 * The hair modelled in code, in the head bone's space: long hair down the back, a high
 * ponytail, a bun, spikes and curls. Built from a few shades of the hair colour so the pieces
 * read as locks rather than one blob.
 */
function hairPieces(r: Recipe): THREE.Object3D[] {
  const x = r.extras;
  const c = r.colors.hair;
  const dark = flat(shade(c, 0.78));
  const mid = flat(c);
  const light = flat(shade(c, 1.15));
  const out: THREE.Object3D[] = [];
  // the head is an ellipsoid round this centre, these half-sizes
  const centre = new THREE.Vector3(0, 0.58, -0.02);
  const half = new THREE.Vector3(0.58, 0.58, 0.56);
  const onHead = (d: THREE.Vector3, k = 1) =>
    centre
      .clone()
      .add(new THREE.Vector3(d.x * half.x, d.y * half.y, d.z * half.z).multiplyScalar(k));

  if (x.long) {
    // locks falling from the crown down past the shoulders, in an arc behind the head
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.18 + (0.64 * i) / (n - 1)); // around the back, ear to ear
      const sx = Math.cos(a);
      const sz = -Math.sin(a);
      const lock = new THREE.Mesh(
        geo('lock', () => {
          const g = new THREE.CapsuleGeometry(1, 1, 3, 8);
          return g;
        }),
        i % 3 === 1 ? light : i % 2 ? dark : mid,
      );
      const len = 0.95 - Math.abs(i - (n - 1) / 2) * 0.05;
      lock.scale.set(0.15, len / 2, 0.11);
      lock.position.set(sx * 0.5, 0.42 - len * 0.18, sz * 0.46 - 0.04);
      lock.rotation.set(-sz * 0.18, 0, sx * 0.14);
      lock.castShadow = true;
      out.push(lock);
    }
    // the back of the head covered down to the nape
    out.push(mesh(lump(), mid, [0, 0.52, -0.32], [0.5, 0.42, 0.34]));
  }

  if (x.tail) {
    // a band high at the back, then the tail swinging down in shrinking pieces
    out.push(
      mesh(
        geo('band', () => new THREE.TorusGeometry(1, 0.35, 6, 12)),
        flat('#2a2433'),
        [0, 0.86, -0.56],
        [0.11, 0.11, 0.11],
        [0.9, 0, 0],
      ),
    );
    // the tail: a smooth run of overlapping pieces along a curve, thinning to the tip
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.9, -0.62),
      new THREE.Vector3(0, 0.82, -0.84),
      new THREE.Vector3(0, 0.55, -0.92),
      new THREE.Vector3(0.02, 0.25, -0.86),
      new THREE.Vector3(0.05, 0.02, -0.74),
    ]);
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = curve.getPoint(t);
      const rad = 0.19 * (1 - t * 0.75) + 0.02 * Math.sin(t * Math.PI);
      out.push(mesh(lump(), i % 3 === 0 ? dark : mid, [p.x, p.y, p.z], [rad, rad * 1.15, rad]));
    }
  }

  if (x.bun) {
    out.push(
      mesh(lump(), mid, [0, 1.12, -0.28], [0.27, 0.24, 0.27]),
      mesh(lump(), light, [0.06, 1.2, -0.22], [0.14, 0.12, 0.14]),
      mesh(
        geo('band', () => new THREE.TorusGeometry(1, 0.35, 6, 12)),
        flat(r.colors.trim),
        [0, 1.0, -0.26],
        [0.17, 0.17, 0.17],
        [Math.PI / 2 - 0.5, 0, 0],
      ),
    );
  }

  if (x.spikes) {
    // two rows of spikes over the crown, swept back, longest in the middle
    const rows: [number, number, number][] = [
      // elevation (rad), count, length
      [0.95, 5, 0.5],
      [0.45, 7, 0.42],
    ];
    rows.forEach(([el, count, len], row) => {
      for (let i = 0; i < count; i++) {
        const az = Math.PI * (-0.15 - (1.3 * i) / (count - 1)); // from one side over the back
        const d = new THREE.Vector3(
          Math.cos(az) * Math.cos(el),
          Math.sin(el),
          Math.sin(az) * Math.cos(el),
        );
        // the front row leans forward a little: a fringe of spikes
        if (row === 0) d.z += 0.35;
        d.normalize();
        const base = onHead(d, 0.86);
        const tilt = d
          .clone()
          .add(new THREE.Vector3(0, 0.35, -0.35))
          .normalize();
        const k = len * (1 - Math.abs(i - (count - 1) / 2) * 0.08);
        const spike = new THREE.Mesh(cone(), i % 2 ? dark : mid);
        spike.scale.set(0.16, k, 0.16);
        spike.position.copy(base.addScaledVector(tilt, k / 2));
        spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tilt);
        spike.castShadow = true;
        out.push(spike);
      }
    });
  }

  if (x.curls) {
    // round curls over the top, sides and back: a soft, full shape, open at the face
    const pts = spread(70);
    pts.forEach((d, i) => {
      if (d.y < -0.15) return; // not below the ears
      if (d.z > 0.35 && d.y < 0.55) return; // not over the face
      const p = onHead(d, 1.0);
      const rad = 0.15 + ((i * 37) % 10) * 0.009;
      out.push(
        mesh(
          lump(),
          i % 3 === 0 ? dark : i % 3 === 1 ? mid : light,
          [p.x, p.y, p.z],
          [rad, rad, rad],
        ),
      );
    });
  }
  return out;
}
