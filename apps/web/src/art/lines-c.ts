import { type Draw, brows, coin, feet, label } from './common.js';
import { Painter, crescent, ell, ground, sparkle } from './kit.js';

/* ================================= Mining: stone blocks ================================= */

const STONE = ['#e7e5e4', '#a8a29e', '#57534e'] as const;

/** An isometric stone block: top, left and right faces. Returns the painter for chaining. */
function block(
  p: Painter,
  x: number,
  y: number,
  s: number,
  top = '#d6d3d1',
  left = '#a8a29e',
  right = '#78716c',
): Painter {
  const h = s * 0.5;
  p.part(`M${x} ${y - h} L${x + s} ${y} L${x} ${y + h} L${x - s} ${y} Z`, top);
  p.part(`M${x - s} ${y} L${x} ${y + h} L${x} ${y + h + s * 1.1} L${x - s} ${y + s * 1.1} Z`, left);
  return p.part(
    `M${x + s} ${y} L${x} ${y + h} L${x} ${y + h + s * 1.1} L${x + s} ${y + s * 1.1} Z`,
    right,
  );
}

/* Pebblock — a square pebble that stacks itself with others like it. */
const pebblock: Draw = (id) => {
  const p = new Painter(id, '#292524');
  p.glow(128, 150, 96, '#d6d3d1', 0.6);
  feet(p, 100, 156, 224, 15, 8, '#78716c');
  block(p, 128, 128, 62, '#e7e5e4', '#a8a29e', '#78716c');
  // little pebble balanced on top
  block(p, 128, 100, 16, '#f5f5f4', '#d6d3d1', '#a8a29e');
  // moss and cracks
  p.patch('M70 128 C84 136 96 132 104 142 L66 140 Z', '#86efac');
  p.line('M168 150 L176 162 L170 172', 2.5, '#57534e');
  // face on the left face
  p.eye(86, 168, 8, 10, '#57534e', 0.6).eye(112, 176, 8, 10, '#57534e', 0.6);
  p.blush(78, 188, 6).blush(118, 198, 6);
  p.line('M92 196 Q100 204 108 198', 3.5);
  // stubby arms
  p.part(ell(58, 180, 9, 12), '#a8a29e').part(ell(198, 180, 9, 12), '#78716c');
  return ground(128, 72) + p;
};

/* Blockgolem — a golem of chained blocks, each one with its seal. */
const blockgolem: Draw = (id) => {
  const p = new Painter(id, '#1c1917', 5);
  p.glow(128, 140, 112, '#d6d3d1', 0.55);
  // chain links between the blocks
  const chain = (x1: number, y1: number, x2: number, y2: number) =>
    p.line(`M${x1} ${y1} L${x2} ${y2}`, 9).line(`M${x1} ${y1} L${x2} ${y2}`, 4, '#fbbf24');
  chain(84, 150, 66, 170);
  chain(172, 150, 190, 170);
  chain(108, 196, 104, 214);
  chain(148, 196, 152, 214);
  // legs
  block(p, 102, 210, 20);
  block(p, 154, 210, 20);
  // arms
  block(p, 58, 166, 24);
  block(p, 198, 166, 24);
  // torso with a seal
  block(p, 128, 132, 50, '#e7e5e4', '#a8a29e', '#78716c');
  p.raw(label(103, 182, 26, '#57534e', '#'));
  p.raw(label(153, 182, 26, '#44403c', '#'));
  // head
  block(p, 128, 70, 30, '#f5f5f4', '#d6d3d1', '#a8a29e');
  p.eye(114, 92, 6, 8, '#f59e0b', 0.3).eye(142, 92, 6, 8, '#f59e0b', 0.3);
  p.line('M106 80 L120 84 M150 80 L136 84', 3.5);
  p.line('M122 106 L134 106', 3);
  return ground(128, 92) + p;
};

/* Petagolem — a walking mountain that hums like a mining farm: server lights in its chest. */
const petagolem: Draw = (id) => {
  const p = new Painter(id, '#1c1917', 5);
  p.glow(128, 130, 124, '#a5f3fc', 0.45);
  const rock = p.grad(...STONE);
  // legs
  p.part('M76 226 L80 186 L118 186 L114 226 Z', rock);
  p.part('M142 226 L138 186 L176 186 L180 226 Z', rock, 'M160 180 L200 180 L200 230 L160 230 Z');
  // mountain body with snowy peaks as shoulders
  p.part(
    'M30 196 L62 92 L92 120 L128 50 L164 120 L194 92 L226 196 Z',
    rock,
    'M128 40 L240 200 L128 200 Z',
  );
  p.part('M62 92 L50 132 L62 124 L72 134 L76 106 Z', '#f8fafc');
  p.part('M128 50 L112 84 L122 78 L128 90 L136 78 L144 84 Z', '#f8fafc');
  p.part('M194 92 L180 106 L184 134 L194 124 L206 132 Z', '#f8fafc');
  // arms like boulders
  p.part(ell(30, 176, 20, 24), rock);
  p.part(ell(226, 176, 20, 24), rock, crescent(226, 176, 20, 24, -6, -6));
  // server rack in the chest
  p.part('M98 128 L158 128 L158 186 L98 186 Z', '#1f2937');
  for (let i = 0; i < 4; i++) {
    const y = 136 + i * 12;
    p.line(`M104 ${y + 4} L140 ${y + 4}`, 3, '#374151');
    p.part(ell(146, y + 4, 3, 3), i % 2 ? '#22d3ee' : '#4ade80', undefined, { outline: false });
    p.part(ell(152, y + 4, 3, 3), i === 2 ? '#f59e0b' : '#22d3ee', undefined, { outline: false });
  }
  p.glow(128, 158, 40, '#22d3ee', 0.35);
  // fan vents humming
  p.raw(label(206, 70, 14, '#78716c', 'mmm'));
  // face
  p.eye(112, 108, 7, 8, '#22d3ee', 0).eye(144, 108, 7, 8, '#22d3ee', 0);
  brows(p, 128, 96, 32, 14, 3);
  return ground(128, 108) + p;
};

/* =================================== Cold: ice and vaults =================================== */

const ICE = ['#f8fbff', '#dbeafe', '#93c5fd'] as const;

/* Frostkey — a snow stoat with ice crystals on its brow; its tail ends in the ice bow of a key. */
const frostkey: Draw = (id) => {
  const p = new Painter(id, '#284777');
  const fur = p.grad('#ffffff', '#e0ecff', '#a9c6f0');
  p.glow(128, 150, 100, '#bfdbfe', 0.7);
  p.part(
    'M150 210 C182 212 198 190 194 156 L208 154 C214 196 196 224 150 222 Z',
    fur,
    crescent(178, 196, 30, 30, -8, -8),
  );
  p.part(
    'M201 118 C214 118 222 128 222 140 C222 152 214 160 201 160 C188 160 180 152 180 140 C180 128 188 118 201 118 Z M201 130 C195 130 192 134 192 140 C192 146 195 150 201 150 C207 150 210 146 210 140 C210 134 207 130 201 130 Z',
    p.grad('#dbeafe', '#60a5fa'),
  );
  feet(p, 110, 146, 222, 13, 7, '#dbeafe');
  p.part(
    'M100 222 C92 190 98 152 128 148 C158 152 164 190 156 222 Z',
    fur,
    crescent(128, 190, 32, 40, -10, -6),
  );
  p.patch('M112 214 C108 190 114 166 128 164 C142 166 148 190 144 214 Z', '#ffffff');
  p.part('M106 164 C100 176 106 188 118 184 C122 178 118 168 112 162 Z', '#eef4ff');
  p.part('M150 164 C156 176 150 188 138 184 C134 178 138 168 144 162 Z', '#dbe7fb');
  p.part(ell(92, 82, 14, 16), '#eef4ff').patch(ell(92, 84, 7, 9), '#ffc4d6');
  p.part(ell(164, 82, 14, 16), '#dbe7fb').patch(ell(164, 84, 7, 9), '#ffc4d6');
  p.part('M112 80 L106 52 L120 70 Z', '#93c5fd');
  p.part('M128 76 L128 38 L140 66 Z', '#93c5fd', 'M128 38 L140 66 L128 76 Z', { shade: '#60a5fa' });
  p.part('M144 80 L152 54 L154 74 Z', '#93c5fd');
  p.part(ell(128, 112, 46, 38), fur, crescent(128, 112, 46, 38));
  p.gloss(106, 90, 10, 5);
  p.eye(110, 110, 9, 12, '#38bdf8', 0.3).eye(148, 110, 9, 12, '#38bdf8', 0.3);
  p.patch(ell(129, 126, 4.5, 3.2), '#33274d');
  p.line('M121 131 Q125 136 129 131 Q133 136 137 131', 3);
  p.blush(98, 128, 6).blush(160, 128, 6);
  return ground(140, 60) + p;
};

/* Coldvault — an ice chest on little legs that never opens to strangers. */
const coldvault: Draw = (id) => {
  const p = new Painter(id, '#1e3a5f', 5);
  p.glow(128, 150, 108, '#bfdbfe', 0.7);
  // snowflakes
  for (const [x, y, r] of [
    [40, 70, 8],
    [216, 60, 10],
    [226, 140, 6],
  ] as const) {
    p.line(
      `M${x - r} ${y} L${x + r} ${y} M${x - r / 2} ${y - r * 0.87} L${x + r / 2} ${y + r * 0.87} M${x - r / 2} ${y + r * 0.87} L${x + r / 2} ${y - r * 0.87}`,
      3,
      '#93c5fd',
    );
  }
  feet(p, 86, 170, 224, 16, 8, '#93c5fd');
  // chest box and lid
  p.part(
    'M52 132 L204 132 L198 212 C198 218 194 220 188 220 L68 220 C62 220 58 218 58 212 Z',
    p.grad(...ICE),
    'M150 120 L240 120 L240 230 L150 230 Z',
  );
  p.part(
    'M44 132 C44 92 78 72 128 72 C178 72 212 92 212 132 Z',
    p.grad('#ffffff', '#bfdbfe', '#60a5fa'),
    'M0 112 H256 V140 H0 Z',
  );
  // metal bands
  p.part('M44 128 L212 128 L212 140 L44 140 Z', '#475569');
  p.part('M78 78 L92 76 L92 220 L78 220 Z', '#64748b');
  p.part('M164 76 L178 78 L178 220 L164 220 Z', '#475569');
  // lock with a frosty keyhole
  p.part('M114 128 L142 128 L142 160 L114 160 Z', p.grad('#fde68a', '#d4a72c'));
  p.part(ell(128, 140, 4, 4), '#3f2a0b');
  p.part('M126 142 L130 142 L131 150 L125 150 Z', '#3f2a0b');
  // icicles
  for (const x of [56, 104, 152, 200]) p.part(`M${x - 6} 140 L${x + 6} 140 L${x} 156 Z`, '#dbeafe');
  // suspicious face on the lid
  p.eye(108, 106, 8, 9, '#0ea5e9', 0.8).eye(148, 106, 8, 9, '#0ea5e9', 0.8);
  p.line('M96 94 L118 98 M160 94 L138 98', 4);
  p.blush(96, 120, 6).blush(160, 120, 6);
  p.gloss(70, 98, 14, 6, -20);
  return ground(128, 90) + p;
};

/* Hodlberg — an unmovable iceberg: you only see the tip of what it holds. */
const hodlberg: Draw = (id) => {
  const p = new Painter(id, '#1e3a5f', 5);
  // sea
  p.raw(
    `<clipPath id="${id}-sea"><rect x="8" y="118" width="240" height="122" rx="22"/></clipPath>`,
  );
  p.raw(
    `<rect x="8" y="118" width="240" height="122" rx="22" fill="${p.grad('#7dd3fc', '#0369a1')}"/>`,
  );
  // the huge part under the water
  p.raw(`<g clip-path="url(#${id}-sea)" opacity="0.75">`);
  p.part(
    'M40 118 C30 160 44 210 90 232 C120 244 156 244 184 230 C224 210 230 160 214 118 Z',
    p.grad('#e0f2fe', '#7dd3fc'),
  );
  coin(p, 100, 186, 12);
  coin(p, 130, 204, 12);
  coin(p, 160, 182, 12);
  coin(p, 128, 168, 9);
  p.raw('</g>');
  // waves
  p.line(
    'M8 120 Q22 112 36 120 T64 120 T92 120 M164 120 Q178 112 192 120 T220 120 T248 120',
    4,
    '#e0f2fe',
  );
  // the tip with a determined face
  p.part(
    'M70 122 L96 62 L116 78 L134 32 L160 70 L176 58 L192 122 Z',
    p.grad(...ICE),
    'M134 20 L210 130 L134 130 Z',
  );
  p.part('M96 62 L104 82 L116 78 Z M134 32 L128 64 L140 56 Z', '#ffffff');
  p.eye(116, 98, 8, 10, '#0369a1', 0).eye(148, 98, 8, 10, '#0369a1', 0);
  brows(p, 132, 86, 32, 14, 4);
  p.line('M122 114 L142 114', 3.5);
  p.gloss(98, 92, 8, 4, -50);
  p.raw(sparkle(206, 50, 9, '#bfdbfe') + sparkle(46, 66, 6, '#bfdbfe'));
  return p.toString();
};

/* ================================ Airdrop: seeds, gliders, gifts ================================ */

/* Dropling — a seed on a parachute that lands where you least expect it. */
const dropling: Draw = (id) => {
  const p = new Painter(id, '#5a2a0c');
  p.glow(128, 150, 96, '#bae6fd', 0.5);
  const canopy =
    'M44 92 C48 46 88 22 128 22 C168 22 208 46 212 92 C196 84 180 84 170 92 C156 84 140 84 128 92 C116 84 100 84 86 92 C76 84 60 84 44 92 Z';
  p.part(canopy, '#fff7ed');
  p.raw(`<clipPath id="${id}-cn"><path d="${canopy}"/></clipPath>`);
  for (const [a, b] of [
    [44, 86],
    [128, 170],
  ] as const) {
    p.raw(
      `<path d="M${a} 100 C${a + 4} 40 ${a + 30} 20 ${(a + b) / 2} 20 C${b - 2} 30 ${b} 60 ${b} 100 Z" fill="#ef4444" clip-path="url(#${id}-cn)"/>`,
    );
  }
  p.raw(
    `<path d="M0 60 H256 V100 H0 Z" fill="#1d1630" opacity="0.12" clip-path="url(#${id}-cn)"/>`,
  );
  p.line(canopy, 4.5);
  p.line('M48 92 L108 150 M86 92 L116 146 M170 92 L140 146 M208 92 L148 150', 2.5);
  p.part(
    'M128 228 C100 228 86 206 88 180 C90 156 108 138 128 138 C148 138 166 156 168 180 C170 206 156 228 128 228 Z',
    p.grad('#fef3c7', '#fcd34d', '#d97706'),
    crescent(128, 184, 40, 46, -10, -8),
  );
  p.line('M128 146 C122 170 122 200 128 222', 2.5, '#b45309');
  p.part('M128 140 C120 126 108 122 98 126 C104 138 116 142 128 140 Z', '#4ade80');
  p.part('M128 140 C136 124 150 120 160 124 C154 138 140 142 128 140 Z', '#22c55e');
  p.gloss(108, 160, 9, 5);
  p.eye(112, 180, 9, 11, '#16a34a', 0).eye(144, 180, 9, 11, '#16a34a', 0);
  p.blush(100, 198, 6).blush(156, 198, 6);
  p.openMouth(128, 198, 13);
  return ground(128, 34, 244) + p;
};

/* Claimglider — a winged seed-sprite that always reaches the giveaway first, gift in hand. */
const claimglider: Draw = (id) => {
  const p = new Painter(id, '#4a2a0a');
  p.glow(128, 130, 112, '#bae6fd', 0.6);
  // speed lines
  p.line('M20 160 L52 160 M14 178 L40 178 M26 196 L54 196', 3.5, '#7dd3fc');
  // samara wings
  p.part(
    'M118 112 C84 66 38 54 16 66 C34 98 80 124 116 126 Z',
    p.grad('#fef3c7', '#fcd34d', '#d97706'),
    'M16 66 C34 98 80 124 116 126 L116 140 L10 140 Z',
  );
  p.part(
    'M138 112 C172 66 218 54 240 66 C222 98 176 124 140 126 Z',
    p.grad('#fef3c7', '#fcd34d', '#d97706'),
    'M240 66 C222 98 176 124 140 126 L140 140 L246 140 Z',
  );
  p.line('M116 118 C86 100 56 82 26 68 M140 118 C170 100 200 82 230 68', 2.5, '#b45309');
  p.line('M90 110 L84 96 M64 96 L60 84 M166 110 L172 96 M192 96 L196 84', 2, '#b45309');
  // body
  p.part(
    'M128 210 C104 210 94 190 96 166 C98 140 110 122 128 122 C146 122 158 140 160 166 C162 190 152 210 128 210 Z',
    p.grad('#d9f99d', '#4ade80', '#15803d'),
    crescent(128, 166, 32, 44, -8, -8),
  );
  p.patch(ell(128, 180, 18, 20), '#f0fdf4', 0.6);
  // leaf crest
  p.part('M128 124 C118 104 120 88 128 78 C136 88 138 104 128 124 Z', '#22c55e');
  p.part('M120 130 C104 122 96 108 98 96 C110 102 118 114 122 126 Z', '#4ade80');
  // gift box held in front
  p.part('M106 196 L150 196 L150 228 L106 228 Z', '#ef4444');
  p.part('M100 186 L156 186 L156 198 L100 198 Z', '#f87171');
  p.line('M128 186 L128 228', 5, '#fde047');
  p.part('M128 186 C114 172 106 180 112 186 Z', '#fde047').part(
    'M128 186 C142 172 150 180 144 186 Z',
    '#fde047',
  );
  p.part(ell(104, 194, 8, 7), '#4ade80').part(ell(152, 194, 8, 7), '#22c55e');
  p.eye(116, 150, 8, 10, '#0ea5e9', 0.4).eye(142, 150, 8, 10, '#0ea5e9', 0.4);
  p.blush(106, 166, 5).blush(152, 166, 5);
  p.line('M122 168 Q130 174 138 168', 3);
  return ground(128, 46, 240) + p;
};

/* Airdragon — a cloud dragon that hands out gifts as it glides. */
const airdragon: Draw = (id) => {
  const p = new Painter(id, '#1e3a5f', 5);
  p.glow(128, 130, 124, '#bae6fd', 0.7);
  // gifts on little parachutes
  for (const [x, y] of [
    [40, 172],
    [214, 196],
  ] as const) {
    p.part(
      `M${x - 16} ${y - 20} C${x - 14} ${y - 36} ${x + 14} ${y - 36} ${x + 16} ${y - 20} Z`,
      '#fef3c7',
    );
    p.line(`M${x - 14} ${y - 20} L${x - 6} ${y - 4} M${x + 14} ${y - 20} L${x + 6} ${y - 4}`, 2);
    p.part(
      `M${x - 9} ${y - 6} L${x + 9} ${y - 6} L${x + 9} ${y + 10} L${x - 9} ${y + 10} Z`,
      '#ef4444',
    );
    p.line(`M${x} ${y - 6} L${x} ${y + 10}`, 3, '#fde047');
  }
  // cloud wings
  const cloud = p.grad('#ffffff', '#e0f2fe', '#93c5fd');
  p.part(
    'M98 112 C80 70 40 52 14 64 C22 76 20 90 30 98 C18 110 26 126 42 126 C40 140 56 148 70 140 C80 150 98 146 104 132 Z',
    cloud,
    'M0 120 L120 100 V160 H0 Z',
    { shade: '#bfdbfe' },
  );
  p.part(
    'M158 112 C176 70 216 52 242 64 C234 76 236 90 226 98 C238 110 230 126 214 126 C216 140 200 148 186 140 C176 150 158 146 152 132 Z',
    cloud,
    'M256 120 L136 100 V160 H256 Z',
    { shade: '#bfdbfe' },
  );
  // tail curling down
  p.part(
    'M150 196 C186 210 214 196 214 170 C214 160 226 160 228 170 C232 210 190 226 146 214 Z',
    p.grad('#e0f2fe', '#7dd3fc', '#0284c7'),
  );
  p.part('M222 168 C230 154 244 156 246 166 C238 168 232 172 228 178 Z', '#ffffff');
  // body
  p.part(
    'M90 168 C90 132 108 112 128 112 C148 112 166 132 166 168 C166 198 150 218 128 218 C106 218 90 198 90 168 Z',
    p.grad('#e0f2fe', '#7dd3fc', '#0284c7'),
    crescent(128, 164, 38, 54, -10, -8),
  );
  p.patch('M108 210 C102 186 108 160 128 150 C148 160 154 186 148 210 Z', '#f0f9ff', 0.85);
  for (const y of [166, 182, 198]) p.line(`M116 ${y} Q128 ${y + 4} 140 ${y}`, 2.5, '#7dd3fc');
  feet(p, 108, 150, 222, 13, 8, '#38bdf8');
  // head with cloud mane and horns
  p.part(
    'M84 82 C76 66 86 52 100 54 C102 40 120 34 128 44 C138 34 154 40 156 54 C170 52 180 66 172 82 Z',
    '#ffffff',
  );
  p.part('M104 60 L96 36 L114 52 Z', '#fde68a').part('M152 60 L160 36 L142 52 Z', '#fcd34d');
  p.part(
    'M94 96 C94 74 108 62 128 62 C148 62 162 74 162 96 C162 112 152 124 128 124 C104 124 94 112 94 96 Z',
    p.grad('#e0f2fe', '#7dd3fc', '#0284c7'),
    crescent(128, 92, 34, 32, -8, -8),
  );
  p.patch(ell(128, 112, 14, 8), '#f0f9ff');
  p.eye(112, 90, 7, 9, '#0369a1', 0.2).eye(144, 90, 7, 9, '#0369a1', 0.2);
  p.line('M118 116 Q128 122 138 116', 3);
  return ground(128, 70) + p;
};

export const LINES_C: Record<string, Draw> = {
  pebblock,
  blockgolem,
  petagolem,
  frostkey,
  coldvault,
  hodlberg,
  dropling,
  claimglider,
  airdragon,
};
