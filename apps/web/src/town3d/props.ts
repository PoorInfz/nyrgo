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
  if (x.curls)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      head.push(
        mesh(
          ball(),
          flat(r.colors.hair),
          [Math.sin(a) * 0.36, 1.02 + (i % 2) * 0.06, Math.cos(a) * 0.3 - 0.06],
          [0.22, 0.2, 0.22],
        ),
      );
    }
  if (x.bun) head.push(mesh(ball(), flat(r.colors.hair), [0, 1.0, -0.42], [0.28, 0.28, 0.28]));
  if (x.spikes) {
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.42;
      head.push(
        mesh(
          cone(),
          flat(r.colors.hair),
          [Math.sin(a) * 0.32, 1.12, -0.1 + Math.cos(a) * 0.05],
          [0.16, 0.36, 0.16],
          [-0.3, 0, -a * 0.8],
        ),
      );
    }
  }
  if (x.backpack) {
    chest.push(
      mesh(box(), flat(x.backpack), [0, -0.12, -0.48], [0.56, 0.6, 0.28]),
      mesh(box(), flat('#2a211c'), [0, -0.24, -0.63], [0.42, 0.2, 0.05]),
    );
  }
  return { head, chest };
}
