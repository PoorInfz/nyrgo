import { ELEMENT_INFO, type CreatureDef } from '@nyrgo/shared';
import {
  box,
  cone,
  encodeGlb,
  octahedron,
  torus,
  transform,
  uvSphere,
  type Material,
  type Part,
  type Vec3,
} from './glb';

/**
 * Placeholder 3D figures. The element decides the silhouette, the stage the size, the archetype
 * the proportions, and rarity adds a ring (epic) or a crown (legendary, mythic). They exist so
 * gameplay is never blocked by art; final models replace them before Phase 4.
 */

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const shade = (c: [number, number, number], f: number): [number, number, number] =>
  c.map((v) => Math.max(0, Math.min(1, v * f))) as [number, number, number];

const WHITE: Material = { color: [0.96, 0.96, 0.96], roughness: 0.5 };
const PUPIL: Material = { color: [0.05, 0.05, 0.08], roughness: 0.3 };
const GOLD: Material = { color: [0.95, 0.75, 0.25], metallic: 0.7, roughness: 0.35 };

const PROPORTIONS: Record<CreatureDef['archetype'], Vec3> = {
  balanced: [1, 1, 1],
  tank: [1.25, 0.9, 1.2],
  striker: [0.95, 1.1, 0.95],
  swift: [0.85, 1.15, 0.85],
};

/** Stable per-creature tint (0.82–1.18) so creatures of one element are told apart. */
function tint(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return 0.82 + (((h >>> 0) % 1000) / 1000) * 0.36;
}

export function creatureParts(c: CreatureDef): Part[] {
  const base = shade(hex(ELEMENT_INFO[c.element].color), tint(c.id));
  const body: Material = { color: base, roughness: 0.75 };
  const accent: Material = { color: shade(base, 0.6), roughness: 0.7 };
  const size = [0.5, 0.65, 0.8][c.stage - 1]!;
  const [px, py, pz] = PROPORTIONS[c.archetype];
  const rx = size * px;
  const ry = size * py;
  const rz = size * pz;
  const parts: Part[] = [];
  const add = (tris: number[], material: Material) => parts.push({ tris, material });

  /** Body centre sits so the figure rests on y = 0. */
  const cy = ry;
  let eyeY = cy + ry * 0.25;
  let eyeZ = rz * 0.86;

  switch (c.element) {
    case 'water':
      add(
        transform(uvSphere(), { scale: [rx * 1.15, ry * 0.85, rz], translate: [0, cy * 0.85, 0] }),
        body,
      );
      add(
        transform(cone(), {
          scale: [rx * 0.35, rz * 0.6, rx * 0.12],
          rotate: [-Math.PI / 2, 0, 0],
          translate: [0, cy * 0.85, -rz * 0.9],
        }),
        accent,
      );
      eyeY = cy * 0.95;
      break;
    case 'fire':
      add(transform(uvSphere(), { scale: [rx, ry * 0.8, rz], translate: [0, cy * 0.8, 0] }), body);
      add(
        transform(cone(), { scale: [rx * 0.7, ry * 1.3, rz * 0.7], translate: [0, cy * 1.2, 0] }),
        accent,
      );
      eyeY = cy * 0.9;
      break;
    case 'nature':
      add(transform(uvSphere(), { scale: [rx, ry, rz], translate: [0, cy, 0] }), body);
      for (const side of [-1, 1]) {
        add(
          transform(cone(6), {
            scale: [rx * 0.3, ry * 0.9, rx * 0.08],
            rotate: [0, 0, side * -0.6],
            translate: [side * rx * 0.25, cy + ry * 0.75, 0],
          }),
          accent,
        );
      }
      break;
    case 'earth':
      add(
        transform(box(), { scale: [rx * 1.8, ry * 1.8, rz * 1.8], translate: [0, cy * 0.9, 0] }),
        body,
      );
      add(
        transform(box(), {
          scale: [rx * 0.9, ry * 0.5, rz * 0.9],
          rotate: [0, Math.PI / 4, 0],
          translate: [0, cy * 1.95, 0],
        }),
        accent,
      );
      eyeY = cy * 1.1;
      eyeZ = rz * 0.91;
      break;
    case 'electric':
      add(transform(uvSphere(), { scale: [rx, ry, rz], translate: [0, cy, 0] }), body);
      for (const [i, a] of [-0.5, 0, 0.5].entries()) {
        add(
          transform(cone(5), {
            scale: [rx * 0.14, ry * (0.7 + 0.25 * (i % 2)), rx * 0.14],
            rotate: [0, 0, a],
            translate: [Math.sin(-a) * rx * 0.6, cy + ry * 0.75, 0],
          }),
          accent,
        );
      }
      break;
    case 'wind':
      add(transform(uvSphere(), { scale: [rx, ry * 0.8, rz], translate: [0, cy * 0.9, 0] }), body);
      for (const side of [-1, 1]) {
        add(
          transform(box(), {
            scale: [rx * 1.3, ry * 0.08, rz * 0.7],
            rotate: [0, 0, side * 0.35],
            translate: [side * rx * 1.25, cy * 1.05, 0],
          }),
          accent,
        );
      }
      eyeY = cy;
      break;
    case 'ice':
      add(
        transform(octahedron(), {
          scale: [rx * 1.1, ry * 1.25, rz * 1.1],
          translate: [0, cy * 1.2, 0],
        }),
        body,
      );
      add(
        transform(octahedron(), {
          scale: [rx * 0.35, ry * 0.5, rz * 0.35],
          translate: [rx * 0.85, cy * 0.55, 0],
        }),
        accent,
      );
      eyeY = cy * 1.3;
      eyeZ = rz * 0.55;
      break;
    case 'cosmic':
      add(transform(uvSphere(), { scale: [rx, ry, rz], translate: [0, cy, 0] }), body);
      add(
        transform(torus(0.06), {
          scale: [rx * 1.55, rx * 1.55, rx * 1.55],
          rotate: [0.4, 0, 0.25],
          translate: [0, cy, 0],
        }),
        accent,
      );
      break;
    case 'light':
      add(transform(uvSphere(), { scale: [rx, ry, rz], translate: [0, cy, 0] }), body);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI - Math.PI / 2 + Math.PI / 12;
        add(
          transform(cone(5), {
            scale: [rx * 0.12, ry * 0.45, rx * 0.12],
            rotate: [0, 0, -a],
            translate: [Math.sin(a) * rx * 0.85, cy + Math.cos(a) * ry * 0.85, 0],
          }),
          accent,
        );
      }
      break;
    case 'shadow':
      add(transform(uvSphere(6, 9), { scale: [rx, ry, rz], translate: [0, cy, 0] }), body);
      for (const side of [-1, 1]) {
        add(
          transform(cone(5), {
            scale: [rx * 0.16, ry * 0.6, rx * 0.16],
            rotate: [0, 0, side * -0.45],
            translate: [side * rx * 0.5, cy + ry * 0.75, 0],
          }),
          accent,
        );
      }
      break;
  }

  // Eyes: the shared "face" that makes every blob read as a creature.
  // Babies get bigger eyes; fully evolved creatures look sharper.
  const eye = size * [0.2, 0.16, 0.13][c.stage - 1]!;
  for (const side of [-1, 1]) {
    const x = side * rx * 0.36;
    add(
      transform(uvSphere(6, 8), {
        scale: [eye, eye * 1.15, eye * 0.6],
        translate: [x, eyeY, eyeZ],
      }),
      WHITE,
    );
    add(
      transform(uvSphere(5, 7), {
        scale: [eye * 0.5, eye * 0.6, eye * 0.35],
        translate: [x, eyeY - eye * 0.1, eyeZ + eye * 0.4],
      }),
      PUPIL,
    );
  }

  if (c.rarity === 'epic') {
    add(
      transform(torus(0.05), { scale: [rx * 1.35, 1, rz * 1.35], translate: [0, 0.06, 0] }),
      GOLD,
    );
  }
  if (c.rarity === 'legendary' || c.rarity === 'mythic') {
    const top = parts.reduce((m, p) => {
      for (let i = 1; i < p.tris.length; i += 3) m = Math.max(m, p.tris[i]!);
      return m;
    }, 0);
    const spikes = c.rarity === 'mythic' ? 7 : 5;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      add(
        transform(cone(4), {
          scale: [size * 0.09, size * 0.3, size * 0.09],
          translate: [Math.cos(a) * size * 0.28, top, Math.sin(a) * size * 0.28],
        }),
        GOLD,
      );
    }
    add(
      transform(torus(0.18), {
        scale: [size * 0.3, size * 0.3, size * 0.3],
        translate: [0, top, 0],
      }),
      GOLD,
    );
  }

  // Rest the whole figure on the ground, whatever its silhouette.
  let minY = Infinity;
  for (const p of parts)
    for (let i = 1; i < p.tris.length; i += 3) minY = Math.min(minY, p.tris[i]!);
  return parts.map((p) => ({ ...p, tris: transform(p.tris, { translate: [0, -minY, 0] }) }));
}

export function creatureGlb(c: CreatureDef): Uint8Array {
  return encodeGlb(c.id, creatureParts(c));
}
