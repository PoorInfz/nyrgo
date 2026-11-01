// Development only (town3d-lab.html, not part of the build): figures and the square, for checks.
import * as THREE from 'three';
import { COSMETICS, DEFAULT_AVATAR, type AvatarLook } from '@nyrgo/shared';
import { loadLibrary } from './assets';
import { Figure } from './explorer';

const q = new URLSearchParams(location.search);
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
camera.position.set(0, 5 + rows, 12 + rows * 4.5);
camera.lookAt(0, 1.2, (rows - 1) * 1.5);
const clip = q.get('clip');
const t = Number(q.get('t') ?? 0.4);
const now = performance.now();
const EMOTES = ['wave', 'heart', 'laugh', 'cheer', 'question', 'sad'];
if (clip === 'all') figs.forEach((f, i) => f.emote(EMOTES[i % 6]!, now));
else if (clip) for (const f of figs) f.emote(clip, now);
for (const f of figs) f.update(t, now + t * 1000, Number(q.get('speed') ?? 0));
renderer.render(scene, camera);
document.title = 'done';
