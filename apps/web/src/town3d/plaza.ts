import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HUB_SPRITES, TILE, type HubMap, type Placed } from '@nyrgo/shared';
import type { Library } from './assets';
import { flat } from './props';

/**
 * The square in 3D, laid out from the same map the server checks every step against: each
 * building, tree and prop of the drawn square becomes a model standing where the drawing put it,
 * so what blocks the way and where the doors are stay exactly as they were. One world unit is
 * one tile (32 px); x runs east, z south (the map's y), y up.
 */

export const U = (px: number) => px / TILE;

export interface Square {
  group: THREE.Group;
  /** Things that move by themselves (water, the portal, clouds). */
  tick: (t: number) => void;
  /** Where the lamps' lights are, for the evening. */
  lamps: THREE.Vector3[];
  /** Boxes around what is big enough to hide a player (buildings, trees): the camera stays out. */
  colliders: THREE.Box3[];
}

/**
 * A copy of a pack model, its feet on the ground, scaled to `width` units across (x), or to
 * `height` units tall when given.
 */
export function fit(src: THREE.Object3D | undefined, width?: number, height?: number): THREE.Group {
  const g = new THREE.Group();
  if (!src) return g;
  const o = src.clone();
  o.position.set(0, 0, 0);
  const box = new THREE.Box3().setFromObject(o);
  const size = box.getSize(new THREE.Vector3());
  const k = height ? height / Math.max(0.01, size.y) : width ? width / Math.max(0.01, size.x) : 1;
  o.scale.multiplyScalar(k);
  o.position.set(
    -((box.min.x + box.max.x) / 2) * k,
    -box.min.y * k,
    -((box.min.z + box.max.z) / 2) * k,
  );
  g.add(o);
  g.userData.depth = size.z * k;
  g.userData.height = size.y * k;
  g.userData.width = size.x * k;
  return g;
}

/** A town model (see `fit`). */
function model(lib: Library, id: string, width?: number, height?: number): THREE.Object3D {
  return fit(lib.town.get(id), width, height);
}

/** Puts `o` with its base centre on map pixel (x, y). */
export function at<T extends THREE.Object3D>(o: T, x: number, y: number, rotY = 0): T {
  o.position.set(U(x), 0, U(y));
  o.rotation.y = rotY;
  return o;
}

const solidBottom = (p: Placed) =>
  p.solid.length ? Math.max(...p.solid.map((r) => r.y + r.h)) : p.y + HUB_SPRITES[p.sprite].h;

/** A seeded random, so the square looks the same for everyone. */
export function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** A small canvas texture of speckles over a base colour (grass, paths, stone). */
export function speckle(base: string, dots: string[], n: number, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const r = rand(size + n);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = dots[i % dots.length]!;
    const w = 2 + r() * 5;
    ctx.globalAlpha = 0.35 + r() * 0.4;
    ctx.fillRect(r() * size, r() * size, w, w * (0.5 + r()));
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function flowers(seed: number, w: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const r = rand(seed);
  const colors = ['#ff6b8a', '#ffcf4d', '#ffffff', '#9b7bff', '#ff9a3c'];
  const leaf = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.25, 10), flat('#3f9a3a'));
  leaf.scale.set(w / 2, 1, d / 2);
  leaf.position.y = 0.12;
  g.add(leaf);
  const ball = new THREE.IcosahedronGeometry(0.14, 0);
  for (let i = 0; i < Math.round(w * d * 5); i++) {
    const m = new THREE.Mesh(ball, flat(colors[i % colors.length]!));
    const a = r() * Math.PI * 2;
    const rr = Math.sqrt(r());
    m.position.set((Math.cos(a) * rr * w) / 2, 0.3 + r() * 0.12, (Math.sin(a) * rr * d) / 2);
    g.add(m);
  }
  return g;
}

export function board(): THREE.Group {
  const g = new THREE.Group();
  const wood = flat('#8a5a32');
  for (const x of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.18), wood);
    post.position.set(x * 1.0, 1.2, 0);
    g.add(post);
  }
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.3, 0.12), flat('#b9824a'));
  panel.position.set(0, 1.65, 0.02);
  g.add(panel);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.5), flat('#3f6fd8'));
  roof.position.set(0, 2.42, 0.05);
  g.add(roof);
  const papers = ['#ffffff', '#fff3b0', '#cfe9ff', '#ffd6e0'];
  papers.forEach((c, i) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.02), flat(c));
    p.position.set(-0.75 + i * 0.5, 1.68 + (i % 2) * 0.12, 0.1);
    p.rotation.z = (i - 1.5) * 0.06;
    g.add(p);
  });
  return g;
}

function signpost(): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2, 0.16), flat('#7a4a2a'));
  post.position.y = 1;
  const a = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.34, 0.08), flat('#c98f55'));
  a.position.set(0.35, 1.65, 0.06);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.08), flat('#b9824a'));
  b.position.set(-0.3, 1.2, 0.06);
  b.rotation.y = 0.4;
  g.add(post, a, b);
  return g;
}

function arch(width: number): THREE.Group {
  const g = new THREE.Group();
  const wood = flat('#8a5a32');
  for (const x of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), wood);
    post.position.set((x * width) / 2, 1.5, 0);
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, 0.32, 0.4), wood);
  beam.position.y = 3.05;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(width * 0.6, 0.5, 0.1), flat('#ffcf4d'));
  sign.position.set(0, 2.6, 0.18);
  const vines = new THREE.Mesh(new THREE.BoxGeometry(width + 0.9, 0.18, 0.5), flat('#3f9a3a'));
  vines.position.y = 3.26;
  g.add(beam, sign, vines);
  return g;
}

/** The town's emblem on a plinth: a vault turning slowly over the stone. */
function monument(color: string): { g: THREE.Group; spin: THREE.Object3D } {
  const g = new THREE.Group();
  const stone = flat('#b9c0cc');
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.6, 8), stone);
  base.position.y = 0.3;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 1.4, 8), flat('#d5dae3'));
  col.position.y = 1.3;
  const spin = new THREE.Group();
  const vault = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), flat(color, '#103a2a'));
  spin.add(vault);
  spin.position.y = 3;
  g.add(base, col, spin);
  return { g, spin };
}

function fountain(): { g: THREE.Group; water: THREE.Mesh; spray: THREE.Group } {
  const g = new THREE.Group();
  const stone = flat('#c3cad6');
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.7, 16), stone);
  rim.position.y = 0.35;
  const waterMat = new THREE.MeshLambertMaterial({
    color: '#4fc3ff',
    emissive: '#0a3a5a',
    transparent: true,
    opacity: 0.88,
  });
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 0.1, 16), waterMat);
  water.position.y = 0.66;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.6, 8), stone);
  column.position.y = 1.3;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.5, 0.4, 12), stone);
  bowl.position.y = 2.15;
  // the jet and the drops falling back into the bowl
  const jetMat = new THREE.MeshLambertMaterial({
    color: '#d8f6ff',
    emissive: '#3a8ab0',
    transparent: true,
    opacity: 0.75,
  });
  const spray = new THREE.Group();
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.1, 6), jetMat);
  jet.position.y = 2.9;
  spray.add(jet);
  const drop = new THREE.IcosahedronGeometry(0.1, 0);
  for (let i = 0; i < 10; i++) spray.add(new THREE.Mesh(drop, jetMat));
  g.add(rim, water, column, bowl, spray);
  return { g, water, spray };
}

/**
 * The portal back to the map: a glowing circle on the ground with low crystal stones around it
 * and a column of light, low enough that it never hides the players standing beside it.
 */
export function portal(width: number): {
  g: THREE.Group;
  swirl: THREE.Mesh;
  ring: THREE.Mesh;
  beam: THREE.Mesh;
} {
  const g = new THREE.Group();
  const r = width / 2;
  const stone = flat('#7d6bb0');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.1, 6), stone);
    post.position.set(Math.cos(a) * (r + 0.4), 0.55, Math.sin(a) * (r + 0.4));
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), flat('#43f289', '#1a7a4a'));
    cap.position.set(post.position.x, 1.35, post.position.z);
    g.add(post, cap);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.18, 6, 40), flat('#92fde8', '#2ac9a8'));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, '#92fde8');
  grad.addColorStop(0.75, '#7b3fc4');
  grad.addColorStop(1, 'rgba(43,29,92,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(64, 64, 18 + i * 11, i, i + 2.2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const swirl = new THREE.Mesh(
    new THREE.CircleGeometry(r - 0.1, 40),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  swirl.rotation.x = -Math.PI / 2;
  swirl.position.y = 0.1;
  // the light rising from it: see-through, so players behind it still show
  const b = document.createElement('canvas');
  b.width = 4;
  b.height = 64;
  const bctx = b.getContext('2d')!;
  const bg = bctx.createLinearGradient(0, 0, 0, 64);
  bg.addColorStop(0, 'rgba(146,253,232,0)');
  bg.addColorStop(1, 'rgba(146,253,232,0.55)');
  bctx.fillStyle = bg;
  bctx.fillRect(0, 0, 4, 64);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(r - 0.2, r - 0.1, 3.2, 32, 1, true),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(b),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = 1.7;
  g.add(ring, swirl, beam);
  return { g, swirl, ring, beam };
}

/**
 * Joins everything static that shares a material into one mesh (two pack textures and a handful
 * of flat colours): a few dozen draw calls for the whole square instead of thousands.
 */
export function batch(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.live || Array.isArray(m.material)) return;
    const g = m.geometry;
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv'] as const) {
      const a = g.getAttribute(name);
      if (!a) {
        if (name === 'uv')
          out.setAttribute(
            'uv',
            new THREE.Float32BufferAttribute(
              new Float32Array(g.getAttribute('position').count * 2),
              2,
            ),
          );
        continue;
      }
      // the pack's models are quantised (int16): back to floats before moving them
      const arr = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++)
        for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(i, k);
      out.setAttribute(name, new THREE.Float32BufferAttribute(arr, a.itemSize));
    }
    if (!out.getAttribute('normal')) out.computeVertexNormals();
    const idx = g.getIndex();
    if (idx) out.setIndex(Array.from(idx.array as ArrayLike<number>));
    else out.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
    out.applyMatrix4(m.matrixWorld);
    const list = groups.get(m.material) ?? [];
    list.push(out);
    groups.set(m.material, list);
  });
  const result = new THREE.Group();
  for (const [mat, geos] of groups) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    result.add(mesh);
  }
  return result;
}

export function buildSquare(lib: Library, map: HubMap): Square {
  const statics = new THREE.Group();
  const live = new THREE.Group();
  const lamps: THREE.Vector3[] = [];
  const W = U(map.width);
  const D = U(map.height);

  // grass, far past the edges (the camera looks out over the country)
  const grassTex = speckle('#62b04f', ['#7cc95c', '#4f9a40', '#8fd46a', '#3f8a35'], 260);
  grassTex.repeat.set(60, 60);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshLambertMaterial({ map: grassTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(W / 2, 0, D / 2);
  ground.receiveShadow = true;
  ground.userData.live = true;
  live.add(ground);

  // paths
  const pathTex = speckle('#dcc08a', ['#c9a86c', '#efd7a4', '#b8955a'], 200);
  const pathMat = new THREE.MeshLambertMaterial({ map: pathTex });
  for (const p of map.patches) {
    const geo = new THREE.PlaneGeometry(U(p.rect.w), U(p.rect.h));
    // texture in world units, so it lines up from one patch to the next
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (uv.getX(i) * U(p.rect.w)) / 4, (uv.getY(i) * U(p.rect.h)) / 4);
    const m = new THREE.Mesh(geo, pathMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(U(p.rect.x + p.rect.w / 2), 0.02, U(p.rect.y + p.rect.h / 2));
    m.receiveShadow = true;
    m.userData.live = true;
    live.add(m);
  }

  const animated: ((t: number) => void)[] = [];
  const r = rand(7);

  for (const o of map.objects) {
    const s = HUB_SPRITES[o.sprite];
    const cx = o.x + s.w / 2;
    const base = solidBottom(o);
    switch (o.sprite) {
      case 'gym':
      case 'arena':
      case 'market':
      case 'house-red':
      case 'house-blue':
      case 'house-purple': {
        const solid = o.solid[0]!;
        const m = model(lib, o.sprite, U(solid.w) * (o.sprite === 'market' ? 1.05 : 0.98));
        // the front of the building at the bottom of its solid part: the door is right there
        at(
          m,
          solid.x + solid.w / 2,
          (solid.y + solid.h) * 1 - (m.userData.depth as number) * TILE * 0.5,
        );
        statics.add(m);
        break;
      }
      case 'plaza': {
        // the paved square, its fountain, lamps, trees and notice board
        const cxp = o.x + s.w / 2;
        const cyp = o.y + s.h / 2 + 10;
        const stone = speckle('#c9ccd4', ['#b2b6c0', '#dfe2e8', '#a5aab5'], 260);
        stone.repeat.set(5, 5);
        const pave = new THREE.Mesh(
          new THREE.CircleGeometry(U(205), 40),
          new THREE.MeshLambertMaterial({ map: stone }),
        );
        pave.rotation.x = -Math.PI / 2;
        pave.position.set(U(cxp), 0.04, U(cyp));
        pave.receiveShadow = true;
        pave.userData.live = true;
        live.add(pave);
        const edge = new THREE.Mesh(new THREE.RingGeometry(U(205), U(214), 40), flat('#9aa1ad'));
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(U(cxp), 0.05, U(cyp));
        edge.userData.live = true;
        live.add(edge);
        const [basin, l1, l2, l3, l4, treesBL, notice, treesTL, treeTR] = o.solid;
        const c = (rr: { x: number; y: number; w: number; h: number }) =>
          [rr.x + rr.w / 2, rr.y + rr.h / 2] as const;
        const f = fountain();
        at(f.g, ...c(basin!));
        f.water.userData.live = true;
        f.spray.traverse((x) => (x.userData.live = true));
        live.add(f.g);
        animated.push((t) => {
          f.spray.children[0]!.scale.y = 1 + Math.sin(t * 7) * 0.1;
          // each drop flies up from the jet's top and falls in an arc into the bowl
          f.spray.children.slice(1).forEach((d, i) => {
            const k = (t * 0.9 + i / 10) % 1;
            const a = (i / 10) * Math.PI * 2 + t * 0.2;
            const rr = 0.15 + k * 0.75;
            d.position.set(Math.cos(a) * rr, 3.45 + k * 0.5 - k * k * 1.3, Math.sin(a) * rr);
          });
          f.water.position.y = 0.66 + Math.sin(t * 2) * 0.015;
        });
        for (const l of [l1, l2, l3, l4]) {
          const lamp = at(model(lib, 'streetlight', 1.2), l!.x + l!.w / 2, l!.y + l!.h);
          statics.add(lamp);
          lamps.push(new THREE.Vector3(U(l!.x + l!.w / 2), 4, U(l!.y + l!.h)));
        }
        statics.add(at(model(lib, 'trees-b', U(treesBL!.w) * 0.9), ...c(treesBL!)));
        statics.add(at(model(lib, 'trees-a', U(treesTL!.w) * 0.8), ...c(treesTL!)));
        statics.add(at(model(lib, 'trees-small', U(treeTR!.w) * 0.8), ...c(treeTR!)));
        statics.add(at(board(), notice!.x + notice!.w / 2, notice!.y + notice!.h - 10));
        break;
      }
      case 'portal': {
        const p = portal(U(s.w) * 0.62);
        at(p.g, cx, o.y + s.h * 0.62);
        p.g.traverse((x) => (x.userData.live = true));
        live.add(p.g);
        animated.push((t) => {
          p.swirl.rotation.z = -t * 1.4;
          const k = 1 + Math.sin(t * 3) * 0.04;
          p.swirl.scale.set(k, k, 1);
          p.beam.rotation.y = t * 0.3;
          (p.beam.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(t * 2.2) * 0.2;
        });
        break;
      }
      case 'tree-pine':
        statics.add(at(model(lib, 'tree-a', 2.6 + r() * 0.5), cx, base));
        break;
      case 'tree-round':
        statics.add(at(model(lib, 'tree-b', 3 + r() * 0.5), cx, base));
        break;
      case 'tree-cherry': {
        const t = model(lib, 'tree-b', 3.2);
        // a cherry tree: the same tree in blossom
        t.traverse((m) => {
          const mesh = m as THREE.Mesh;
          if (mesh.isMesh) {
            const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
            mat.color = new THREE.Color('#ffb3d1');
            mesh.material = mat;
          }
        });
        statics.add(at(t, cx, base));
        break;
      }
      case 'lamp':
      case 'lamp-tall': {
        statics.add(at(model(lib, 'streetlight', 1.2), cx, base));
        lamps.push(new THREE.Vector3(U(cx), 4, U(base)));
        break;
      }
      case 'bench':
      case 'bench-wood':
        statics.add(at(model(lib, 'bench', U(s.w) * 0.9), cx, base - 8));
        break;
      case 'banner-blue':
        statics.add(at(model(lib, 'flag', undefined, 3.4), cx, base));
        break;
      case 'board':
        statics.add(at(board(), cx, base - 6));
        break;
      case 'well':
        statics.add(at(model(lib, 'well', 2.4), cx, base - 10));
        break;
      case 'bush':
        statics.add(
          at(model(lib, 'bush', 1.6), cx - 12, base - 6),
          at(model(lib, 'bush', 1.3), cx + 14, base - 4),
        );
        break;
      case 'hedge':
        for (let i = 0; i < 5; i++)
          statics.add(at(model(lib, 'bush', 1.5), o.x + 18 + i * ((s.w - 36) / 4), base - 14));
        break;
      case 'flowers':
      case 'flower-pot':
      case 'flower-bed':
      case 'flower-box':
      case 'planter':
        statics.add(
          at(
            flowers(
              o.x + o.y,
              Math.max(1, U(s.w) * 0.85),
              Math.max(0.8, U(Math.min(s.h, 50)) * 0.8),
            ),
            cx,
            base - 12,
          ),
        );
        break;
      case 'statue':
      case 'statue-knight': {
        const m = monument(o.sprite === 'statue' ? '#43f289' : '#9b7bff');
        at(m.g, cx, base - 18);
        m.spin.userData.live = true;
        m.spin.traverse((x) => (x.userData.live = true));
        live.add(m.g);
        animated.push((t) => {
          m.spin.rotation.y = t * 0.9;
          m.spin.position.y = 3 + Math.sin(t * 1.6) * 0.15;
        });
        break;
      }
      case 'trophy': {
        const cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.15, 0.6, 10),
          flat('#ffcf4d', '#3a2a00'),
        );
        cup.position.y = 1.3;
        const ped = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.8), flat('#b9c0cc'));
        ped.position.y = 0.5;
        const g = new THREE.Group();
        g.add(cup, ped);
        statics.add(at(g, cx, base - 6));
        break;
      }
      case 'umbrella':
        statics.add(at(model(lib, 'tent', 2.2), cx, base - 10));
        break;
      case 'pond': {
        const water = new THREE.Mesh(
          new THREE.CircleGeometry(1, 24),
          new THREE.MeshLambertMaterial({ color: '#4fb8ff', emissive: '#0a3050' }),
        );
        water.rotation.x = -Math.PI / 2;
        water.scale.set(U(s.w) * 0.45, U(s.h) * 0.45, 1);
        water.position.set(U(cx), 0.05, U(o.y + s.h / 2));
        water.userData.live = true;
        live.add(water);
        statics.add(at(model(lib, 'waterlily', 0.9), cx - 20, o.y + s.h / 2));
        statics.add(at(model(lib, 'waterlily', 0.7), cx + 30, o.y + s.h / 2 + 10));
        statics.add(
          at(model(lib, 'rock-a', 1.2), o.x + 10, base - 10),
          at(model(lib, 'rock-c', 1), o.x + s.w - 10, o.y + 20),
        );
        break;
      }
      case 'signpost':
        statics.add(at(signpost(), cx, base - 6));
        break;
      case 'arch':
        statics.add(at(arch(U(s.w) - 1.2), cx, base - 8));
        break;
      case 'vending':
        statics.add(
          at(model(lib, 'crates', 1.3), cx, base - 8),
          at(model(lib, 'barrel', 0.7), cx + 18, base + 4),
        );
        break;
      case 'first-aid':
        statics.add(
          at(model(lib, 'tent', 1.8), cx, base - 10),
          at(model(lib, 'flag-red', undefined, 2.8), cx + 24, base),
        );
        break;
      default:
        break;
    }
  }

  // the country around the town: hills, a mill, a church and mountains far off
  const around: [string, number, number, number, number][] = [
    ['windmill', -6, 6, 6, 0.6],
    ['tavern', W + 6, 10, 6, -0.7],
    ['church', -7, D - 6, 6, 0.5],
    ['blacksmith', W + 6, D - 8, 6, -0.5],
    ['house-green', -5, D / 2 + 2, 4.5, 1.4],
    ['house-blue', W + 5, D / 2, 4.2, -1.5],
    ['hills-trees', W / 2, -34, 40, 0],
    ['hills-b', -34, D / 2, 40, 1.2],
    ['hills-trees', W + 34, D / 2, 40, -1.0],
    ['mountain', W / 2 - 30, -70, 70, 0.2],
    ['mountain-b', W / 2 + 36, -76, 76, -0.3],
    ['trees-b', -3, -3, 6, 0],
    ['trees-a', W + 3, -2, 6, 0],
    ['trees-b', W + 4, D + 4, 7, 0.4],
    ['trees-a', -4, D + 4, 7, 0.3],
    ['trees-small', W / 2 - 14, D + 6, 6, 0],
    ['trees-small', W / 2 + 14, D + 6, 6, 0],
  ];
  for (const [id, x, z, w, rot] of around) {
    const m = model(lib, id, w);
    m.position.set(x, 0, z);
    m.rotation.y = rot;
    statics.add(m);
  }
  // a wooden fence where the walkable square ends
  for (let x = 1.6; x < W; x += 3.3) {
    for (const z of [0.15, D - 0.15]) {
      if (z > 1 && Math.abs(x - U(map.spawn.x)) < 5) continue;
      const f = model(lib, 'fence-wood', 0.3);
      f.rotation.y = Math.PI / 2;
      f.position.set(x, 0, z);
      statics.add(f);
    }
  }

  // clouds drift by
  const clouds = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const c = model(lib, i % 2 ? 'cloud' : 'cloud-small', 6 + r() * 6);
    c.position.set(r() * (W + 60) - 30, 16 + r() * 8, r() * (D + 40) - 40);
    c.traverse((m) => (m.userData.live = true));
    clouds.add(c);
  }
  live.add(clouds);
  animated.push((t) => {
    clouds.children.forEach((c, i) => {
      c.position.x = ((((i * 23 + t * (0.6 + (i % 3) * 0.2)) % (W + 80)) + W + 80) % (W + 80)) - 40;
    });
  });

  statics.updateMatrixWorld(true);
  const colliders: THREE.Box3[] = [];
  for (const child of statics.children) {
    const box = new THREE.Box3().setFromObject(child);
    const size = box.getSize(new THREE.Vector3());
    // the solid body, not the eaves, steps and props around it
    if (size.y > 2.5 && Math.min(size.x, size.z) > 1.2)
      colliders.push(box.expandByVector(new THREE.Vector3(-size.x * 0.12, 0, -size.z * 0.12)));
  }
  const group = new THREE.Group();
  group.add(batch(statics), live);
  return { group, tick: (t) => animated.forEach((a) => a(t)), lamps, colliders };
}
