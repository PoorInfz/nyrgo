// Development only (town3d-lab.html, not part of the build): figures and the square, for checks.
import * as THREE from 'three';
import { COSMETICS, DEFAULT_AVATAR, type AvatarLook } from '@nyrgo/shared';
import { loadLibrary } from './assets';
import { Figure } from './explorer';

const q = new URLSearchParams(location.search);
if (q.get('set') === 'heads') {
  const { loadFigures } = await import('./assets');
  const { headPieces } = await import('./explorer');
  (globalThis as { DBG?: boolean }).DBG = true;
  const lib = await loadFigures();
  const r = new THREE.WebGLRenderer({
    canvas: document.getElementById('c') as HTMLCanvasElement,
    antialias: true,
  });
  r.setSize(innerWidth, innerHeight, false);
  const sc = new THREE.Scene();
  sc.background = new THREE.Color('#cfe0ff');
  sc.add(new THREE.HemisphereLight('#fff', '#668', 2));
  const dl = new THREE.DirectionalLight('#fff', 2);
  dl.position.set(2, 4, 5);
  sc.add(dl);
  const heads = ['Knight_Head', 'Mage_Head', 'Rogue_Head', 'Barbarian_Head', 'Rogue_Head_Hooded'];
  const yaw = Number(q.get('rot') ?? 0.5);
  heads.forEach((h, i) => {
    const p = headPieces(lib, h)!;
    const src = lib.parts.get(h)!;
    const face = new THREE.Mesh(p.face, src.material);
    const hair = new THREE.Mesh(p.hair, new THREE.MeshLambertMaterial({ color: '#ff3355' }));
    const alone = new THREE.Mesh(p.skull, new THREE.MeshLambertMaterial({ color: '#33aa55' }));
    for (const [m, row] of [
      [face, 0],
      [hair, 1],
      [alone, 2],
    ] as const) {
      const g = new THREE.Group();
      g.add(m);
      g.add(new THREE.Mesh(p.brows, new THREE.MeshLambertMaterial({ color: '#2244ff' })));
      if (row === 1) g.add(new THREE.Mesh(p.face, src.material));
      g.position.set((i - 2) * 1.6, -row * 1.6 - 1.7, 0);
      g.rotation.y = yaw;
      sc.add(g);
    }
  });
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
  cam.position.set(0, -2.6, 12);
  cam.lookAt(0, -2.6, 0);
  r.render(sc, cam);
  document.title = 'done';
  throw new Error('stop');
}
if (q.get('set') === 'portraits') {
  const { portrait } = await import('./stage');
  const { COSMETICS: C, DEFAULT_AVATAR: D } = await import('@nyrgo/shared');
  await portrait(D, false);
  const t0 = performance.now();
  const outfitIds = C.filter((c) => c.slot === 'outfit').map((c) => c.id);
  await Promise.all(outfitIds.map((o) => portrait({ ...D, outfit: o }, false)));
  console.warn(
    'portraits',
    outfitIds.length,
    'ms each',
    ((performance.now() - t0) / outfitIds.length).toFixed(1),
  );
  document.title = 'done';
  throw new Error('stop');
}
if (q.get('set') === 'square') {
  await import('./lab-square');
  throw new Error('stop');
}
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfe3ff');
scene.add(new THREE.HemisphereLight('#ffffff', '#5a7a4a', 1.6));
const sun = new THREE.DirectionalLight('#fff4dd', 2.2);
sun.position.set(4, 8, 6);
sun.castShadow = true;
scene.add(sun);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshLambertMaterial({ color: '#6cbf5a' }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const lib = await loadLibrary();
const outfits = COSMETICS.filter((c) => c.slot === 'outfit').map((c) => c.id);
const looks: AvatarLook[] = [];
if (q.get('set') === 'outfits')
  for (const o of outfits) looks.push({ ...DEFAULT_AVATAR, outfit: o });
else if (q.get('set') === 'hairs')
  for (const h of [
    'hair_short',
    'hair_buzz',
    'hair_ponytail',
    'hair_long',
    'hair_bun',
    'hair_spiky',
    'hair_curly',
  ])
    looks.push({
      ...DEFAULT_AVATAR,
      hair: h,
      hairColor: q.get('hc') ?? 'hc_brown',
      skin: q.get('skin') ?? 'skin_2',
    });
else {
  const hats = ['hat_none', 'hat_cap', 'hat_beanie', 'hat_explorer', 'hat_leaf', 'hat_crown'];
  const hairs = [
    'hair_short',
    'hair_ponytail',
    'hair_buzz',
    'hair_spiky',
    'hair_bun',
    'hair_long',
    'hair_curly',
  ];
  const tops = [
    'top_tee_teal',
    'top_tee_sun',
    'top_hoodie',
    'top_raincoat',
    'top_track',
    'top_explorer',
    'top_cosmic',
  ];
  const accs = ['acc_none', 'acc_glasses', 'acc_scarf', 'acc_backpack', 'acc_cape'];
  const skins = ['skin_1', 'skin_2', 'skin_3', 'skin_4', 'skin_5'];
  const hcs = ['hc_black', 'hc_brown', 'hc_blond', 'hc_red', 'hc_grey', 'hc_mint', 'hc_violet'];
  for (let i = 0; i < 14; i++)
    looks.push({
      ...DEFAULT_AVATAR,
      hat: hats[i % 6]!,
      hair: hairs[i % 7]!,
      top: tops[(i * 3) % 7]!,
      accessory: accs[i % 5]!,
      skin: skins[i % 5]!,
      hairColor: hcs[(i * 2) % 7]!,
    });
}
if (q.get('only')) {
  const keep = q.get('only')!.split(',').map(Number);
  const picked = keep.map((i) => looks[i]!);
  looks.length = 0;
  looks.push(...picked);
}
const cols = Number(q.get('cols') ?? 7);
const figs = looks.map((l, i) => {
  const f = new Figure(lib, l);
  f.root.position.set(((i % cols) - (cols - 1) / 2) * 2.2, 0, Math.floor(i / cols) * 3);
  f.root.rotation.y = Number(q.get('rot') ?? 0.35);
  scene.add(f.root);
  return f;
});
const rows = Math.ceil(looks.length / cols);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200);
const close = q.get('close') === '1';
camera.position.set(0, close ? 2.6 : 5 + rows, close ? 9 : 12 + rows * 4.5);
camera.lookAt(0, close ? 1.9 : 1.2, close ? 0 : (rows - 1) * 1.5);
const clip = q.get('clip');
const t = Number(q.get('t') ?? 0.4);
const now = performance.now();
const EMOTES = ['wave', 'heart', 'laugh', 'cheer', 'question', 'sad'];
if (clip === 'all') figs.forEach((f, i) => f.emote(EMOTES[i % 6]!, now));
else if (clip) for (const f of figs) f.emote(clip, now);
for (const f of figs) f.update(t, now + t * 1000, Number(q.get('speed') ?? 0));
renderer.render(scene, camera);
document.title = 'done';
