/**
 * A tiny, dependency-free glTF 2.0 binary (GLB) writer for low-poly placeholder creatures.
 * Geometry is flat-shaded triangle soup: every triangle carries its own face normal, which
 * gives the faceted look and keeps the writer simple (no index buffers).
 */

export type Vec3 = [number, number, number];

export interface Material {
  color: [number, number, number];
  metallic?: number;
  roughness?: number;
}

export interface Part {
  /** Triangles in local space, 9 numbers per triangle. */
  tris: number[];
  material: Material;
}

// ------------------------------------------------------------------ primitives (unit size)

export function uvSphere(lat = 8, lon = 12): number[] {
  const out: number[] = [];
  const p = (i: number, j: number): Vec3 => {
    const th = (i / lat) * Math.PI;
    const ph = (j / lon) * Math.PI * 2;
    return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
  };
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = p(i, j);
      const b = p(i + 1, j);
      const c = p(i + 1, j + 1);
      const d = p(i, j + 1);
      if (i > 0) out.push(...a, ...d, ...b);
      if (i < lat - 1) out.push(...d, ...c, ...b);
    }
  }
  return out;
}

export function box(): number[] {
  const v = (x: number, y: number, z: number): Vec3 => [x - 0.5, y - 0.5, z - 0.5];
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => [...a, ...b, ...c, ...a, ...c, ...d];
  return [
    ...quad(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)),
    ...quad(v(1, 0, 0), v(0, 0, 0), v(0, 1, 0), v(1, 1, 0)),
    ...quad(v(1, 0, 1), v(1, 0, 0), v(1, 1, 0), v(1, 1, 1)),
    ...quad(v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)),
    ...quad(v(0, 1, 1), v(1, 1, 1), v(1, 1, 0), v(0, 1, 0)),
    ...quad(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)),
  ];
}

/** Base radius 1 at y = 0, apex at y = 1. */
export function cone(seg = 10): number[] {
  const out: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const b = ((i + 1) / seg) * Math.PI * 2;
    const pa: Vec3 = [Math.cos(a), 0, Math.sin(a)];
    const pb: Vec3 = [Math.cos(b), 0, Math.sin(b)];
    out.push(...pa, 0, 1, 0, ...pb); // side
    out.push(...pb, 0, 0, 0, ...pa); // base
  }
  return out;
}

export function torus(tube = 0.12, seg = 18, sides = 6): number[] {
  const out: number[] = [];
  const p = (i: number, j: number): Vec3 => {
    const u = (i / seg) * Math.PI * 2;
    const v = (j / sides) * Math.PI * 2;
    const r = 1 + tube * Math.cos(v);
    return [r * Math.cos(u), tube * Math.sin(v), r * Math.sin(u)];
  };
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < sides; j++) {
      const a = p(i, j);
      const b = p(i + 1, j);
      const c = p(i + 1, j + 1);
      const d = p(i, j + 1);
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  return out;
}

export function octahedron(): number[] {
  const t: Vec3 = [0, 1, 0];
  const bm: Vec3 = [0, -1, 0];
  const ring: Vec3[] = [
    [1, 0, 0],
    [0, 0, 1],
    [-1, 0, 0],
    [0, 0, -1],
  ];
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % 4]!;
    out.push(...a, ...t, ...b, ...b, ...bm, ...a);
  }
  return out;
}

// ------------------------------------------------------------------ transforms

export interface Transform {
  scale?: Vec3;
  /** Euler angles in radians, applied X then Y then Z. */
  rotate?: Vec3;
  translate?: Vec3;
}

export function transform(tris: number[], t: Transform): number[] {
  const [sx, sy, sz] = t.scale ?? [1, 1, 1];
  const [rx, ry, rz] = t.rotate ?? [0, 0, 0];
  const [tx, ty, tz] = t.translate ?? [0, 0, 0];
  const cx = Math.cos(rx),
    snx = Math.sin(rx);
  const cy = Math.cos(ry),
    sny = Math.sin(ry);
  const cz = Math.cos(rz),
    snz = Math.sin(rz);
  const out = new Array<number>(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    let x = tris[i]! * sx;
    let y = tris[i + 1]! * sy;
    let z = tris[i + 2]! * sz;
    [y, z] = [y * cx - z * snx, y * snx + z * cx];
    [x, z] = [x * cy + z * sny, -x * sny + z * cy];
    [x, y] = [x * cz - y * snz, x * snz + y * cz];
    out[i] = x + tx;
    out[i + 1] = y + ty;
    out[i + 2] = z + tz;
  }
  // A negative scale mirrors the triangles; flip their winding so they still face outwards.
  if (sx * sy * sz < 0) {
    for (let i = 0; i < out.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const tmp = out[i + 3 + k]!;
        out[i + 3 + k] = out[i + 6 + k]!;
        out[i + 6 + k] = tmp;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ GLB encoding

function faceNormals(tris: number[]): Float32Array {
  const n = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 9) {
    const ux = tris[i + 3]! - tris[i]!,
      uy = tris[i + 4]! - tris[i + 1]!,
      uz = tris[i + 5]! - tris[i + 2]!;
    const vx = tris[i + 6]! - tris[i]!,
      vy = tris[i + 7]! - tris[i + 1]!,
      vz = tris[i + 8]! - tris[i + 2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (let k = 0; k < 3; k++) {
      n[i + k * 3] = nx;
      n[i + k * 3 + 1] = ny;
      n[i + k * 3 + 2] = nz;
    }
  }
  return n;
}

/** Rounds coordinates so the same input always produces byte-identical files. */
const q = (x: number) => Math.round(x * 1e5) / 1e5;

export function encodeGlb(name: string, parts: Part[]): Uint8Array {
  // Group triangles by material so each material is one primitive.
  const groups = new Map<string, { material: Material; tris: number[] }>();
  for (const p of parts) {
    const key = JSON.stringify(p.material);
    const g = groups.get(key) ?? { material: p.material, tris: [] };
    g.tris.push(...p.tris.map(q));
    groups.set(key, g);
  }

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const materials: object[] = [];
  const primitives: object[] = [];

  const addView = (data: Float32Array) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    bufferViews.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: bytes.byteLength,
      target: 34962,
    });
    chunks.push(bytes);
    offset += bytes.byteLength; // float data is always 4-byte aligned
    return bufferViews.length - 1;
  };

  for (const { material, tris } of groups.values()) {
    const pos = new Float32Array(tris);
    const nrm = faceNormals(tris);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, pos[i + k]!);
        max[k] = Math.max(max[k]!, pos[i + k]!);
      }
    }
    const count = pos.length / 3;
    accessors.push({
      bufferView: addView(pos),
      componentType: 5126,
      count,
      type: 'VEC3',
      min,
      max,
    });
    const posIdx = accessors.length - 1;
    accessors.push({ bufferView: addView(nrm), componentType: 5126, count, type: 'VEC3' });
    const nrmIdx = accessors.length - 1;
    materials.push({
      pbrMetallicRoughness: {
        baseColorFactor: [...material.color, 1],
        metallicFactor: material.metallic ?? 0,
        roughnessFactor: material.roughness ?? 0.8,
      },
    });
    primitives.push({
      attributes: { POSITION: posIdx, NORMAL: nrmIdx },
      material: materials.length - 1,
      mode: 4,
    });
  }

  const json = {
    asset: { version: '2.0', generator: 'nyrgo placeholder generator' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };

  const enc = new TextEncoder();
  let jsonBytes = enc.encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.byteLength + jsonPad).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }
  const total = 12 + 8 + jsonBytes.byteLength + 8 + offset;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonBytes, 20);
  let p = 20 + jsonBytes.byteLength;
  dv.setUint32(p, offset, true);
  dv.setUint32(p + 4, 0x004e4942, true); // 'BIN\0'
  p += 8;
  for (const c of chunks) {
    out.set(c, p);
    p += c.byteLength;
  }
  return out;
}
