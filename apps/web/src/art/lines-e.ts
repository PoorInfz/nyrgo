import { type Draw, brows, coin, feet, label } from './common.js';
import { Painter, crescent, ell, ground, sparkle } from './kit.js';

/* ================================== Gas: leverage ================================== */

/* Leverat — a rat in a gambler's visor that bets ten times what it has. */
const leverat: Draw = (id) => {
  const p = new Painter(id, '#2b2560');
  const fur = p.grad('#e0e7ff', '#a5b4fc', '#4f46e5');
  p.glow(128, 150, 104, '#a5b4fc', 0.5);
  // big lever it leans on
  p.part('M170 226 L190 226 L190 206 L170 206 Z', '#475569');
  p.line('M180 208 L212 96', 7, '#2b2560').line('M180 208 L212 96', 3, '#cbd5e1');
  p.part(ell(214, 88, 13, 13), '#ef4444', crescent(214, 88, 13, 13, -4, -4));
  // tail
  p.line('M88 206 C52 214 34 196 40 172 C44 160 56 160 58 170', 5, '#f9a8d4');
  feet(p, 106, 146, 224, 14, 7, '#f9a8d4');
  // body
  p.part(
    'M86 220 C82 184 98 158 126 158 C154 158 170 184 166 220 Z',
    fur,
    crescent(126, 190, 40, 34, -10, -6),
  );
  p.patch(ell(126, 196, 20, 20), '#eef2ff', 0.75);
  // chip stack it is about to push all-in
  for (let i = 0; i < 3; i++) {
    const y = 224 - i * 7;
    p.part(`M48 ${y} A14 5 0 0 0 76 ${y} L76 ${y - 5} A14 5 0 0 0 48 ${y - 5} Z`, '#b91c1c');
    p.part(ell(62, y - 5, 14, 5), '#ef4444');
  }
  // arm on the lever
  p.part(ell(170, 176, 10, 9), '#a5b4fc');
  p.line('M162 180 L176 170', 0.1);
  // ears and head
  p.part(ell(90, 92, 20, 20), fur).patch(ell(90, 94, 11, 11), '#fbcfe8');
  p.part(ell(162, 92, 20, 20), fur, crescent(162, 92, 20, 20, -6, -6)).patch(
    ell(162, 94, 11, 11),
    '#fbcfe8',
  );
  p.part(
    'M84 128 C84 104 102 90 126 90 C150 90 168 104 168 128 C168 146 156 154 140 158 L128 168 L112 158 C96 154 84 146 84 128 Z',
    fur,
    crescent(126, 126, 42, 38),
  );
  p.part(ell(128, 166, 5, 4), '#f472b6');
  p.line('M114 160 L92 156 M114 164 L94 168 M142 160 L164 156 M142 164 L162 168', 2);
  // green visor
  p.part('M86 104 Q126 84 166 104 L172 114 Q126 98 80 114 Z', '#16a34a');
  p.part('M80 114 Q126 98 172 114 L162 124 Q126 112 90 124 Z', '#22c55e', undefined, {
    outline: false,
  });
  p.eye(110, 132, 8, 10, '#facc15', 0.5).eye(144, 132, 8, 10, '#facc15', 0.5);
  p.raw(label(208, 50, 20, '#ef4444', '10×'));
  return ground(128, 72) + p;
};

/* Liquidatron — a robot that arrives the moment the margin runs out. */
const liquidatron: Draw = (id) => {
  const p = new Painter(id, '#111827', 5);
  const metal = p.grad('#f1f5f9', '#94a3b8', '#334155');
  p.glow(128, 130, 120, '#f87171', 0.35);
  // siren beams
  p.raw(`<path d="M128 30 L60 6 L70 0 Z M128 30 L196 6 L186 0 Z" fill="#ef4444" opacity="0.35"/>`);
  // treads
  p.part(
    'M64 206 C64 196 72 192 80 192 L176 192 C184 192 192 196 192 206 C192 218 184 224 176 224 L80 224 C72 224 64 218 64 206 Z',
    '#1f2937',
  );
  for (const x of [84, 106, 128, 150, 172]) p.part(ell(x, 208, 7, 7), '#64748b');
  // arms with grabbing claws
  p.part('M66 120 L40 128 L36 170 L52 172 L56 140 L70 136 Z', metal);
  p.part(
    'M24 176 C24 164 32 160 40 166 L46 176 L52 166 C60 160 68 166 66 178 C62 190 30 192 24 176 Z',
    '#475569',
  );
  p.part('M190 120 L216 128 L220 170 L204 172 L200 140 L186 136 Z', metal);
  p.part(
    'M232 176 C232 164 224 160 216 166 L210 176 L204 166 C196 160 188 166 190 178 C194 190 226 192 232 176 Z',
    '#334155',
  );
  // torso with a margin gauge
  p.part(
    'M68 100 C68 92 74 88 82 88 L174 88 C182 88 188 92 188 100 L184 190 L72 190 Z',
    metal,
    'M140 80 L200 80 L200 200 L140 200 Z',
  );
  p.part('M92 130 A36 36 0 0 1 164 130 Z', '#f8fafc');
  p.raw(
    `<path d="M96 130 A32 32 0 0 1 112 102" fill="none" stroke="#22c55e" stroke-width="7"/><path d="M114 101 A32 32 0 0 1 142 101" fill="none" stroke="#facc15" stroke-width="7"/><path d="M144 102 A32 32 0 0 1 160 130" fill="none" stroke="#ef4444" stroke-width="7"/>`,
  );
  p.line('M128 130 L154 112', 4, '#111827');
  p.part(ell(128, 130, 5, 5), '#111827');
  p.raw(label(128, 162, 15, '#ef4444', 'MARGIN'));
  p.line('M88 172 L168 172', 3, '#64748b');
  // head with siren and visor
  p.part('M98 54 L158 54 L162 88 L94 88 Z', metal);
  p.part('M116 54 L116 40 C116 30 140 30 140 40 L140 54 Z', '#ef4444');
  p.glow(128, 40, 22, '#ef4444', 0.8);
  p.part('M104 64 L152 64 L150 80 L106 80 Z', '#0f172a');
  p.line('M110 72 L146 72', 5, '#ef4444');
  p.glow(128, 72, 22, '#ef4444', 0.5);
  return ground(128, 96) + p;
};

/* ============================== Liquidity: mempool hounds ============================== */

const PUP = ['#ffffff', '#bae6fd', '#0284c7'] as const;

/* Mempup — a puppy that waits in the queue without complaining, ticket in its mouth. */
const mempup: Draw = (id) => {
  const p = new Painter(id, '#0c3a5c');
  const fur = p.grad(...PUP);
  p.glow(128, 150, 100, '#bae6fd', 0.6);
  // queue dots behind
  for (const [x, y] of [
    [30, 200],
    [48, 200],
    [66, 200],
  ] as const)
    p.part(ell(x, y, 5, 5), '#7dd3fc', undefined, { outline: false });
  // wagging tail
  p.part(
    'M166 200 C190 196 200 178 196 160 C206 166 210 186 202 200 C194 212 178 214 166 212 Z',
    fur,
  );
  p.line('M206 150 L214 144 M212 160 L222 158', 3, '#7dd3fc');
  feet(p, 108, 148, 224, 14, 8, '#e0f2fe');
  // sitting body
  p.part(
    'M90 222 C86 192 100 168 128 168 C156 168 170 192 166 222 Z',
    fur,
    crescent(128, 196, 38, 30, -10, -6),
  );
  p.patch(ell(128, 200, 18, 18), '#ffffff', 0.85);
  // floppy ears
  p.part('M84 106 C64 108 56 136 64 158 C76 150 86 134 92 116 Z', '#38bdf8');
  p.part('M172 106 C192 108 200 136 192 158 C180 150 170 134 164 116 Z', '#0ea5e9');
  // head
  p.part(ell(128, 124, 44, 40), fur, crescent(128, 124, 44, 40));
  p.patch(ell(106, 112, 14, 12), '#bae6fd');
  p.gloss(108, 98, 10, 5);
  p.eye(112, 122, 9, 12, '#0369a1', 0).eye(146, 122, 9, 12, '#0369a1', 0);
  p.patch(ell(128, 144, 14, 9), '#ffffff');
  p.part(ell(128, 140, 6, 4), '#0c3a5c');
  // queue ticket in its mouth
  p.part('M118 150 L156 146 L158 166 L120 170 Z', '#fef3c7');
  p.raw(label(139, 163, 12, '#0c3a5c', '#42'));
  p.blush(100, 140, 6).blush(160, 140, 6);
  return ground(128, 64) + p;
};

/* Blockhound — a hound that won't let a transaction go until it is confirmed. */
const blockhound: Draw = (id) => {
  const p = new Painter(id, '#082f49', 5);
  const fur = p.grad('#e0f2fe', '#38bdf8', '#075985');
  p.glow(128, 140, 116, '#7dd3fc', 0.55);
  // tail up
  p.part(
    'M186 168 C204 150 214 124 208 102 C220 110 226 138 214 160 C206 174 196 180 188 182 Z',
    fur,
  );
  // legs (alert stance)
  for (const [x, c] of [
    [86, '#0369a1'],
    [110, '#0284c7'],
    [158, '#0369a1'],
    [180, '#0284c7'],
  ] as const) {
    p.part(`M${x - 9} 180 L${x + 9} 180 L${x + 8} 222 L${x - 8} 222 Z`, c);
    p.part(ell(x, 224, 10, 5), '#e0f2fe');
  }
  // body
  p.part(ell(134, 168, 60, 32), fur, crescent(134, 168, 60, 32, -10, -10));
  // collar with a block tag
  p.part('M80 138 Q98 154 118 146 L116 136 Q98 142 82 128 Z', '#fbbf24');
  p.part('M92 148 L108 148 L108 164 L92 164 Z', p.grad('#fef3c7', '#d4a72c'));
  p.line('M95 156 L99 160 L105 152', 2.5, '#082f49');
  // long ears and head, nose to the ground on the trail
  p.part('M58 80 C38 84 32 116 42 140 C54 130 62 112 66 92 Z', '#075985');
  p.part(
    'M48 92 C48 72 64 60 86 60 C108 60 120 76 118 98 C116 116 104 126 90 128 L62 136 C46 140 34 132 36 120 C38 110 46 104 48 92 Z',
    fur,
    crescent(80, 96, 40, 36),
  );
  p.part(ell(40, 124, 9, 7), '#082f49');
  p.eye(76, 90, 8, 10, '#0369a1', -0.6).eye(100, 88, 7, 9, '#0369a1', -0.6);
  brows(p, 88, 78, 24, 12, 2);
  // the transaction it is tracking
  p.part('M10 196 L48 192 L50 222 L12 226 Z', '#ffffff');
  p.line('M16 202 L42 200 M16 210 L36 208 M16 218 L40 216', 2.5, '#94a3b8');
  p.part('M30 160 C30 156 34 156 34 160 C34 164 30 164 30 160 Z', '#38bdf8');
  return ground(132, 96) + p;
};

/* ============================== Copium and Hopium moths ============================== */

/* Copiumoth — a grey moth that breathes excuses so it never has to accept a loss. */
const copiumoth: Draw = (id) => {
  const p = new Painter(id, '#2a2340');
  const wing = p.grad('#e9e5f5', '#a59cc4', '#5b4f80');
  p.glow(128, 140, 108, '#c4b5fd', 0.35);
  // wings
  p.part(
    'M118 124 C84 72 34 70 26 102 C20 128 52 146 96 140 C58 156 52 194 80 202 C102 208 116 180 122 152 Z',
    wing,
    'M0 140 H256 V256 H0 Z',
    { shade: '#6b6290' },
  );
  p.part(
    'M138 124 C172 72 222 70 230 102 C236 128 204 146 160 140 C198 156 204 194 176 202 C154 208 140 180 134 152 Z',
    wing,
    'M0 140 H256 V256 H0 Z',
    { shade: '#6b6290' },
  );
  p.part(ell(64, 104, 14, 12), '#d8d2ea').part(ell(192, 104, 14, 12), '#d8d2ea');
  p.patch(ell(64, 104, 6, 5), '#5b4f80').patch(ell(192, 104, 6, 5), '#5b4f80');
  // body
  p.part(
    'M112 132 C110 108 116 96 128 96 C140 96 146 108 144 132 C144 170 138 196 128 204 C118 196 112 170 112 132 Z',
    p.grad('#f5f3ff', '#c4b5fd', '#6d5fa0'),
  );
  for (const y of [146, 162, 178]) p.line(`M116 ${y} Q128 ${y + 5} 140 ${y}`, 2.5, '#6d5fa0');
  // fluffy collar and head
  p.part('M106 110 C112 98 144 98 150 110 C146 122 110 122 106 110 Z', '#f5f3ff');
  p.line('M116 74 C108 56 94 50 86 54 M140 74 C148 56 162 50 170 54', 3);
  p.part(ell(128, 84, 24, 20), p.grad('#f5f3ff', '#c4b5fd'), crescent(128, 84, 24, 20, -6, -6));
  p.eye(119, 84, 6, 8, '#8b5cf6', 0).eye(137, 84, 6, 8, '#8b5cf6', 0);
  p.line('M112 76 L124 78 M144 76 L132 78', 2.5);
  // bubble of excuses
  p.part(
    'M168 156 C168 142 182 134 200 134 C220 134 236 142 236 158 C236 172 220 180 200 180 C190 180 184 178 180 176 L166 184 L170 172 C168 168 168 162 168 156 Z',
    '#ffffff',
  );
  p.raw(label(202, 164, 13, '#5b4f80', 'todo OK'));
  return ground(128, 52) + p;
};

/* Hopiumoth — the same moth, now golden and flying towards the light. */
const hopiumoth: Draw = (id) => {
  const p = new Painter(id, '#5a3405');
  const wing = p.grad('#fffbeb', '#fde68a', '#f59e0b');
  p.glow(196, 46, 70, '#fef08a', 0.9);
  p.glow(128, 140, 108, '#fde68a', 0.5);
  // the light it flies towards
  p.part(ell(196, 46, 20, 20), p.grad('#ffffff', '#fef08a'));
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    p.line(
      `M${(196 + Math.cos(a) * 28).toFixed(1)} ${(46 + Math.sin(a) * 28).toFixed(1)} L${(196 + Math.cos(a) * 38).toFixed(1)} ${(46 + Math.sin(a) * 38).toFixed(1)}`,
      3.5,
      '#facc15',
    );
  }
  p.raw(`<g transform="rotate(18 128 140)">`);
  p.part(
    'M118 124 C84 72 34 70 26 102 C20 128 52 146 96 140 C58 156 52 194 80 202 C102 208 116 180 122 152 Z',
    wing,
    'M0 140 H256 V256 H0 Z',
    { shade: '#fbbf24' },
  );
  p.part(
    'M138 124 C172 72 222 70 230 102 C236 128 204 146 160 140 C198 156 204 194 176 202 C154 208 140 180 134 152 Z',
    wing,
    'M0 140 H256 V256 H0 Z',
    { shade: '#fbbf24' },
  );
  p.part(ell(64, 104, 14, 12), '#fff7ed').part(ell(192, 104, 14, 12), '#fff7ed');
  p.raw(sparkle(64, 104, 9, '#f59e0b') + sparkle(192, 104, 9, '#f59e0b'));
  p.part(
    'M112 132 C110 108 116 96 128 96 C140 96 146 108 144 132 C144 170 138 196 128 204 C118 196 112 170 112 132 Z',
    p.grad('#fffbeb', '#fcd34d', '#d97706'),
  );
  for (const y of [146, 162, 178]) p.line(`M116 ${y} Q128 ${y + 5} 140 ${y}`, 2.5, '#d97706');
  p.part('M106 110 C112 98 144 98 150 110 C146 122 110 122 106 110 Z', '#fffbeb');
  p.line('M116 74 C108 56 94 50 86 54 M140 74 C148 56 162 50 170 54', 3);
  p.part(ell(128, 84, 24, 20), p.grad('#fffbeb', '#fde68a'), crescent(128, 84, 24, 20, -6, -6));
  p.eye(119, 84, 6, 9, '#f59e0b', 0.6).eye(137, 84, 6, 9, '#f59e0b', 0.6);
  p.line('M122 96 Q128 100 134 96', 2.5);
  p.raw('</g>');
  return ground(120, 46, 240) + p;
};

/* ============================== Bridgetroll and Seedsnatcher ============================== */

/* Bridgetroll — a mossy troll under the bridges between chains; charges whoever crosses. */
const bridgetroll: Draw = (id) => {
  const p = new Painter(id, '#1f2a14', 5);
  const skin = p.grad('#d9f99d', '#65a30d', '#365314');
  // bridge arch overhead
  p.part(
    'M0 34 L256 34 L256 66 C220 66 196 82 186 110 L70 110 C60 82 36 66 0 66 Z',
    p.grad('#d6d3d1', '#78716c'),
  );
  for (const x of [32, 76, 120, 164, 208]) p.line(`M${x} 34 L${x} 52`, 2.5, '#57534e');
  p.line('M0 52 L256 52', 2.5, '#57534e');
  // chain links hanging from the bridge
  p.line('M44 66 L44 96 M212 66 L212 96', 4, '#fbbf24');
  p.glow(128, 170, 104, '#bef264', 0.35);
  // toll bucket
  p.part('M178 186 L222 186 L216 226 L184 226 Z', p.grad('#a8a29e', '#57534e'));
  coin(p, 190, 182, 8);
  coin(p, 206, 178, 9);
  coin(p, 198, 170, 7);
  p.raw(label(200, 214, 14, '#fef3c7', 'TOLL'));
  // body hunched
  feet(p, 96, 150, 226, 20, 9, '#4d7c0f');
  p.part(
    'M66 220 C58 172 80 132 124 128 C168 132 188 172 180 220 Z',
    skin,
    crescent(124, 176, 56, 50, -12, -8),
  );
  p.patch('M96 218 C92 190 104 168 124 166 C144 168 156 190 152 218 Z', '#ecfccb', 0.55);
  // moss patches
  p.patch('M74 168 C84 154 100 150 110 156 C98 162 86 170 78 182 Z', '#4d7c0f');
  // hand out for the toll
  p.part(
    'M174 170 C188 160 196 148 192 140 C202 138 208 150 202 166 C198 176 188 182 178 184 Z',
    skin,
  );
  p.part(ell(62, 184, 14, 18), skin);
  // head with long nose and tusks
  p.part(ell(124, 122, 46, 38), skin, crescent(124, 122, 46, 38));
  p.part('M76 112 L54 98 L80 102 Z', '#65a30d').part('M172 112 L194 98 L168 102 Z', '#4d7c0f');
  p.part(ell(126, 134, 11, 13), p.grad('#d9f99d', '#65a30d'), crescent(126, 134, 11, 13, -3, -3));
  p.eye(108, 114, 7, 9, '#facc15', 0).eye(144, 114, 7, 9, '#facc15', 0);
  brows(p, 126, 102, 38, 16, 3);
  p.line('M100 152 Q126 162 152 152', 4);
  p.part('M106 152 L108 142 L114 154 Z M146 154 L152 142 L154 152 Z', '#fefce8');
  // mushrooms on its head
  p.part('M136 84 C136 72 156 72 156 84 Z', '#ef4444').part(
    'M144 84 L148 84 L148 92 L144 92 Z',
    '#fef3c7',
  );
  return ground(124, 100) + p;
};

/* Seedsnatcher — a hooded shade that asks for your 24 words "to verify". Never give them. */
const seedsnatcher: Draw = (id) => {
  const p = new Painter(id, '#0b0418', 5);
  const cloak = p.grad('#6d28d9', '#2e1065', '#0b0418');
  p.glow(128, 130, 124, '#7c3aed', 0.55);
  // fake verification badge it waves around
  p.line('M206 150 L218 196', 4, '#78716c');
  p.part(
    'M190 112 L230 112 L230 140 C230 152 220 160 210 164 C200 160 190 152 190 140 Z',
    p.grad('#93c5fd', '#2563eb'),
  );
  p.line('M200 136 L208 144 L222 126', 4, '#ffffff');
  p.raw(label(210, 106, 10, '#a78bfa', 'verify?'));
  // ragged cloak body
  p.part(
    'M56 226 L66 206 L74 226 L84 204 L94 226 L104 206 L116 226 L128 204 L140 226 L152 206 L164 226 L174 204 L184 226 L190 206 L198 226 C204 180 186 120 160 92 C150 74 106 74 96 92 C70 120 52 180 56 226 Z',
    cloak,
    'M128 60 L230 230 L128 230 Z',
  );
  // reaching hand with long fingers
  p.part(
    'M72 150 C56 146 40 138 30 124 L24 112 L32 118 L28 104 L38 116 L38 100 L46 116 L50 104 L52 122 C58 130 70 134 82 134 Z',
    p.grad('#c4b5fd', '#6d28d9'),
  );
  // the empty scroll it wants you to fill in
  p.part('M96 166 L160 162 L162 214 L98 218 Z', '#fef3c7');
  for (let i = 0; i < 4; i++) p.line(`M104 ${176 + i * 10} L154 ${173 + i * 10}`, 2, '#d6d3d1');
  p.raw(label(128, 174, 9, '#b91c1c', '1. ___ 2. ___'));
  p.part(ell(160, 188, 10, 9), '#a78bfa');
  // hood and face: only glowing eyes and a too-friendly smile
  p.part(
    'M86 110 C82 70 104 44 128 44 C152 44 174 70 170 110 C160 128 96 128 86 110 Z',
    cloak,
    'M128 30 L190 120 L128 130 Z',
  );
  p.part(ell(128, 100, 30, 24), '#05010d');
  p.glow(114, 96, 14, '#f472b6', 0.9).glow(142, 96, 14, '#f472b6', 0.9);
  p.raw(
    `<ellipse cx="114" cy="96" rx="6" ry="4" fill="#fbcfe8"/><ellipse cx="142" cy="96" rx="6" ry="4" fill="#fbcfe8"/>`,
  );
  p.line('M112 110 Q128 120 144 110', 2.5, '#f472b6');
  return ground(128, 84) + p;
};

export const LINES_E: Record<string, Draw> = {
  leverat,
  liquidatron,
  mempup,
  blockhound,
  copiumoth,
  hopiumoth,
  bridgetroll,
  seedsnatcher,
};
