import { type Draw, brows, coin, face, feet, label } from './common.js';
import { Painter, crescent, ell, ground } from './kit.js';

/* =============================== Yield: sprouts, stalks, trees =============================== */

const LEAF = ['#bbf7d0', '#4ade80', '#16a34a'] as const;

/* Yieldling — a sprout that bears fruit if you leave it alone. */
const yieldling: Draw = (id) => {
  const p = new Painter(id, '#14532d');
  p.glow(128, 150, 96, '#bbf7d0', 0.6);
  p.part('M100 214 C92 224 82 228 74 226 C84 220 90 214 94 206 Z', '#a16207');
  p.part('M156 214 C164 224 174 228 182 226 C172 220 166 214 162 206 Z', '#a16207');
  p.part('M124 112 C122 92 124 78 130 66 L136 68 C132 80 130 94 132 112 Z', '#4ade80');
  p.part(
    'M130 72 C110 46 76 46 62 62 C80 82 112 86 130 72 Z',
    p.grad(...LEAF),
    'M62 62 C80 82 112 86 130 72 L130 90 L60 90 Z',
  );
  p.part(
    'M132 70 C150 38 186 32 204 46 C190 72 156 80 132 70 Z',
    p.grad(...LEAF),
    'M204 46 C190 72 156 80 132 70 L132 92 L210 92 Z',
  );
  p.line('M128 70 C108 64 88 62 72 62', 2.5, '#166534').line(
    'M134 68 C154 56 176 48 196 47',
    2.5,
    '#166534',
  );
  coin(p, 132, 58, 9);
  p.part(
    'M78 168 C78 132 100 110 128 110 C156 110 178 132 178 168 C178 200 156 218 128 218 C100 218 78 200 78 168 Z',
    p.grad('#d9f99d', '#86efac', '#22c55e'),
    crescent(128, 164, 50, 54, -12, -10),
  );
  p.patch(ell(128, 188, 28, 22), '#f0fdf4', 0.6);
  p.gloss(102, 132, 12, 6);
  p.part('M82 170 C64 168 54 156 54 146 C68 146 80 154 86 162 Z', '#4ade80');
  p.part('M174 170 C192 168 202 156 202 146 C188 146 176 154 170 162 Z', '#22c55e');
  p.closedEye(110, 160, 18).closedEye(148, 160, 18);
  p.blush(96, 176).blush(160, 176);
  p.line('M120 178 Q129 186 138 178', 4);
  p.raw(label(192, 118, 20, '#15803d', 'z') + label(206, 100, 14, '#15803d', 'z'));
  return ground(128, 64) + p;
};

/* Stakestalk — a locked stalk that grows on interest: a padlock on its belly, coin buds on its leaves. */
const stakestalk: Draw = (id) => {
  const p = new Painter(id, '#14532d');
  p.glow(128, 140, 108, '#bbf7d0', 0.55);
  // root feet
  p.part('M104 214 C94 226 80 230 70 226 C82 220 90 212 96 202 Z', '#a16207');
  p.part('M152 214 C162 226 176 230 186 226 C174 220 166 212 160 202 Z', '#a16207');
  // big leaves with coin buds
  p.part(
    'M112 110 C86 70 46 70 28 90 C50 116 92 122 112 110 Z',
    p.grad(...LEAF),
    'M28 90 C50 116 92 122 112 110 L112 130 L20 130 Z',
  );
  p.part(
    'M144 110 C170 70 210 70 228 90 C206 116 164 122 144 110 Z',
    p.grad(...LEAF),
    'M228 90 C206 116 164 122 144 110 L144 130 L236 130 Z',
  );
  p.line('M108 108 C84 96 60 90 38 90 M148 108 C172 96 196 90 218 90', 2.5, '#166534');
  coin(p, 40, 74, 9);
  coin(p, 216, 74, 9);
  // crown of three leaves and a stalk
  p.part('M124 70 C110 44 116 24 128 14 C140 24 146 44 132 70 Z', p.grad(...LEAF));
  p.part('M120 74 C100 64 88 46 90 32 C108 36 120 52 124 70 Z', '#4ade80');
  p.part('M136 74 C156 64 168 46 166 32 C148 36 136 52 132 70 Z', '#22c55e');
  // tall body
  p.part(
    'M92 206 C86 160 92 112 128 88 C164 112 170 160 164 206 C158 222 98 222 92 206 Z',
    p.grad('#d9f99d', '#86efac', '#16a34a'),
    crescent(128, 156, 40, 70, -12, -6),
  );
  p.line('M106 120 C102 150 102 180 108 206 M150 120 C154 150 154 180 148 206', 2.5, '#22c55e');
  // padlock belly
  p.line('M116 172 L116 160 C116 148 140 148 140 160 L140 172', 5, '#78716c');
  p.part('M108 170 L148 170 L148 200 L108 200 Z', p.grad('#fde68a', '#d4a72c'));
  p.part(ell(128, 182, 4, 4), '#3f2a0b');
  p.part('M126 184 L130 184 L131 192 L125 192 Z', '#3f2a0b');
  p.gloss(110, 108, 8, 4);
  face(p, 128, 126, 30, 8, '#16a34a', 'smile');
  return ground(128, 64) + p;
};

/* Yieldrasil — the world tree whose roots charge interest to every realm. */
const yieldrasil: Draw = (id) => {
  const p = new Painter(id, '#3a2208', 5);
  p.glow(128, 120, 124, '#bbf7d0', 0.6);
  // roots spreading out
  p.part('M84 214 C64 216 40 226 22 230 L44 222 C58 214 70 206 84 200 Z', '#92400e');
  p.part('M172 214 C192 216 216 226 234 230 L212 222 C198 214 186 206 172 200 Z', '#92400e');
  // canopy of three leaf clouds
  const canopy = p.grad('#bbf7d0', '#4ade80', '#15803d');
  p.part(
    'M30 104 C20 76 44 52 70 58 C76 30 112 20 132 36 C150 18 190 24 196 52 C226 50 240 82 224 104 C232 128 208 148 184 138 C170 154 140 154 128 140 C112 156 80 154 72 138 C44 146 20 128 30 104 Z',
    canopy,
    'M0 110 Q128 160 256 110 V256 H0 Z',
  );
  // golden fruit and coins in the canopy
  for (const [x, y, r] of [
    [60, 94, 9],
    [104, 60, 8],
    [160, 52, 9],
    [206, 94, 8],
    [128, 104, 7],
    [178, 118, 7],
  ] as const)
    coin(p, x, y, r);
  // trunk body with arm branches
  p.part('M60 150 C42 140 36 124 40 112 C52 120 64 128 82 140 Z', '#a16207');
  p.part('M196 150 C214 140 220 124 216 112 C204 120 192 128 174 140 Z', '#92400e');
  p.part(
    'M88 226 C86 196 82 164 92 136 L164 136 C174 164 170 196 168 226 Z',
    p.grad('#d6a774', '#a16207', '#713f12'),
    crescent(128, 180, 44, 60, -10, -6),
  );
  p.line(
    'M104 150 C100 176 104 200 102 222 M152 150 C156 176 152 200 154 222 M128 194 C124 206 128 216 126 224',
    2.5,
    '#713f12',
  );
  // moss
  p.patch('M92 140 C110 150 146 150 164 140 C160 154 96 154 92 140 Z', '#4ade80');
  // wise face
  p.eye(112, 168, 8, 10, '#22c55e', 0).eye(144, 168, 8, 10, '#22c55e', 0);
  p.line('M98 152 Q112 146 122 154 M158 152 Q144 146 134 154', 4);
  p.line('M116 192 Q128 200 140 192', 4);
  // beard of moss
  p.patch('M110 198 C116 214 140 214 146 198 C140 204 116 204 110 198 Z', '#86efac');
  return ground(128, 100) + p;
};

/* ================================== FUD: gremlins and rugs ================================== */

const FUR = ['#c4b5fd', '#8b5cf6', '#5b21b6'] as const;

/* Fuddle — a gremlin with huge ears that whispers "it's going to crash" into yours. */
const fuddle: Draw = (id) => {
  const p = new Painter(id, '#2a0f4f');
  const fur = p.grad(...FUR);
  p.glow(128, 150, 100, '#c4b5fd', 0.45);
  p.part(
    'M178 62 C172 48 186 38 198 46 C204 34 222 36 224 50 C236 50 238 66 228 70 L182 72 C174 72 172 64 178 62 Z',
    '#6b5b8a',
  );
  p.line('M190 80 L186 92 M204 80 L200 94 M218 80 L214 90', 3, '#6b5b8a');
  p.line('M160 204 C196 210 208 186 200 164', 4.5);
  p.part('M196 152 L212 160 L198 174 Z', '#7c3aed');
  p.part(
    'M92 120 C56 116 26 92 22 70 C52 70 82 84 102 104 Z',
    fur,
    'M22 70 C52 70 82 84 102 104 L102 130 L20 130 Z',
  );
  p.patch('M86 112 C62 106 44 92 38 80 C58 84 76 94 90 104 Z', '#f9a8d4');
  p.part(
    'M164 120 C200 116 230 92 234 70 C204 70 174 84 154 104 Z',
    fur,
    'M234 70 C204 70 174 84 154 104 L154 130 L236 130 Z',
  );
  p.patch('M170 112 C194 106 212 92 218 80 C198 84 180 94 166 104 Z', '#f9a8d4');
  p.part('M98 226 L92 214 L118 214 L116 226 Z', '#6d28d9').part(
    'M140 226 L140 214 L166 214 L160 226 Z',
    '#6d28d9',
  );
  p.part(
    'M92 216 C88 184 104 164 128 164 C152 164 168 184 164 216 Z',
    fur,
    crescent(128, 192, 38, 30, -10, -6),
  );
  p.patch(ell(128, 198, 18, 16), '#ede9fe', 0.7);
  p.part('M108 90 L102 70 L118 84 Z', '#fde68a').part('M148 90 L154 70 L138 84 Z', '#fde68a');
  p.part(ell(128, 126, 42, 38), fur, crescent(128, 126, 42, 38));
  p.gloss(108, 104, 10, 5);
  p.eye(112, 124, 9, 11, '#facc15', 0.6).eye(146, 124, 9, 11, '#facc15', 0.6);
  p.line('M100 110 L120 116', 4).line('M158 110 L138 116', 4);
  p.line('M112 146 Q128 156 148 140', 4);
  p.part('M136 148 L140 156 L144 146 Z', '#ffffff');
  p.part(ell(158, 150, 11, 10), '#a78bfa');
  return ground(128, 62) + p;
};

/* Ruglet — a flying squirrel in a bandit mask whose gliding membrane is a patterned rug. */
const ruglet: Draw = (id) => {
  const p = new Painter(id, '#2e1065');
  const fur = p.grad(...FUR);
  p.glow(128, 150, 112, '#c4b5fd', 0.45);
  for (let x = 54; x <= 202; x += 12) p.line(`M${x} 198 L${x - 2} 212`, 3.5, '#fbbf24');
  p.part(
    'M40 118 Q128 98 216 118 L206 198 Q128 212 50 198 Z',
    p.grad('#a78bfa', '#7c3aed', '#4c1d95'),
    'M0 170 Q128 196 256 170 V256 H0 Z',
  );
  p.line('M52 128 Q128 112 204 128 L196 188 Q128 200 60 188 Z', 3.5, '#fbbf24');
  for (const x of [72, 184]) {
    p.patch(`M${x} 140 L${x + 12} 156 L${x} 172 L${x - 12} 156 Z`, '#f472b6');
    p.patch(`M${x} 148 L${x + 6} 156 L${x} 164 L${x - 6} 156 Z`, '#fbbf24');
  }
  feet(p, 112, 146, 222, 12, 7, '#7c3aed');
  p.part(ell(128, 182, 32, 40), fur, crescent(128, 182, 32, 40));
  p.patch(ell(126, 190, 18, 26), '#ede9fe', 0.8);
  p.part('M92 104 L86 62 L118 88 Z', fur).patch('M95 96 L92 74 L108 88 Z', '#f9a8d4');
  p.part('M164 104 L170 62 L138 88 Z', fur, 'M170 62 L164 104 L150 96 Z').patch(
    'M161 96 L164 74 L148 88 Z',
    '#f9a8d4',
  );
  p.part(ell(128, 120, 44, 36), fur, crescent(128, 120, 44, 36));
  p.patch('M86 114 Q128 96 170 114 Q172 132 152 132 Q128 122 104 132 Q84 132 86 114 Z', '#2e1065');
  p.eye(110, 118, 8, 10, '#f472b6', 0.5).eye(146, 118, 8, 10, '#f472b6', 0.5);
  p.line('M98 104 L120 110', 4).line('M158 104 L136 110', 4);
  p.patch(ell(128, 134, 4, 3), '#2e1065');
  p.line('M116 142 Q130 150 142 138', 3.5);
  p.gloss(104, 100, 9, 4);
  return ground(128, 84) + p;
};

/* Rugpullor — a giant manta-rug that vanishes with everything standing on it. */
const rugpullor: Draw = (id) => {
  const p = new Painter(id, '#1e0b3d', 5);
  p.glow(128, 140, 124, '#a78bfa', 0.55);
  // coins sliding off into the void
  coin(p, 36, 200, 9);
  coin(p, 222, 206, 8);
  coin(p, 202, 226, 6);
  p.line('M30 182 L24 172 M44 182 L46 172 M216 190 L210 180', 3, '#a78bfa');
  // tail with a tassel
  p.line('M150 178 C176 208 210 214 236 196', 6);
  p.line('M236 196 L244 184 M236 196 L248 198 M236 196 L242 210', 3.5, '#fbbf24');
  // wing-rug
  const rug =
    'M128 70 C164 70 186 84 204 100 C222 92 240 96 250 110 C230 116 222 132 220 150 C206 176 172 186 128 186 C84 186 50 176 36 150 C34 132 26 116 6 110 C16 96 34 92 52 100 C70 84 92 70 128 70 Z';
  p.part(rug, p.grad('#c4b5fd', '#7c3aed', '#3b0764'), 'M0 150 Q128 196 256 150 V256 H0 Z');
  p.raw(`<clipPath id="${id}-rug"><path d="${rug}"/></clipPath>`);
  p.raw(`<g clip-path="url(#${id}-rug)">`);
  p.line('M20 120 Q128 92 236 120 M24 150 Q128 176 232 150', 5, '#fbbf24');
  for (const x of [48, 88, 168, 208]) {
    p.patch(`M${x} 122 L${x + 12} 136 L${x} 150 L${x - 12} 136 Z`, '#f472b6');
    p.patch(`M${x} 130 L${x + 5} 136 L${x} 142 L${x - 5} 136 Z`, '#fbbf24');
  }
  p.raw('</g>');
  for (let x = 44; x <= 212; x += 12)
    p.line(`M${x} ${176 + Math.abs(x - 128) * -0.12 + 6} l-2 12`, 3, '#fbbf24');
  // horn-like front lobes
  p.part('M100 76 C92 58 96 42 106 34 C112 50 116 62 118 72 Z', '#7c3aed');
  p.part('M156 76 C164 58 160 42 150 34 C144 50 140 62 138 72 Z', '#6d28d9');
  // face
  p.eye(106, 112, 11, 12, '#f472b6', 0.3).eye(150, 112, 11, 12, '#f472b6', 0.3);
  brows(p, 128, 96, 44, 22, 6);
  p.part('M92 134 Q128 168 164 134 Q128 150 92 134 Z', '#3b0764');
  p.patch(
    'M102 138 L108 146 L114 141 L120 148 L126 142 L132 148 L138 141 L144 146 L150 138 Z',
    '#ffffff',
  );
  p.gloss(86, 90, 16, 6, -18);
  return ground(128, 104) + p;
};

/* ============================== Oracle: sunrise, optimism, truth ============================== */

const SUN = ['#fffbeb', '#fde68a', '#f59e0b'] as const;

/* Gmlet — a sunny chick that says good morning to everyone at dawn. */
const gmlet: Draw = (id) => {
  const p = new Painter(id, '#7a4a05');
  p.glow(128, 150, 104, '#fde68a', 0.7);
  // sunrise rays behind
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i * Math.PI) / 8;
    const x1 = 128 + Math.cos(a) * 92;
    const y1 = 160 + Math.sin(a) * 92;
    const x2 = 128 + Math.cos(a) * 112;
    const y2 = 160 + Math.sin(a) * 112;
    p.line(`M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`, 6, '#fcd34d');
  }
  // feet
  p.line('M108 214 L104 228 M108 214 L112 228 M148 214 L144 228 M148 214 L152 228', 4, '#f97316');
  // round body
  p.part(ell(128, 160, 62, 58), p.grad(...SUN), crescent(128, 160, 62, 58, -12, -10));
  p.patch(ell(128, 186, 34, 24), '#ffffff', 0.55);
  // waving wing
  p.part('M66 156 C46 142 42 118 52 104 C64 116 72 132 78 148 Z', '#fcd34d');
  p.part('M188 168 C204 176 208 190 204 200 C192 194 184 184 182 174 Z', '#f59e0b');
  // three-feather crest like a little sun
  p.part('M118 104 C112 88 116 76 124 70 C126 84 128 94 128 104 Z', '#fb923c');
  p.part('M128 104 C128 84 134 72 144 66 C144 82 140 94 134 106 Z', '#f97316');
  p.part('M136 106 C142 94 152 88 160 88 C156 98 148 106 140 110 Z', '#fb923c');
  p.gloss(98, 126, 13, 6);
  p.eye(110, 152, 9, 12, '#f59e0b', 0).eye(146, 152, 9, 12, '#f59e0b', 0);
  p.blush(92, 172).blush(164, 172);
  p.part('M118 168 L138 168 L128 180 Z', '#f97316');
  // speech bubble
  p.part(
    'M178 70 C178 56 190 48 206 48 C222 48 234 56 234 70 C234 84 222 92 206 92 L198 92 L186 104 L188 90 C182 86 178 78 178 70 Z',
    '#ffffff',
  );
  p.raw(label(206, 78, 20, '#7a4a05', 'gm'));
  return ground(128, 66) + p;
};

/* Wagmight — an optimistic warrior bird who rallies the team with a banner. */
const wagmight: Draw = (id) => {
  const p = new Painter(id, '#6b3a05', 5);
  p.glow(128, 140, 116, '#fde68a', 0.6);
  // banner on a pole
  p.line('M196 228 L196 40', 6, '#78350f');
  p.part('M196 44 L248 52 L236 72 L248 92 L196 88 Z', p.grad('#fef3c7', '#facc15'));
  p.raw(label(220, 76, 15, '#6b3a05', '↑↑'));
  // tail feathers
  p.part('M84 196 C56 196 36 176 34 152 C52 164 66 170 84 172 Z', '#f59e0b');
  p.part('M86 184 C60 174 50 150 54 130 C66 146 78 156 92 162 Z', '#fbbf24');
  feet(p, 108, 148, 224, 15, 8, '#f97316');
  // body
  p.part(
    'M76 170 C76 124 100 100 128 100 C156 100 180 124 180 170 C180 204 158 222 128 222 C98 222 76 204 76 170 Z',
    p.grad(...SUN),
    crescent(128, 162, 52, 62, -12, -10),
  );
  p.patch(ell(128, 182, 30, 30), '#fff7ed', 0.65);
  // chest plate
  p.part('M106 150 L150 150 L146 182 L128 194 L110 182 Z', p.grad('#e5e7eb', '#9ca3af'));
  p.part('M128 158 L134 170 L128 182 L122 170 Z', '#facc15');
  // wing raised, gripping the banner pole
  p.part('M176 150 C190 132 194 112 192 96 C204 104 208 124 200 146 Z', '#f59e0b');
  p.part(ell(196, 102, 10, 10), '#fbbf24');
  p.part('M80 150 C64 162 60 180 66 196 C78 188 86 172 88 158 Z', '#f59e0b');
  // head crest and headband
  p.part('M110 70 C104 50 112 34 124 28 C124 46 128 58 132 70 Z', '#fb923c');
  p.part('M128 70 C130 48 142 36 156 34 C152 50 146 62 138 74 Z', '#f97316');
  p.part(ell(128, 100, 40, 34), p.grad(...SUN), crescent(128, 100, 40, 34, -8, -8));
  p.part('M88 92 Q128 78 168 92 L168 102 Q128 88 88 102 Z', '#dc2626');
  p.part('M88 96 L70 88 L76 104 Z', '#dc2626');
  p.eye(112, 104, 8, 10, '#f59e0b', 0.2).eye(144, 104, 8, 10, '#f59e0b', 0.2);
  p.part('M118 116 L140 116 L128 130 Z', '#f97316');
  p.line('M118 116 Q128 122 140 116', 2.5);
  return ground(128, 84) + p;
};

/* Oraclion — a lion with a sunburst mane that only roars with verified data. */
const oraclion: Draw = (id) => {
  const p = new Painter(id, '#5a3405', 5);
  p.glow(128, 130, 124, '#fde68a', 0.7);
  // sunburst mane
  const mane: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI * 2) / 16;
    const b = a + Math.PI / 16;
    const c = a + (2 * Math.PI) / 16;
    const pt = (r: number, t: number) =>
      `${(128 + Math.cos(t) * r).toFixed(1)} ${(110 + Math.sin(t) * r).toFixed(1)}`;
    mane.push(`${i === 0 ? 'M' : 'L'}${pt(64, a)} L${pt(86, b)} L${pt(64, c)}`);
  }
  p.part(
    mane.join(' ') + ' Z',
    p.grad('#fef3c7', '#f59e0b', '#b45309'),
    'M0 120 L256 90 V256 H0 Z',
  );
  // tail with a data tuft
  p.line('M170 206 C208 210 222 186 214 164', 6, '#d97706');
  p.part(ell(214, 156, 10, 12), '#b45309');
  // body sitting
  feet(p, 102, 154, 224, 17, 9, '#f59e0b');
  p.part(
    'M84 224 C78 190 92 162 128 160 C164 162 178 190 172 224 Z',
    p.grad('#fef3c7', '#fbbf24', '#d97706'),
    crescent(128, 196, 46, 40, -10, -6),
  );
  p.patch('M108 222 C104 200 114 180 128 178 C142 180 152 200 148 222 Z', '#fffbeb', 0.7);
  // verified badge on the chest
  p.part(ell(128, 196, 14, 14), '#2563eb');
  p.line('M121 196 L126 202 L136 190', 3.5, '#ffffff');
  // head
  p.part(
    ell(128, 112, 50, 46),
    p.grad('#fffbeb', '#fcd34d', '#d97706'),
    crescent(128, 112, 50, 46),
  );
  p.part(ell(88, 76, 12, 12), '#fbbf24').part(ell(168, 76, 12, 12), '#f59e0b');
  p.patch(ell(88, 78, 6, 6), '#b45309').patch(ell(168, 78, 6, 6), '#92400e');
  // forehead third-eye gem: the oracle
  p.part('M128 80 L136 90 L128 100 L120 90 Z', '#38bdf8');
  p.eye(108, 110, 9, 11, '#0ea5e9', 0).eye(148, 110, 9, 11, '#0ea5e9', 0);
  brows(p, 128, 96, 40, 16, 3);
  p.patch(ell(128, 134, 18, 12), '#fffbeb');
  p.part('M120 126 L136 126 L128 134 Z', '#7c2d12');
  p.line('M118 140 Q128 146 138 140', 3.5);
  p.gloss(102, 88, 10, 5);
  return ground(128, 84) + p;
};

export const LINES_B: Record<string, Draw> = {
  yieldling,
  stakestalk,
  yieldrasil,
  fuddle,
  ruglet,
  rugpullor,
  gmlet,
  wagmight,
  oraclion,
};
