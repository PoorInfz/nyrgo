import { type Draw, GOLD, brows, coin, feet, label } from './common.js';
import { Painter, crescent, ell, ground, sparkle } from './kit.js';

/* =============================== Gas: blue-violet burner flames =============================== */

const GAS = ['#eef2ff', '#a5b4fc', '#6366f1'] as const;

/* Gwisp — a floating wisp of gas flame holding the toll token it charges for every step. */
const gwisp: Draw = (id) => {
  const p = new Painter(id, '#3b2a8c');
  p.glow(128, 150, 100, '#a5b4fc', 0.55);
  for (const [x, y, r] of [
    [58, 110, 9],
    [204, 90, 7],
    [212, 168, 6],
  ] as const)
    p.raw(sparkle(x, y, r, '#818cf8'));
  const body =
    'M128 212 C92 212 72 188 74 158 C76 132 92 118 96 96 C104 108 110 114 114 110 C112 88 118 66 134 44 C134 70 146 82 152 94 C158 84 160 74 158 62 C176 84 186 114 184 156 C184 190 162 212 128 212 Z';
  p.part(body, p.grad(...GAS), crescent(132, 140, 66, 92, -14, -8));
  p.patch(
    'M128 202 C104 202 92 186 94 166 C96 148 108 140 112 126 C120 138 128 140 132 132 C140 144 160 152 160 170 C160 190 148 202 128 202 Z',
    '#ffffff',
    0.35,
  );
  p.gloss(102, 128, 10, 5);
  p.eye(110, 156, 11, 14, '#8b5cf6', 0.3).eye(148, 156, 11, 14, '#8b5cf6', 0.3);
  p.blush(92, 176, 7).blush(166, 176, 7);
  p.openMouth(129, 178, 14);
  coin(p, 128, 204, 14);
  p.part(ell(110, 202, 7, 6), '#818cf8').part(ell(146, 202, 7, 6), '#818cf8');
  return ground(128, 40, 236) + p;
};

/* Gasguzzle — a plump burner flame that drinks the whole network from a fuel can when there's a rush. */
const gasguzzle: Draw = (id) => {
  const p = new Painter(id, '#312a7a');
  p.glow(128, 150, 108, '#a5b4fc', 0.55);
  feet(p, 102, 152, 224, 17, 9, '#4f46e5');
  const body =
    'M128 224 C80 224 58 198 60 162 C62 132 78 118 86 96 C94 108 100 112 106 108 C102 86 110 62 128 40 C130 64 140 76 148 88 C154 76 156 64 154 52 C176 76 192 116 190 160 C190 200 168 224 128 224 Z';
  p.part(body, p.grad(...GAS), crescent(130, 146, 72, 100, -14, -8));
  p.patch(ell(124, 190, 38, 28), '#ffffff', 0.3);
  p.line('M100 194 Q124 206 150 194', 3, '#4338ca');
  p.gloss(96, 120, 11, 6);
  // greedy half-lidded eyes
  p.eye(104, 148, 10, 12, '#8b5cf6', 0.5).eye(140, 148, 10, 12, '#8b5cf6', 0.5);
  p.part('M92 142 C96 136 112 136 116 142 L116 134 L92 134 Z', '#a5b4fc', undefined, {
    outline: false,
  });
  p.part('M128 142 C132 136 148 136 152 142 L152 134 L128 134 Z', '#a5b4fc', undefined, {
    outline: false,
  });
  p.line('M92 142 C98 137 110 137 116 142 M128 142 C134 137 146 137 152 142', 4);
  p.blush(90, 168, 8).blush(156, 168, 8);
  p.part(ell(140, 170, 6, 7), '#5b1f33');
  // fuel can held up to the side
  p.part(
    'M164 140 L204 140 C210 140 212 144 212 150 L214 206 C214 212 210 216 204 216 L170 216 C164 216 160 212 160 206 L160 146 C160 142 162 140 164 140 Z',
    p.grad('#fca5a5', '#ef4444', '#b91c1c'),
    'M196 130 L230 130 L230 230 L196 230 Z',
  );
  p.part('M172 140 L172 128 L196 128 L196 140', 'none');
  p.line('M168 160 L206 200 M206 160 L168 200', 3.5, '#7f1d1d');
  // straw from the can to its mouth
  p.line('M186 140 L186 112 C186 100 168 100 156 116 L146 140', 7, '#312a7a').line(
    'M186 140 L186 112 C186 100 168 100 156 116 L146 140',
    3.5,
    '#f9fafb',
  );
  // arm holding the can
  p.part(ell(168, 172, 11, 10), '#818cf8');
  return ground(132, 78) + p;
};

/* Gaswarlord — the lord of fees, crowned in burner flames; raises the price when he sees a queue. */
const gaswarlord: Draw = (id) => {
  const p = new Painter(id, '#1e1b4b', 5);
  p.glow(128, 140, 120, '#818cf8', 0.6);
  // flame cape
  p.part(
    'M40 226 C34 182 42 140 60 110 C64 128 70 134 78 134 C72 106 82 76 100 56 C102 80 112 90 122 92 L134 92 C144 90 154 80 156 56 C174 76 184 106 178 134 C186 134 192 128 196 110 C214 140 222 182 216 226 Z',
    p.grad('#c7d2fe', '#6366f1', '#3730a3'),
    'M0 170 L256 120 V256 H0 Z',
  );
  // nozzle sceptre
  p.part('M196 72 L204 72 L206 228 L194 228 Z', p.grad('#fde68a', '#d4a72c'));
  p.part('M184 60 C184 48 216 48 216 60 L214 76 L186 76 Z', '#334155');
  p.part('M196 48 L204 48 L208 30 L192 30 Z', '#475569');
  // body
  p.part(
    'M88 226 C80 190 84 150 96 132 C102 116 112 108 128 108 C144 108 154 116 160 132 C172 150 176 190 168 226 Z',
    p.grad('#a5b4fc', '#4f46e5', '#312e81'),
    crescent(128, 170, 50, 70, -12, -8),
  );
  p.patch('M110 226 C106 196 112 170 128 166 C144 170 150 196 146 226 Z', '#c7d2fe', 0.45);
  // armour with a toll gate on the chest
  p.part(ell(84, 142, 24, 18), p.grad('#475569', '#1e293b'));
  p.part(ell(172, 142, 24, 18), p.grad('#475569', '#1e293b'));
  p.line('M64 140 Q84 128 104 140 M152 140 Q172 128 192 140', 3, '#fbbf24');
  p.part('M112 150 L144 150 L144 176 L112 176 Z', '#1e293b');
  p.line('M106 162 L150 162', 5, '#ef4444').line('M106 162 L150 162', 1.5, '#ffffff');
  // fist on the sceptre
  p.part(ell(196, 160, 13, 12), '#6366f1');
  p.part(ell(64, 176, 13, 14), '#6366f1');
  // price tag hanging from its belt
  p.line('M74 190 L80 200', 2.5);
  p.part('M62 198 L92 198 L98 210 L92 222 L62 222 Z', '#fef3c7');
  p.raw(label(78, 216, 13, '#b91c1c', '+%'));
  // head with burner-flame crown
  p.part(
    'M100 82 C94 64 100 50 108 42 C110 56 116 60 120 62 C118 48 124 34 132 26 C134 42 140 50 144 56 C148 46 152 40 158 36 C162 54 160 70 154 82 Z',
    p.grad('#e0f2fe', '#38bdf8', '#2563eb'),
  );
  p.part(
    ell(128, 100, 34, 28),
    p.grad('#c7d2fe', '#6366f1', '#3730a3'),
    crescent(128, 100, 34, 28, -8, -8),
  );
  p.eye(114, 100, 7, 8, '#fde047', 0.2).eye(142, 100, 7, 8, '#fde047', 0.2);
  brows(p, 128, 88, 28, 16, 4);
  p.line('M116 118 Q128 112 140 118', 3.5);
  return ground(128, 96) + p;
};

/* ================================= Burn: embers and furnaces ================================= */

const EMBER = ['#fdba74', '#f97316', '#dc2626'] as const;
const FLAME = ['#fef08a', '#fb923c', '#ef4444'] as const;

/* Burnlet — a walking ember that nibbles a bit of itself to be worth more. */
const burnlet: Draw = (id) => {
  const p = new Painter(id, '#7c1d0b');
  p.glow(128, 140, 104, '#fdba74', 0.5);
  for (const [x, y, r] of [
    [54, 96, 4],
    [204, 72, 5],
    [196, 124, 3],
    [64, 150, 3],
  ] as const)
    p.part(ell(x, y, r, r), '#fde047', undefined, { outline: false });
  p.part(
    'M84 128 C70 100 82 70 98 58 C98 76 106 84 112 86 C108 62 120 36 140 24 C136 48 148 62 156 72 C160 60 164 52 172 46 C180 70 186 100 170 128 Z',
    p.grad(...FLAME),
  );
  p.patch(
    'M104 124 C98 106 104 92 112 86 C114 98 122 104 128 104 C126 90 132 76 142 66 C142 84 152 94 156 106 C160 112 158 120 154 124 Z',
    '#fef9c3',
    0.85,
  );
  feet(p, 106, 150, 222, 15, 9, '#b91c1c');
  p.part(ell(128, 168, 54, 50), p.grad(...EMBER), crescent(128, 168, 54, 50, -12, -10));
  p.line('M92 186 L102 194 L98 204', 3, '#fde047').line('M160 190 L152 198 L158 206', 3, '#fde047');
  p.gloss(104, 140, 14, 7);
  p.eye(110, 164, 10, 13, '#facc15', -0.2).eye(146, 164, 10, 13, '#facc15', -0.2);
  p.blush(92, 184).blush(162, 184);
  p.line('M118 186 Q128 194 138 186', 4);
  p.part('M126 188 L130 196 L134 188 Z', '#ffffff');
  p.part(ell(76, 176, 10, 13), '#f97316').part(ell(180, 178, 10, 13), '#ea580c');
  return ground(128, 70) + p;
};

/* Embernomic — a burning economist in round glasses, whose charts only ever go up. */
const embernomic: Draw = (id) => {
  const p = new Painter(id, '#7c1d0b');
  p.glow(140, 140, 110, '#fdba74', 0.5);
  // chart board on an easel
  p.line('M42 228 L58 168 M98 228 L82 168', 5, '#78350f');
  p.part('M24 74 L116 74 L116 168 L24 168 Z', '#fffbeb');
  p.line('M34 156 L34 86 M34 156 L106 156', 2.5, '#94a3b8');
  p.line('M38 148 L56 136 L70 140 L86 116 L102 92', 4.5, '#16a34a');
  p.part('M94 90 L106 86 L104 100 Z', '#16a34a', undefined, { outline: false });
  p.raw(label(70, 90, 11, '#16a34a', '+∞'));
  // flame hair
  p.part(
    'M106 110 C92 84 104 56 120 44 C120 62 128 70 134 72 C130 48 142 24 162 12 C158 36 170 50 178 60 C182 48 188 40 196 34 C204 60 208 90 192 112 Z',
    p.grad(...FLAME),
  );
  p.patch(
    'M126 108 C120 92 126 80 134 74 C138 88 146 90 150 92 C150 78 156 66 164 58 C166 76 176 86 178 98 C180 104 178 110 174 112 Z',
    '#fef9c3',
    0.85,
  );
  // body: a taller ember with a little tie
  feet(p, 128, 172, 224, 15, 9, '#b91c1c');
  const body =
    'M150 226 C112 226 98 200 100 168 C102 130 122 104 150 104 C178 104 198 130 200 168 C202 200 188 226 150 226 Z';
  p.part(body, p.grad(...EMBER), crescent(150, 162, 50, 64, -12, -10));
  p.patch(ell(150, 196, 26, 24), '#fed7aa', 0.6);
  p.part('M144 170 L156 170 L160 200 L150 210 L140 200 Z', '#1e3a8a');
  p.part('M142 162 L158 162 L154 172 L146 172 Z', '#1e40af');
  p.gloss(124, 128, 13, 7);
  // round glasses
  p.eye(134, 140, 9, 11, '#facc15', -0.6).eye(166, 140, 9, 11, '#facc15', -0.6);
  p.line(
    `${ell(134, 140, 15, 15)} ${ell(166, 140, 15, 15)} M149 140 L151 140 M119 136 L106 130`,
    3.5,
  );
  p.blush(120, 160, 6).blush(180, 160, 6);
  p.line('M142 162 Q150 156 158 160', 0.1);
  // arm with a pointer stick towards the chart
  p.line('M108 168 L64 120', 3.5, '#78350f');
  p.part(ell(106, 170, 11, 10), '#f97316');
  p.part(ell(198, 178, 10, 13), '#ea580c');
  return ground(140, 84) + p;
};

/* Deflagron — a furnace dragon that burns whole reserves just to impress. Four-legged, horned,
   with a glowing grate in its chest and burning coins rising off its back. */
const deflagron: Draw = (id) => {
  const p = new Painter(id, '#2a0707', 5);
  const hide = p.grad('#f87171', '#b91c1c', '#450a0a');
  p.glow(128, 140, 120, '#fb923c', 0.55);
  // burning coins drifting up
  for (const [x, y, r] of [
    [176, 54, 9],
    [204, 82, 7],
    [150, 34, 6],
  ] as const) {
    p.glow(x, y, r * 2.4, '#f97316', 0.7);
    coin(p, x, y, r);
  }
  // tail with a spiked tip
  p.part(
    'M180 188 C214 194 232 172 226 144 L244 128 L236 156 C240 194 210 214 176 206 Z',
    hide,
    'M0 200 L256 150 V256 H0 Z',
  );
  // far legs
  p.part('M174 200 L196 200 L198 226 L174 226 Z', '#7f1d1d');
  p.part('M96 200 L116 200 L114 226 L94 226 Z', '#7f1d1d');
  // body
  p.part(ell(148, 178, 64, 40), hide, crescent(148, 178, 64, 40, -10, -12));
  // back plates
  for (const [x, y] of [
    [120, 140],
    [146, 136],
    [172, 140],
    [196, 150],
  ] as const) {
    p.part(`M${x - 10} ${y + 6} L${x} ${y - 16} L${x + 10} ${y + 6} Z`, '#fbbf24');
  }
  // near legs with claws
  p.part('M150 204 L174 204 L176 230 L148 230 Z', hide);
  p.part('M76 200 L100 200 L102 230 L74 230 Z', hide);
  p.line(
    'M80 230 L80 224 M88 230 L88 224 M96 230 L96 224 M154 230 L154 224 M162 230 L162 224 M170 230 L170 224',
    2.5,
    '#fde68a',
  );
  // neck and chest furnace
  p.part(
    'M88 186 C80 160 82 130 96 108 L122 118 C114 140 116 160 128 182 Z',
    hide,
    'M110 100 L140 100 L140 200 L110 200 Z',
  );
  p.part(ell(106, 176, 22, 24), '#1f0a0a');
  p.raw(`<ellipse cx="106" cy="176" rx="18" ry="20" fill="#fb923c"/>`);
  p.glow(106, 176, 26, '#fde047', 0.8);
  p.line('M94 164 L118 164 M92 176 L120 176 M94 188 L118 188', 3.5, '#1f0a0a');
  // ember mane
  p.part('M120 110 L132 98 L126 116 L140 110 L130 126 L142 126 L126 138 Z', '#f97316');
  // head, snout to the left
  p.part(
    'M44 102 C46 82 66 70 92 72 C112 74 124 88 120 108 C116 124 96 130 74 126 L54 124 C42 122 40 110 44 102 Z',
    hide,
    crescent(84, 96, 40, 28, -6, -8),
  );
  p.part('M98 74 L130 48 L112 84 Z', '#fde68a').part('M110 80 L144 66 L120 92 Z', '#fcd34d');
  p.eye(90, 94, 7, 9, '#facc15', -0.6);
  p.line('M78 84 L98 88', 4.5);
  p.part(ell(52, 104, 3, 2.5), '#1f0a0a');
  p.line('M50 116 Q70 122 92 116', 3.5);
  p.part('M62 118 L66 126 L70 118 Z', '#ffffff');
  // smoke from the nostrils
  p.raw(
    `<circle cx="36" cy="88" r="7" fill="#9ca3af" opacity="0.6"/><circle cx="26" cy="74" r="5" fill="#9ca3af" opacity="0.45"/>`,
  );
  return ground(140, 100) + p;
};

/* ============================== Liquidity: sea life and coins ============================== */

const SEA = ['#e0f2fe', '#38bdf8', '#0369a1'] as const;

/* Shrimpie — a tiny shrimp with four coins and a lot of faith. */
const shrimpie: Draw = (id) => {
  const p = new Painter(id, '#8a2c1c');
  const shell = p.grad('#ffd4c2', '#fb8c6b', '#ef5a3c');
  p.glow(128, 150, 96, '#7dd3fc', 0.45);
  for (const [x, y, r] of [
    [200, 60, 8],
    [216, 92, 5],
    [188, 34, 4],
  ] as const)
    p.raw(
      `<circle cx="${x}" cy="${y}" r="${r}" fill="#e0f2fe" stroke="#38bdf8" stroke-width="2.5"/>`,
    );
  p.line('M86 96 C70 60 96 30 130 34', 3.5).line('M98 90 C96 56 132 42 160 52', 3.5);
  p.part('M150 214 C138 230 116 232 104 222 C118 218 124 210 128 204 Z', shell);
  p.part('M152 216 C166 232 190 230 198 216 C182 214 172 208 166 200 Z', shell);
  for (const [x, y, rx, ry] of [
    [156, 196, 22, 20],
    [170, 168, 25, 23],
    [158, 138, 28, 26],
  ] as const) {
    p.part(ell(x, y, rx, ry), shell, crescent(x, y, rx, ry, -6, -6));
    p.line(
      `M${x - rx * 0.6} ${y + ry * 0.55} Q${x} ${y + ry * 0.95} ${x + rx * 0.6} ${y + ry * 0.55}`,
      2.5,
      '#fff1ea',
    );
  }
  for (const x of [118, 132, 146]) p.line(`M${x} 160 L${x - 6} 176`, 3.5);
  p.part(ell(106, 124, 40, 36), shell, crescent(106, 124, 40, 36));
  p.part('M76 104 L60 92 L82 96 Z', '#fb8c6b');
  p.gloss(92, 104, 10, 5);
  p.eye(94, 124, 9, 12, '#0ea5e9', -0.4).eye(126, 122, 9, 12, '#0ea5e9', -0.4);
  p.blush(84, 144, 6).blush(132, 142, 6);
  p.line('M100 144 Q108 150 116 143', 3.5);
  for (let i = 0; i < 4; i++) {
    const y = 222 - i * 9;
    p.part(`M44 ${y} A20 7 0 0 0 84 ${y} L84 ${y - 6} A20 7 0 0 0 44 ${y - 6} Z`, '#e3a92f');
    p.part(ell(64, y - 6, 20, 7), GOLD);
  }
  return ground(124, 84) + p;
};

/* Crabwalk — a crab that only walks sideways, like the price in summer. */
const crabwalk: Draw = (id) => {
  const p = new Painter(id, '#0c3a5c');
  const shell = p.grad(...SEA);
  p.glow(128, 150, 108, '#7dd3fc', 0.45);
  // sideways motion lines and a flat little chart
  p.line('M18 150 L40 150 M14 170 L34 170 M22 190 L40 190', 3.5, '#7dd3fc');
  p.line('M180 40 L200 40 L212 42 L224 39 L240 41', 3.5, '#94a3b8');
  // legs
  for (const [s, x] of [
    [-1, 86],
    [-1, 96],
    [-1, 108],
    [1, 148],
    [1, 160],
    [1, 170],
  ] as const) {
    p.line(`M${x} 180 L${x + s * 22} 196 L${x + s * 26} 222`, 7);
    p.line(`M${x} 180 L${x + s * 22} 196 L${x + s * 26} 222`, 3, '#38bdf8');
  }
  // claws on arms
  p.line('M84 158 L56 138 M172 158 L200 138', 8).line(
    'M84 158 L56 138 M172 158 L200 138',
    4,
    '#38bdf8',
  );
  const claw = (x: number, y: number, s: number) =>
    p.part(
      `M${x} ${y + 16} C${x - s * 22} ${y + 10} ${x - s * 26} ${y - 22} ${x - s * 6} ${y - 32} L${x + s * 2} ${y - 14} L${x + s * 16} ${y - 26} C${x + s * 24} ${y - 8} ${x + s * 18} ${y + 14} ${x} ${y + 16} Z`,
      shell,
    );
  claw(52, 128, 1);
  claw(204, 128, -1);
  coin(p, 204, 100, 11);
  // eye stalks
  p.line('M112 142 L106 104 M144 142 L150 104', 7).line(
    'M112 142 L106 104 M144 142 L150 104',
    3,
    '#38bdf8',
  );
  p.part(ell(104, 98, 13, 13), '#ffffff').eye(104, 98, 8, 10, '#0369a1', 0.2);
  p.part(ell(152, 98, 13, 13), '#ffffff').eye(152, 98, 8, 10, '#0369a1', 0.2);
  // shell
  p.part(
    'M66 168 C66 136 94 124 128 124 C162 124 190 136 190 168 C190 196 162 206 128 206 C94 206 66 196 66 168 Z',
    shell,
    crescent(128, 166, 62, 42, -10, -10),
  );
  for (const [x, y] of [
    [104, 148],
    [128, 140],
    [152, 148],
  ] as const)
    p.patch(ell(x, y, 6, 5), '#e0f2fe', 0.7);
  p.gloss(98, 142, 14, 5);
  p.blush(96, 180, 7).blush(160, 180, 7);
  p.line('M112 182 Q128 194 144 182', 4);
  return ground(128, 96) + p;
};

/* Leviawhale — a whale so large the ocean trembles when it moves; gold coins instead of barnacles. */
const leviawhale: Draw = (id) => {
  const p = new Painter(id, '#0c3a5c', 5);
  p.glow(132, 150, 120, '#7dd3fc', 0.5);
  const hide = p.grad('#bae6fd', '#38bdf8', '#0369a1');
  p.part(
    'M56 170 C34 162 18 136 26 110 C40 122 48 132 54 140 C56 122 70 106 88 102 C84 128 76 152 62 176 Z',
    p.grad('#7dd3fc', '#0284c7'),
  );
  p.part(
    'M168 92 C164 72 150 62 136 58 C152 52 164 60 170 72 C174 58 188 48 204 50 C188 58 178 72 176 92 Z',
    '#bae6fd',
  );
  for (const [x, y] of [
    [128, 44],
    [214, 38],
    [170, 26],
  ] as const) {
    p.part(
      `M${x} ${y - 10} C${x + 4} ${y - 2} ${x + 7} ${y + 2} ${x + 4} ${y + 6} C${x + 1} ${y + 9} ${x - 6} ${y + 7} ${x - 5} ${y + 1} C${x - 4} ${y - 2} ${x - 2} ${y - 5} ${x} ${y - 10} Z`,
      '#7dd3fc',
    );
  }
  p.part(
    'M44 168 C44 116 98 88 152 90 C206 92 232 130 228 170 C224 208 186 224 136 224 C88 224 44 210 44 168 Z',
    hide,
    crescent(136, 158, 92, 66, -8, -14),
  );
  p.patch(
    'M70 196 C100 222 188 226 218 188 C204 214 170 224 136 224 C106 224 84 214 70 196 Z',
    '#f0f9ff',
  );
  for (const x of [104, 128, 152, 176]) p.line(`M${x} 209 L${x + 2} 220`, 3, '#7dd3fc');
  p.gloss(116, 112, 24, 9, -12);
  for (const [x, y, r] of [
    [98, 104, 9],
    [124, 94, 7],
    [80, 120, 6],
  ] as const)
    coin(p, x, y, r);
  p.part(
    'M118 192 C108 212 116 232 140 228 C146 214 142 200 132 192 Z',
    p.grad('#7dd3fc', '#0284c7'),
  );
  p.eye(180, 150, 9, 12, '#0369a1', 0.6).eye(208, 148, 7, 10, '#0369a1', 0.6);
  p.blush(172, 172, 8).blush(214, 168, 6);
  p.line('M188 176 Q202 186 220 172', 4);
  return ground(130, 98) + p;
};

export const LINES_A: Record<string, Draw> = {
  gwisp,
  gasguzzle,
  gaswarlord,
  burnlet,
  embernomic,
  deflagron,
  shrimpie,
  crabwalk,
  leviawhale,
};
