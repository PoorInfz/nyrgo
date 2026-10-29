import { type Draw, brows, feet, label } from './common.js';
import { Painter, crescent, ell, ground, sparkle } from './kit.js';

/* ================================ Moon: moon-rabbit line ================================ */

/* Wenling — a moon-rabbit kid in a bubble helmet who asks "when?" every five minutes. */
const wenling: Draw = (id) => {
  const p = new Painter(id, '#3b2a6b');
  const fur = p.grad('#ffffff', '#ede9fe', '#c4b5fd');
  p.glow(128, 150, 100, '#c4b5fd', 0.6);
  for (const [x, y, r] of [
    [40, 60, 6],
    [214, 92, 8],
    [60, 196, 5],
  ] as const)
    p.raw(sparkle(x, y, r, '#a78bfa'));
  // speech bubble
  p.part(
    'M168 30 C168 18 180 12 198 12 C216 12 230 18 230 32 C230 44 218 50 200 50 L192 50 L180 62 L182 48 C174 46 168 40 168 30 Z',
    '#ffffff',
  );
  p.raw(label(199, 38, 16, '#5b21b6', 'wen?'));
  // long ears poking out of the helmet
  p.part('M106 84 C96 50 98 24 110 16 C122 24 124 54 118 84 Z', fur);
  p.patch('M108 78 C102 54 104 34 110 28 C116 36 116 58 114 78 Z', '#f9a8d4');
  p.part('M140 84 C140 50 150 26 164 22 C172 32 164 60 152 86 Z', fur);
  p.patch('M144 80 C146 56 154 38 160 34 C164 44 158 64 150 82 Z', '#f9a8d4');
  feet(p, 106, 150, 224, 15, 8, '#ede9fe');
  // space suit body
  p.part(
    'M90 220 C86 190 98 166 128 164 C158 166 170 190 166 220 Z',
    p.grad('#f8fafc', '#cbd5e1', '#64748b'),
    crescent(128, 192, 38, 32, -10, -6),
  );
  p.part(ell(128, 194, 12, 10), '#fbbf24');
  p.part(ell(90, 192, 9, 11), '#e2e8f0').part(ell(166, 192, 9, 11), '#cbd5e1');
  // head inside a bubble helmet
  p.part(ell(128, 124, 42, 38), fur, crescent(128, 124, 42, 38));
  p.eye(112, 122, 9, 12, '#8b5cf6', 0.4).eye(144, 122, 9, 12, '#8b5cf6', 0.4);
  p.blush(98, 142, 6).blush(158, 142, 6);
  p.part(ell(128, 146, 5, 6), '#5b1f33');
  p.raw(
    `<circle cx="128" cy="120" r="56" fill="#e0f2fe" opacity="0.18" stroke="#3b2a6b" stroke-width="4"/>`,
  );
  p.gloss(98, 92, 16, 7, -35);
  return ground(128, 64) + p;
};

/* Moonshot — the impatient rabbit strapped into its own rocket; half the time it doesn't take off. */
const moonshot: Draw = (id) => {
  const p = new Painter(id, '#3b2a6b', 5);
  p.glow(128, 130, 116, '#c4b5fd', 0.55);
  p.raw(sparkle(36, 52, 8, '#a78bfa') + sparkle(222, 40, 6, '#a78bfa'));
  // sputtering exhaust
  p.raw(
    '<circle cx="104" cy="222" r="14" fill="#cbd5e1"/><circle cx="148" cy="226" r="12" fill="#e2e8f0"/><circle cx="126" cy="232" r="10" fill="#cbd5e1"/>',
  );
  p.part(
    'M112 196 C108 212 118 224 128 228 C138 224 148 212 144 196 Z',
    p.grad('#fef08a', '#fb923c', '#ef4444'),
  );
  // fins
  p.part('M86 156 L58 196 L92 192 Z', '#ef4444').part('M170 156 L198 196 L164 192 Z', '#dc2626');
  // rocket body
  p.part(
    'M128 26 C162 50 174 104 166 196 L90 196 C82 104 94 50 128 26 Z',
    p.grad('#ffffff', '#e2e8f0', '#94a3b8'),
    'M128 20 L200 200 L128 200 Z',
  );
  p.part('M128 26 C144 36 154 50 160 66 L96 66 C102 50 112 36 128 26 Z', '#ef4444');
  p.line('M88 182 L168 182', 4);
  // window with the rabbit
  p.part(ell(128, 120, 34, 34), '#1e1b4b');
  p.part('M112 100 C106 78 110 62 118 58 C124 66 124 84 120 100 Z', '#ede9fe');
  p.part('M138 100 C140 78 148 64 156 62 C160 72 152 88 144 102 Z', '#ede9fe');
  p.part(ell(128, 128, 24, 22), p.grad('#ffffff', '#ddd6fe'));
  p.eye(119, 126, 6, 8, '#8b5cf6', 0.5).eye(139, 126, 6, 8, '#8b5cf6', 0.5);
  p.line('M122 140 Q128 136 134 140', 2.5);
  p.raw(`<circle cx="128" cy="120" r="30" fill="none" stroke="#94a3b8" stroke-width="5"/>`);
  p.gloss(112, 104, 9, 4, -35);
  // "almost" sweat drop
  p.part('M174 108 C178 116 180 120 176 124 C172 126 168 122 170 116 Z', '#7dd3fc');
  return ground(128, 70) + p;
};

/* Selenarch — the lunar monarch, a moon rabbit in a cape of night sky who watches the Earth from above. */
const selenarch: Draw = (id) => {
  const p = new Painter(id, '#2a1a5e', 5);
  const fur = p.grad('#ffffff', '#ede9fe', '#c4b5fd');
  p.glow(128, 120, 124, '#c4b5fd', 0.7);
  // full moon disc behind
  p.raw(`<circle cx="128" cy="104" r="86" fill="#fef9c3" opacity="0.55"/>`);
  // tiny Earth
  p.part(ell(214, 52, 14, 14), '#38bdf8');
  p.patch(
    'M206 46 C210 42 216 44 216 50 C212 52 208 52 206 46 Z M214 58 C220 56 224 60 220 64 C216 64 214 62 214 58 Z',
    '#4ade80',
  );
  // starry cape
  p.part(
    'M66 226 C60 180 74 130 98 112 L158 112 C182 130 196 180 190 226 Z',
    p.grad('#4c1d95', '#1e1b4b'),
  );
  for (const [x, y, r] of [
    [84, 196, 4],
    [100, 160, 3],
    [168, 186, 4],
    [156, 150, 3],
    [178, 212, 3],
  ] as const)
    p.raw(sparkle(x, y, r * 1.6, '#fef3c7'));
  // body in robes
  p.part(
    'M100 226 C96 188 104 150 128 146 C152 150 160 188 156 226 Z',
    fur,
    crescent(128, 186, 30, 44, -8, -6),
  );
  p.patch('M118 226 C116 196 120 170 128 166 C136 170 140 196 138 226 Z', '#fde68a', 0.8);
  // sceptre with a crescent
  p.line('M190 226 L184 96', 5, '#d4a72c');
  p.part('M178 92 C170 76 176 60 190 56 C184 66 184 80 194 88 C190 92 184 94 178 92 Z', '#fde68a');
  p.part(ell(184, 150, 10, 10), '#ede9fe');
  // ears and crescent crown
  p.part('M106 72 C94 40 96 12 110 4 C124 12 126 42 120 72 Z', fur);
  p.patch('M108 66 C102 44 104 22 110 16 C116 24 116 46 114 66 Z', '#f9a8d4');
  p.part('M136 72 C136 40 146 14 162 8 C172 20 162 50 150 74 Z', fur);
  p.patch('M140 68 C142 46 150 26 158 20 C162 32 156 52 148 70 Z', '#f9a8d4');
  p.part(ell(128, 108, 38, 34), fur, crescent(128, 108, 38, 34));
  p.part('M108 78 C108 68 116 62 126 62 C120 66 118 74 122 82 C116 84 110 82 108 78 Z', '#fde68a');
  p.part('M128 80 L134 64 L140 80 Z', '#fde68a');
  p.eye(114, 106, 7, 10, '#7c3aed', 0).eye(142, 106, 7, 10, '#7c3aed', 0);
  p.line('M104 96 L122 98 M152 96 L134 98', 3);
  p.blush(102, 124, 5).blush(154, 124, 5);
  p.line('M122 126 Q128 130 134 126', 3);
  return ground(128, 86) + p;
};

/* ================================ Paperpaw and Diamondpaw ================================ */

/* Paperpaw — an origami cat that runs at the first scare. */
const paperpaw: Draw = (id) => {
  const p = new Painter(id, '#3f3a52');
  p.glow(128, 150, 100, '#e0f2fe', 0.6);
  // fright lines
  p.line('M42 96 L56 104 M36 120 L52 122 M210 92 L198 102 M218 118 L202 120', 3.5, '#94a3b8');
  // folded tail
  p.part(
    'M170 200 L206 150 L216 162 L184 208 Z',
    '#f8fafc',
    'M206 150 L216 162 L184 208 L178 204 Z',
    { shade: '#cbd5e1' },
  );
  // body: folded planes
  p.part('M86 222 L100 160 L128 150 L156 160 L170 222 Z', '#ffffff');
  p.patch('M128 150 L156 160 L170 222 L128 222 Z', '#e2e8f0');
  p.line('M128 150 L128 222 M100 160 L128 186 L156 160', 2, '#94a3b8');
  // shaky legs
  p.line('M104 222 L100 230 M118 222 L118 230 M138 222 L138 230 M152 222 L156 230', 4);
  // head: folded with pointed ears
  p.part('M78 124 L84 64 L112 92 L144 92 L172 64 L178 124 L128 148 Z', '#ffffff');
  p.patch('M128 92 L144 92 L172 64 L178 124 L128 148 Z', '#e2e8f0');
  p.patch('M86 76 L92 96 L104 92 Z M170 76 L164 96 L152 92 Z', '#fbcfe8');
  p.line('M128 92 L128 148 M84 64 L104 116 M172 64 L152 116', 2, '#94a3b8');
  // scared eyes and sweat
  p.part(ell(106, 112, 11, 12), '#ffffff').eye(106, 112, 6, 8, '#64748b', 0);
  p.part(ell(150, 112, 11, 12), '#ffffff').eye(150, 112, 6, 8, '#64748b', 0);
  p.line('M120 136 L124 132 L128 136 L132 132 L136 136', 2.5);
  p.part('M176 92 C182 102 184 108 180 112 C176 114 172 110 174 102 Z', '#7dd3fc');
  p.line('M90 126 L72 122 M90 132 L72 136 M166 126 L184 122 M166 132 L184 136', 2);
  return ground(128, 60) + p;
};

/* Diamondpaw — the same cat, now diamond: it never lets go. */
const diamondpaw: Draw = (id) => {
  const p = new Painter(id, '#3b3633');
  const stone = p.grad('#e7e5e4', '#a8a29e', '#57534e');
  const gem = (d: string, shade: string) =>
    p.part(d, p.grad('#ecfeff', '#67e8f9', '#0891b2'), shade, { shade: '#22d3ee' });
  p.glow(128, 140, 116, '#a5f3fc', 0.6);
  gem('M64 158 L52 112 L76 126 L84 154 Z', 'M64 158 L76 126 L84 154 Z');
  gem('M78 150 L74 96 L96 118 L98 148 Z', 'M78 150 L96 118 L98 148 Z');
  p.part(
    'M152 212 C198 216 214 182 198 152 L210 146 C232 184 210 228 150 226 Z',
    stone,
    crescent(184, 196, 34, 30, -8, -8),
  );
  gem('M196 154 L198 118 L214 132 L212 150 Z', 'M198 118 L214 132 L212 150 L204 152 Z');
  p.part(
    'M86 224 C80 182 96 150 128 150 C160 150 176 182 170 224 Z',
    stone,
    crescent(128, 190, 40, 44, -10, -6),
  );
  p.patch('M106 220 C102 192 112 170 128 168 C144 170 154 192 150 220 Z', '#f5f5f4');
  p.part('M84 104 L74 50 L118 78 Z', stone).patch('M88 94 L82 62 L108 80 Z', '#f9a8d4');
  p.part('M172 104 L182 50 L138 78 Z', stone, 'M182 50 L172 104 L160 96 Z').patch(
    'M168 94 L174 62 L148 80 Z',
    '#f9a8d4',
  );
  p.part(ell(128, 112, 50, 42), stone, crescent(128, 112, 50, 42));
  p.gloss(100, 86, 12, 6);
  gem('M128 74 L138 84 L128 96 L118 84 Z', 'M128 74 L138 84 L128 96 Z');
  p.eye(108, 114, 10, 12, '#06b6d4', 0.2).eye(148, 114, 10, 12, '#06b6d4', 0.2);
  brows(p, 128, 100, 40, 22, 3);
  p.patch(ell(128, 128, 4.5, 3.2), '#4b3f3a');
  p.line('M119 134 Q124 139 128 134 Q132 139 137 134', 3);
  p.line('M92 124 L76 120 M92 130 L76 132 M164 124 L180 120 M164 130 L180 132', 2.5);
  for (const x of [104, 152]) {
    gem(
      `M${x - 22} 206 L${x - 12} 192 L${x + 12} 192 L${x + 22} 206 L${x} 232 Z`,
      `M${x} 192 L${x + 12} 192 L${x + 22} 206 L${x} 232 Z`,
    );
    p.line(`M${x - 22} 206 L${x + 22} 206 M${x - 6} 192 L${x} 232 L${x + 6} 192`, 2.5);
    p.patch(`M${x - 14} 198 L${x - 8} 198 L${x - 11} 203 Z`, '#ffffff', 0.85);
  }
  return ground(128, 80) + p;
};

/* ================================== Bears (Cold) and bulls (Burn) ================================== */

const BEAR = ['#f5f5f4', '#c7b8a8', '#78604a'] as const;

/* Bearkit — a bear cub that hibernates whenever everything falls: snug in a blanket with a red-chart pillow. */
const bearkit: Draw = (id) => {
  const p = new Painter(id, '#3b2a1d');
  const fur = p.grad(...BEAR);
  p.glow(128, 160, 104, '#bfdbfe', 0.6);
  // pillow with a falling chart
  p.part(
    'M30 150 C30 136 40 130 60 130 L104 130 C120 130 126 138 126 150 C126 164 118 170 104 170 L52 170 C38 170 30 164 30 150 Z',
    '#f1f5f9',
  );
  p.line('M46 140 L62 146 L74 142 L90 160 L108 164', 3.5, '#ef4444');
  // sleeping cub
  p.part(ell(84, 144, 13, 13), fur).part(ell(130, 140, 13, 13), fur);
  p.patch(ell(84, 144, 6, 6), '#a68b74').patch(ell(130, 140, 6, 6), '#8d725c');
  p.part(ell(106, 160, 36, 32), fur, crescent(106, 186, 36, 32));
  p.patch(ell(106, 174, 16, 11), '#fafaf9');
  p.part(ell(106, 172, 5, 4), '#3b2a1d');
  p.closedEye(92, 160, 13).closedEye(120, 160, 13);
  p.blush(84, 174, 5).blush(128, 174, 5);
  // blanket
  p.part(
    'M60 206 C70 188 120 180 168 186 C204 190 226 204 226 220 C226 230 214 232 196 232 L76 232 C62 232 54 220 60 206 Z',
    p.grad('#bfdbfe', '#60a5fa', '#1d4ed8'),
    'M0 222 H256 V256 H0 Z',
  );
  for (const [x, y] of [
    [100, 214],
    [150, 206],
    [196, 216],
  ] as const) {
    p.line(
      `M${x - 6} ${y} L${x + 6} ${y} M${x - 3} ${y - 5} L${x + 3} ${y + 5} M${x - 3} ${y + 5} L${x + 3} ${y - 5}`,
      2.5,
      '#ffffff',
    );
  }
  p.raw(
    label(176, 140, 22, '#60a5fa', 'Z') +
      label(196, 116, 16, '#60a5fa', 'z') +
      label(210, 98, 12, '#60a5fa', 'z'),
  );
  return p.toString();
};

/* Grizzlydump — the bear of crypto winter; knocks charts over with one swipe. */
const grizzlydump: Draw = (id) => {
  const p = new Painter(id, '#2a1d14', 5);
  const fur = p.grad('#e7e5e4', '#a08872', '#4a3527');
  p.glow(128, 130, 124, '#bfdbfe', 0.6);
  // falling chart and snow
  p.line('M150 40 L172 52 L184 46 L206 84 L226 92 L240 130', 6, '#ef4444');
  p.part('M232 128 L246 142 L250 120 Z', '#ef4444', undefined, { outline: false });
  for (const [x, y] of [
    [30, 50],
    [70, 30],
    [44, 90],
    [200, 20],
  ] as const)
    p.raw(`<circle cx="${x}" cy="${y}" r="4" fill="#ffffff" stroke="#93c5fd" stroke-width="2"/>`);
  // legs
  p.part('M84 226 L88 192 L120 192 L118 226 Z', fur);
  p.part('M138 226 L136 192 L168 192 L172 226 Z', fur, 'M150 186 L200 186 V230 H150 Z');
  // big body
  p.part(
    'M60 180 C56 130 86 98 128 98 C170 98 200 130 196 180 C194 206 168 214 128 214 C88 214 62 206 60 180 Z',
    fur,
    crescent(128, 156, 70, 60, -14, -10),
  );
  p.patch('M100 204 C94 176 104 148 128 144 C152 148 162 176 156 204 Z', '#d6c4b0');
  // frost on the shoulders
  p.patch('M62 152 C70 128 92 112 112 108 C98 120 86 134 80 156 Z', '#e0f2fe', 0.9);
  // swiping arm raised with claws
  p.part('M174 140 C196 120 206 96 204 74 C218 80 224 104 214 128 C206 146 192 156 178 160 Z', fur);
  p.line('M200 72 L206 58 M208 74 L218 62 M214 82 L226 74', 4, '#f8fafc');
  p.part(ell(70, 176, 16, 20), fur);
  // head
  p.part(ell(84, 66, 14, 14), fur).patch(ell(84, 66, 7, 7), '#6b4f3a');
  p.part(ell(156, 62, 14, 14), fur).patch(ell(156, 62, 7, 7), '#5c4232');
  p.part(ell(120, 94, 44, 38), fur, crescent(120, 94, 44, 38));
  p.patch(ell(120, 112, 20, 14), '#e7ddd2');
  p.part(ell(120, 106, 7, 5), '#1c1410');
  p.eye(102, 88, 7, 9, '#60a5fa', 0.4).eye(138, 88, 7, 9, '#60a5fa', 0.4);
  brows(p, 120, 76, 36, 16, 4);
  p.line('M108 120 Q120 116 132 120', 3.5);
  p.part('M112 120 L115 127 L118 120 Z M124 120 L127 127 L130 120 Z', '#ffffff');
  return ground(128, 96) + p;
};

const HIDE = ['#fed7aa', '#ea580c', '#9a3412'] as const;

/* Bullcalf — a calf that charges any red line it sees. */
const bullcalf: Draw = (id) => {
  const p = new Painter(id, '#4a1a06');
  const hide = p.grad(...HIDE);
  p.glow(128, 150, 104, '#fdba74', 0.5);
  // red line it is about to charge
  p.line('M196 150 L214 166 L226 160 L244 184', 5, '#ef4444');
  p.line('M16 170 L40 170 M12 188 L34 188', 3.5, '#fdba74');
  // tail
  p.line('M76 170 C58 164 52 150 58 140', 4);
  p.part('M54 128 C64 132 66 142 58 146 C52 140 50 134 54 128 Z', '#7c2d12');
  // legs
  for (const x of [88, 104, 150, 166])
    p.part(
      `M${x - 7} 196 L${x + 7} 196 L${x + 6} 222 L${x - 6} 222 Z`,
      x > 140 ? '#c2410c' : '#9a3412',
    );
  for (const x of [88, 104, 150, 166]) p.part(ell(x, 224, 8, 5), '#3f1d0b');
  // body
  p.part(ell(126, 176, 54, 32), hide, crescent(126, 176, 54, 32, -10, -10));
  p.patch(ell(110, 168, 14, 10), '#fff7ed', 0.85);
  // head lowered for a charge
  p.part(
    'M176 112 C196 112 210 126 210 146 C210 166 196 176 178 176 C158 176 146 162 146 144 C146 126 158 112 176 112 Z',
    hide,
    crescent(178, 144, 32, 32),
  );
  p.part('M156 118 C150 102 152 92 158 88 C162 98 164 108 166 116 Z', '#fef3c7');
  p.part('M196 118 C204 104 206 94 202 88 C196 96 192 106 188 116 Z', '#fde68a');
  p.part(ell(146, 126, 12, 7), '#ea580c').part(ell(208, 126, 12, 7), '#c2410c');
  // flame tuft
  p.part(
    'M170 112 C166 98 172 88 178 84 C178 94 184 98 186 100 C188 94 192 90 196 88 C196 100 192 110 186 114 Z',
    p.grad('#fef08a', '#fb923c', '#ef4444'),
  );
  p.patch(ell(178, 160, 18, 12), '#fdba74');
  p.part(ell(172, 160, 2.5, 2.5), '#3f1d0b').part(ell(184, 160, 2.5, 2.5), '#3f1d0b');
  p.eye(166, 138, 7, 9, '#f59e0b', 0.6).eye(190, 138, 7, 9, '#f59e0b', 0.6);
  p.line('M158 126 L172 132 M198 126 L186 132', 3.5);
  return ground(128, 82) + p;
};

/* Bullrush — a runaway bull with blazing horns; Grizzlydump's eternal rival. */
const bullrush: Draw = (id) => {
  const p = new Painter(id, '#3a1204', 5);
  const hide = p.grad('#fdba74', '#c2410c', '#5a1a06');
  p.glow(128, 140, 124, '#fb923c', 0.55);
  // rising green arrows behind
  for (const [x, y, s] of [
    [34, 112, 1],
    [214, 60, 1.3],
    [222, 150, 0.9],
  ] as const) {
    p.part(
      `M${x} ${y - 18 * s} L${x + 12 * s} ${y - 4 * s} L${x + 5 * s} ${y - 4 * s} L${x + 5 * s} ${y + 14 * s} L${x - 5 * s} ${y + 14 * s} L${x - 5 * s} ${y - 4 * s} L${x - 12 * s} ${y - 4 * s} Z`,
      '#22c55e',
    );
  }
  // dust
  p.raw(
    '<circle cx="30" cy="212" r="14" fill="#d6d3d1" opacity="0.7"/><circle cx="52" cy="222" r="10" fill="#e7e5e4" opacity="0.7"/>',
  );
  // legs mid-gallop
  p.part('M66 186 L84 186 L70 222 L54 220 Z', '#7c2d12');
  p.part('M94 192 L112 192 L108 226 L92 226 Z', hide);
  p.part('M150 192 L168 192 L176 224 L160 226 Z', '#7c2d12');
  p.part('M172 186 L190 186 L206 216 L192 222 Z', hide);
  // body with a mane of fire
  p.part(
    'M50 160 C50 124 80 108 120 108 C162 108 196 120 200 154 C202 186 176 200 124 200 C80 200 50 192 50 160 Z',
    hide,
    crescent(126, 150, 76, 50, -10, -10),
  );
  p.part(
    'M146 112 C140 92 148 76 158 70 C158 84 164 90 168 92 C170 80 176 72 184 68 C188 84 186 100 178 110 Z',
    p.grad('#fef08a', '#fb923c', '#ef4444'),
  );
  // head
  p.part(
    'M178 104 C204 102 226 118 228 142 C230 166 214 178 194 178 C172 178 160 162 160 140 C160 120 166 106 178 104 Z',
    hide,
    crescent(194, 140, 34, 38),
  );
  p.patch(
    'M190 162 C200 152 220 152 226 162 C224 174 210 180 198 178 C192 174 188 168 190 162 Z',
    '#fdba74',
  );
  p.part(ell(200, 166, 3, 3), '#2a0a03').part(ell(214, 166, 3, 3), '#2a0a03');
  p.line('M196 174 C200 182 214 182 218 174', 3.5, '#fbbf24');
  // blazing horns
  p.part(
    'M170 112 C150 96 146 72 158 56 C162 76 170 90 184 100 Z',
    p.grad('#fef3c7', '#fbbf24', '#ef4444'),
  );
  p.part(
    'M212 108 C232 92 238 70 228 54 C222 74 212 88 198 98 Z',
    p.grad('#fef3c7', '#fbbf24', '#ef4444'),
  );
  p.glow(158, 60, 18, '#fde047', 0.8).glow(228, 58, 18, '#fde047', 0.8);
  p.eye(186, 134, 7, 9, '#fde047', 0.5).eye(212, 132, 7, 9, '#fde047', 0.5);
  p.line('M176 122 L192 128 M224 120 L210 126', 4);
  // tail
  p.line('M50 150 C30 142 24 124 30 110', 4.5);
  p.part('M24 98 C34 100 38 112 30 116 C24 110 22 104 24 98 Z', '#ef4444');
  return `<g transform="translate(-14 0)">${ground(128, 104)}${p}</g>`;
};

export const LINES_D: Record<string, Draw> = {
  wenling,
  moonshot,
  selenarch,
  paperpaw,
  diamondpaw,
  bearkit,
  grizzlydump,
  bullcalf,
  bullrush,
};
