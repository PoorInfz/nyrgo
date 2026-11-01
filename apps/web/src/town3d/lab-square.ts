// Development only: the 3D square with a few players, for screenshots.
import { COSMETICS, DEFAULT_AVATAR, hubMap, type AvatarLook } from '@nyrgo/shared';
import { Town, newBody } from '../hub/engine';
import { TownView3D } from './TownView3D';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const over = document.createElement('canvas');
over.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none';
document.body.appendChild(over);
const room = q.get('room') ?? 'plaza';
const town = new Town(hubMap(room === 'house' ? 'house:lab' : room)!);
if (room === 'house')
  town.furniture = [
    { f: 'sofa-red', x: 300, y: 560, flip: false },
    { f: 'tv', x: 300, y: 430, flip: false },
    { f: 'rug-purple', x: 300, y: 500, flip: false },
    { f: 'aquarium', x: 470, y: 600, flip: false },
    { f: 'plant-flowers', x: 140, y: 600, flip: false },
    { f: 'arcade', x: 520, y: 470, flip: false },
    { f: 'crystal', x: 120, y: 470, flip: false },
    { f: 'bookcase', x: 430, y: 300, flip: false },
    { f: 'clock', x: 560, y: 300, flip: false },
  ];
const outfits = COSMETICS.filter((c) => c.slot === 'outfit' && c.id !== 'outfit_none').map(
  (c) => c.id,
);
const at =
  q.get('at')?.split(',').map(Number) ??
  (room === 'plaza'
    ? [town.map.spawn.x, town.map.spawn.y - 200]
    : [town.map.spawn.x, town.map.spawn.y - 120]);
const me = newBody({
  id: 'me',
  name: 'Rivera',
  level: 12,
  look: { ...DEFAULT_AVATAR, hat: 'hat_cap', accessory: 'acc_backpack' },
  companion: 'blockhound',
  x: at[0]!,
  y: at[1]!,
});
town.bodies.set('me', me);
town.meId = 'me';
const names = ['Lúa', 'Kenji', 'Marta', 'Obi', 'Sofi', 'Theo', 'Ana', 'Iker', 'Noa', 'Zoe'];
const pets = [
  'bearkit',
  'airdragon',
  null,
  'burnlet',
  null,
  'bullcalf',
  null,
  null,
  'coldvault',
  null,
];
for (let i = 0; i < Number(q.get('n') ?? 10); i++) {
  const look: AvatarLook =
    i % 2
      ? { ...DEFAULT_AVATAR, outfit: outfits[(i * 5) % outfits.length]! }
      : {
          ...DEFAULT_AVATAR,
          hair: ['hair_long', 'hair_bun', 'hair_spiky', 'hair_curly', 'hair_short'][i % 5]!,
          top: ['top_tee_sun', 'top_hoodie', 'top_track', 'top_raincoat', 'top_cosmic'][i % 5]!,
          hat: ['hat_none', 'hat_beanie', 'hat_none', 'hat_crown', 'hat_leaf'][i % 5]!,
          skin: `skin_${(i % 5) + 1}`,
        };
  const a = (i / 10) * Math.PI * 2;
  const b = newBody({
    id: `p${i}`,
    name: names[i]!,
    level: 3 + i,
    look,
    companion: pets[i] ?? null,
    x: at[0]! + Math.cos(a) * (90 + (i % 3) * 40),
    y: at[1]! + Math.sin(a) * 70,
  });
  b.facing = i % 2 ? 'l' : 'r';
  if (i === 2) b.bubble = { text: '¡Hola! ¿Alguien para un combate en la arena?', until: Infinity };
  if (i === 5) b.emote = { e: 'heart', until: performance.now() + 2000 };
  town.bodies.set(b.id, b);
}
const view = await TownView3D.create(
  canvas,
  town,
  (q.get('phase') as 'day' | 'dusk' | 'night' | null) ?? undefined,
);
const dpr = 1;
while (!view.canDraw(town.map)) await new Promise((r) => setTimeout(r, 100));
view.rotateBy(Number(q.get('yaw') ?? 0));
view.zoomBy(Number(q.get('zoom') ?? 1));
view.resize(innerWidth, innerHeight, dpr);
over.width = innerWidth;
over.height = innerHeight;
const ctx = over.getContext('2d')!;
// a few frames so the camera settles and the walk cycle plays
const walk = q.get('walk');
let now = performance.now();
for (let i = 0; i < 40; i++) {
  now += 33;
  if (walk) town.input = { x: 0.7, y: -0.7 };
  for (const b of town.bodies.values()) if (!b.trail.length) b.trail.push({ x: b.x, y: b.y });
  town.update(0.033, now);
  view.render(now);
}
await new Promise((r) => setTimeout(r, 1500));
for (let i = 0; i < 5; i++) {
  now += 33;
  town.update(0.033, now);
  view.render(now);
}
ctx.clearRect(0, 0, over.width, over.height);
view.drawOverlay(ctx, dpr, 'me');
const info = view.renderer.info;
console.warn(
  'camera',
  JSON.stringify((view as unknown as { camera: { position: unknown } }).camera.position),
);
document.title = 'done';
console.warn(
  'calls',
  info.render.calls,
  'triangles',
  info.render.triangles,
  'geometries',
  info.memory.geometries,
  'textures',
  info.memory.textures,
);
const t0 = performance.now();
for (let i = 0; i < 20; i++) view.render(now + 33 * (i + 1) + 2000);
console.warn('cpu+swgl ms/frame', ((performance.now() - t0) / 20).toFixed(1));
