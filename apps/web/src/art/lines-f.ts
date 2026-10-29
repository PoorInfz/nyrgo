import { type Draw, brows, label } from './common.js';
import { Painter, crescent, ell, ground, sparkle } from './kit.js';

/* =============================== Legendary and mythic =============================== */

/* Genesaur — the fossil of the first block: a long-necked stone giant carrying block 0 in amber. */
const genesaur: Draw = (id) => {
  const p = new Painter(id, '#1c1917', 5);
  const stone = p.grad('#f5f5f4', '#a8a29e', '#44403c');
  p.glow(128, 130, 124, '#fcd34d', 0.5);
  // tail
  p.part('M186 178 C214 182 234 170 246 150 C246 172 230 196 196 202 Z', stone);
  // legs
  for (const [x, c] of [
    [86, '#78716c'],
    [110, '#a8a29e'],
    [160, '#78716c'],
    [184, '#a8a29e'],
  ] as const) {
    p.part(`M${x - 11} 190 L${x + 11} 190 L${x + 12} 226 L${x - 12} 226 Z`, c);
  }
  // body with block plates
  p.part(ell(138, 176, 66, 36), stone, crescent(138, 176, 66, 36, -10, -12));
  for (const [x, y, s] of [
    [104, 140, 12],
    [130, 132, 14],
    [158, 134, 13],
    [182, 146, 10],
  ] as const) {
    p.part(
      `M${x - s} ${y} L${x} ${y - s} L${x + s} ${y} L${x} ${y + s} Z`,
      p.grad('#e7e5e4', '#78716c'),
    );
  }
  // fossil ribs showing
  for (const x of [118, 136, 154])
    p.line(`M${x} 166 C${x - 4} 180 ${x - 2} 192 ${x + 2} 202`, 3, '#d6d3d1');
  // amber with block 0 inside
  p.part(ell(160, 182, 16, 14), p.grad('#fef3c7', '#f59e0b', '#b45309'));
  p.raw(label(160, 188, 15, '#7c2d12', '0'));
  // long neck and head
  p.part(
    'M84 160 C70 128 64 90 72 60 L94 60 C90 92 96 124 110 152 Z',
    stone,
    'M84 40 L120 40 L120 170 L84 170 Z',
  );
  p.part(
    'M52 62 C52 44 66 34 84 34 C102 34 112 44 112 58 C112 72 100 78 84 78 L62 78 C54 76 52 70 52 62 Z',
    stone,
    crescent(82, 56, 30, 22, -6, -6),
  );
  p.patch('M56 44 C70 40 90 40 104 46', '#86efac');
  p.eye(78, 54, 6, 8, '#f59e0b', -0.6).eye(96, 54, 5, 7, '#f59e0b', -0.6);
  p.line('M58 68 Q72 74 86 68', 3);
  // moss
  p.patch('M100 150 C116 140 140 138 156 146 C138 146 118 150 104 160 Z', '#4ade80');
  return ground(140, 108) + p;
};

/* Halvingon — splits in two every four years and stays whole: two moon halves joined by a glowing seam. */
const halvingon: Draw = (id) => {
  const p = new Painter(id, '#1e1046', 5);
  p.glow(128, 120, 124, '#c4b5fd', 0.7);
  // orbiting "4" marks
  p.raw(
    `<circle cx="128" cy="124" r="98" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-dasharray="4 10"/>`,
  );
  for (const [x, y] of [
    [34, 112],
    [222, 136],
    [128, 26],
    [128, 222],
  ] as const)
    p.raw(label(x, y + 6, 16, '#7c3aed', '4'));
  // wings
  p.part(
    'M84 110 C54 70 22 70 14 92 C30 96 36 108 32 122 C48 120 60 128 62 140 C70 132 80 128 92 130 Z',
    p.grad('#ede9fe', '#a78bfa', '#5b21b6'),
  );
  p.part(
    'M172 110 C202 70 234 70 242 92 C226 96 220 108 224 122 C208 120 196 128 194 140 C186 132 176 128 164 130 Z',
    p.grad('#312e81', '#1e1b4b'),
  );
  // left (light) half and right (dark) half
  p.part(
    'M122 48 C82 50 58 84 58 124 C58 166 86 196 122 200 Z',
    p.grad('#fffbeb', '#fde68a', '#d97706'),
    crescent(118, 124, 60, 76, -10, -8),
  );
  p.part(
    'M134 48 C174 50 198 84 198 124 C198 166 170 196 134 200 Z',
    p.grad('#6366f1', '#312e81', '#0f0a2e'),
  );
  // craters
  p.patch(ell(88, 104, 10, 8), '#f59e0b', 0.35).patch(ell(100, 168, 7, 6), '#f59e0b', 0.35);
  p.patch(ell(170, 98, 9, 7), '#818cf8', 0.4).patch(ell(160, 166, 8, 6), '#818cf8', 0.4);
  // the seam
  p.glow(128, 124, 30, '#fef08a', 0.9);
  p.line('M128 44 L128 204', 4, '#fef9c3');
  // face across both halves
  p.eye(100, 120, 10, 13, '#7c3aed', 0.2).eye(156, 120, 10, 13, '#fde047', -0.2);
  p.line('M112 152 Q122 160 128 152 Q134 160 144 152', 3.5);
  // tail fins below
  p.part('M112 198 L102 226 L122 214 Z', '#fcd34d').part('M144 198 L154 226 L134 214 Z', '#4338ca');
  return ground(128, 60, 238) + p;
};

/* Forkdra — a hydra that grows another head with every disagreement. */
const forkdra: Draw = (id) => {
  const p = new Painter(id, '#082f49', 5);
  const hide = p.grad('#e0f2fe', '#38bdf8', '#075985');
  p.glow(128, 130, 124, '#7dd3fc', 0.6);
  // waves at the base
  p.part(
    'M10 210 Q30 194 50 210 T90 210 T130 210 T170 210 T210 210 T250 210 L250 238 L10 238 Z',
    p.grad('#7dd3fc', '#0369a1'),
  );
  // body
  p.part(ell(128, 196, 64, 34), hide, crescent(128, 196, 64, 34, -10, -10));
  // three necks forking from one trunk
  const neck = (d: string) => p.part(d, hide, 'M0 0 L0 0 Z');
  neck('M104 180 C80 160 56 128 52 96 L74 92 C80 120 98 148 122 166 Z');
  neck('M120 172 C118 140 120 104 128 70 L148 74 C140 106 138 140 142 172 Z');
  neck('M150 166 C174 148 192 120 196 92 L218 98 C212 128 192 160 166 180 Z');
  // fin crests
  for (const [x, y] of [
    [60, 128],
    [128, 108],
    [204, 130],
  ] as const)
    p.part(`M${x - 8} ${y} L${x} ${y - 16} L${x + 8} ${y} Z`, '#a5f3fc');
  // heads, each a little different
  const head = (x: number, y: number, iris: string, mood: 'calm' | 'angry' | 'smug') => {
    p.part(ell(x, y, 26, 21), hide, crescent(x, y, 26, 21, -6, -6));
    p.part(`M${x - 18} ${y - 14} L${x - 24} ${y - 34} L${x - 6} ${y - 20} Z`, '#a5f3fc');
    p.part(`M${x + 18} ${y - 14} L${x + 24} ${y - 34} L${x + 6} ${y - 20} Z`, '#67e8f9');
    p.eye(x - 9, y - 2, 5, 7, iris, 0).eye(x + 9, y - 2, 5, 7, iris, 0);
    if (mood === 'angry') brows(p, x, y - 10, 18, 9, 2);
    if (mood === 'smug')
      p.line(
        `M${x - 14} ${y - 12} L${x - 4} ${y - 10} M${x + 14} ${y - 12} L${x + 4} ${y - 10}`,
        3,
      );
    p.line(`M${x - 8} ${y + 11} Q${x} ${y + (mood === 'angry' ? 8 : 15)} ${x + 8} ${y + 11}`, 3);
  };
  head(58, 86, '#0369a1', 'calm');
  head(138, 62, '#0369a1', 'smug');
  head(212, 90, '#dc2626', 'angry');
  // fork sign between the heads
  p.line('M96 40 L96 24 M96 40 L84 52 M96 40 L108 52', 3.5, '#7dd3fc');
  return ground(128, 104) + p;
};

/* Byzantor — a griffin general who reaches consensus even when a third of the army lies. */
const byzantor: Draw = (id) => {
  const p = new Painter(id, '#1e293b', 5);
  const feathers = p.grad('#ffffff', '#bae6fd', '#38bdf8');
  p.glow(128, 130, 124, '#bae6fd', 0.7);
  // banners behind
  p.line('M40 226 L40 40 M216 226 L216 40', 5, '#78716c');
  p.part('M40 44 L80 50 L72 66 L80 82 L40 78 Z', '#22c55e');
  p.part('M216 44 L176 50 L184 66 L176 82 L216 78 Z', '#22c55e');
  // wings spread
  p.part(
    'M96 120 C66 80 40 74 30 92 C42 98 44 110 40 120 C52 118 60 126 58 138 C70 132 84 132 96 140 Z',
    feathers,
    'M0 112 H256 V160 H0 Z',
    { shade: '#7dd3fc' },
  );
  p.part(
    'M160 120 C190 80 216 74 226 92 C214 98 212 110 216 120 C204 118 196 126 198 138 C186 132 172 132 160 140 Z',
    feathers,
    'M0 112 H256 V160 H0 Z',
    { shade: '#7dd3fc' },
  );
  // lion legs
  p.part('M92 192 L112 192 L112 226 L90 226 Z', '#fbbf24').part(
    'M144 192 L164 192 L166 226 L144 226 Z',
    '#f59e0b',
  );
  // armoured body
  p.part(
    'M86 200 C80 160 96 120 128 118 C160 120 176 160 170 200 C166 214 90 214 86 200 Z',
    p.grad('#f1f5f9', '#94a3b8', '#475569'),
    crescent(128, 166, 42, 50, -10, -6),
  );
  // consensus shield: two thirds agree
  p.part(ell(128, 170, 26, 26), '#e2e8f0');
  p.raw(
    `<path d="M128 170 L128 146 A24 24 0 1 1 107.2 182 Z" fill="#22c55e"/><path d="M128 170 L107.2 182 A24 24 0 0 1 128 146 Z" fill="#ef4444"/>`,
  );
  p.line(ell(128, 170, 24, 24), 3.5);
  p.line('M118 170 L126 178 L140 162', 4, '#ffffff');
  // eagle head with a plumed helmet
  p.part('M128 30 C138 22 160 22 166 34 C154 34 146 40 140 50 Z', '#ef4444');
  p.part(ell(128, 90, 34, 32), feathers, crescent(128, 90, 34, 32, -8, -8));
  p.part(
    'M94 82 C96 58 112 48 128 48 C144 48 160 58 162 82 L152 86 C146 72 138 66 128 66 C118 66 110 72 104 86 Z',
    p.grad('#fde68a', '#d4a72c'),
  );
  p.part('M118 98 L138 98 L128 120 Z', '#f59e0b');
  p.eye(114, 90, 6, 8, '#0369a1', 0).eye(142, 90, 6, 8, '#0369a1', 0);
  brows(p, 128, 80, 28, 12, 2);
  return ground(128, 96) + p;
};

/* Ouroborchain — a serpent of chain links biting its own tail since the genesis block. */
const ouroborchain: Draw = (id) => {
  const p = new Painter(id, '#1e1046', 5);
  p.glow(128, 128, 124, '#c4b5fd', 0.8);
  for (const [x, y, r] of [
    [128, 128, 10],
    [40, 40, 6],
    [222, 214, 7],
    [214, 40, 5],
  ] as const)
    p.raw(sparkle(x, y, r, '#fef3c7'));
  // ring of chain-link segments
  const n = 14;
  for (let i = 1; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = 128 + Math.cos(a) * 82;
    const y = 128 + Math.sin(a) * 82;
    const deg = (a * 180) / Math.PI + 90;
    const s = 1 - i * 0.025;
    p.raw(`<g transform="rotate(${deg.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">`);
    p.part(
      ell(+x.toFixed(1), +y.toFixed(1), 22 * s, 15 * s),
      i % 2 ? p.grad('#ede9fe', '#8b5cf6', '#4c1d95') : p.grad('#fef3c7', '#fbbf24', '#b45309'),
    );
    p.part(ell(+x.toFixed(1), +y.toFixed(1), 11 * s, 6 * s), '#1e1046');
    p.raw('</g>');
  }
  // tail tip going into the mouth
  p.part('M100 50 C108 46 116 46 120 50 L112 58 Z', '#8b5cf6');
  // head at the top, biting the tail
  p.part(
    'M118 20 C142 14 168 24 172 44 C176 62 160 74 140 72 C124 70 112 60 112 46 C112 34 112 24 118 20 Z',
    p.grad('#ede9fe', '#8b5cf6', '#4c1d95'),
    crescent(142, 44, 30, 28, -6, -6),
  );
  p.part('M112 46 C106 44 100 46 98 52 C104 58 112 58 118 54 Z', '#4c1d95');
  p.part('M140 18 L146 4 L152 20 Z', '#fbbf24').part('M158 24 L170 12 L168 30 Z', '#fbbf24');
  p.eye(148, 40, 6, 8, '#fde047', -0.6);
  p.line('M140 32 L154 34', 3);
  // genesis gem in the centre
  p.part('M128 108 L146 128 L128 148 L110 128 Z', p.grad('#ffffff', '#c4b5fd', '#7c3aed'));
  p.raw(label(128, 134, 14, '#1e1046', '0'));
  return p.toString();
};

/* Zeroknowl — an invisible owl whose eyes are perfect zeros: it proves it's there without showing anything. */
const zeroknowl: Draw = (id) => {
  const p = new Painter(id, '#1e0b3d', 5);
  const plum = p.grad('#a78bfa', '#5b21b6', '#2e1065');
  p.raw(
    `<circle cx="128" cy="134" r="104" fill="none" stroke="#c4b5fd" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>`,
  );
  p.glow(128, 134, 112, '#a78bfa', 0.55);
  p.part('M86 128 C50 132 30 182 52 216 C68 200 86 190 100 178 Z', p.grad('#6d28d9', '#2e1065'));
  p.part(
    'M170 128 C206 132 226 182 204 216 C188 200 170 190 156 178 Z',
    p.grad('#6d28d9', '#2e1065'),
  );
  for (const [x, y] of [
    [62, 176],
    [72, 196],
    [192, 172],
    [184, 194],
  ] as const)
    p.raw(sparkle(x, y, 4, '#e9d5ff'));
  p.part('M88 94 L74 50 L114 78 Z', plum);
  p.part('M168 94 L182 50 L142 78 Z', plum);
  p.part(
    'M74 160 C74 104 100 74 128 74 C156 74 182 104 182 160 C182 204 160 226 128 226 C96 226 74 204 74 160 Z',
    plum,
    crescent(128, 150, 54, 76, -10, -6),
  );
  p.patch(ell(128, 180, 30, 38), '#7c3aed', 0.8);
  for (const [x, y] of [
    [116, 166],
    [140, 166],
    [128, 180],
    [116, 194],
    [140, 194],
    [128, 208],
  ] as const) {
    p.line(`M${x - 6} ${y} Q${x} ${y + 6} ${x + 6} ${y}`, 3, '#c4b5fd');
  }
  p.patch(ell(106, 118, 27, 25), '#ddd6fe').patch(ell(150, 118, 27, 25), '#ddd6fe');
  p.line('M128 98 C120 92 92 90 82 108 M128 98 C136 92 164 90 174 108', 3.5);
  for (const x of [106, 150]) {
    p.raw(`<circle cx="${x}" cy="118" r="17" fill="#1d1630"/>`);
    p.glow(x, 118, 16, '#fde047', 0.5);
    p.raw(
      `<ellipse cx="${x}" cy="118" rx="8" ry="11" fill="none" stroke="#fde047" stroke-width="5"/>`,
    );
    p.raw(`<ellipse cx="${x - 6}" cy="110" rx="4" ry="3" fill="#fff"/>`);
  }
  p.part('M120 136 L136 136 L128 150 Z', '#fb923c');
  p.part('M106 222 L100 234 L112 230 L116 236 L120 222 Z', '#fb923c');
  p.part('M136 222 L140 236 L144 230 L156 234 L150 222 Z', '#fb923c');
  return ground(128, 62) + p;
};

export const LINES_F: Record<string, Draw> = {
  genesaur,
  halvingon,
  forkdra,
  byzantor,
  ouroborchain,
  zeroknowl,
};
