import { Painter, crescent, ell } from './kit.js';

/** Draws one creature (without rarity sparkles); `id` keeps clip and gradient ids unique. */
export type Draw = (id: string) => string;

export const GOLD = '#f6c445';
export const GOLD_DARK = '#b9831a';

/** A generic gold coin (no real currency symbol). */
export function coin(p: Painter, x: number, y: number, r: number): Painter {
  p.part(ell(x, y, r, r), GOLD, crescent(x, y, r, r, -r * 0.3, -r * 0.3));
  return p.line(ell(x, y, r * 0.55, r * 0.55), Math.max(2, r * 0.18), GOLD_DARK);
}

/** A pair of feet. */
export function feet(
  p: Painter,
  x1: number,
  x2: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
): Painter {
  p.part(ell(x1, y, rx, ry), color);
  return p.part(ell(x2, y, rx, ry), color, crescent(x2, y, rx, ry, -rx * 0.3, -ry * 0.4));
}

/** Two glossy eyes, a blush and a mouth: the standard face. */
export function face(
  p: Painter,
  x: number,
  y: number,
  gap: number,
  size: number,
  iris: string,
  mouth: 'open' | 'smile' | 'smirk' | 'grin' | 'none' = 'smile',
  look = 0,
): Painter {
  const rx = size;
  const ry = size * 1.25;
  p.eye(x - gap / 2, y, rx, ry, iris, look).eye(x + gap / 2, y, rx, ry, iris, look);
  p.blush(x - gap / 2 - size * 0.6, y + ry + 6, size * 0.65).blush(
    x + gap / 2 + size * 0.6,
    y + ry + 6,
    size * 0.65,
  );
  const my = y + ry + size * 0.9;
  const w = size * 1.5;
  if (mouth === 'open') p.openMouth(x, my, w);
  if (mouth === 'smile')
    p.line(`M${x - w / 2} ${my} Q${x} ${my + w * 0.5} ${x + w / 2} ${my}`, 3.5);
  if (mouth === 'smirk')
    p.line(
      `M${x - w / 2} ${my + 2} Q${x + w * 0.1} ${my + w * 0.45} ${x + w / 2} ${my - w * 0.2}`,
      3.5,
    );
  if (mouth === 'grin') {
    p.part(`M${x - w * 0.7} ${my - 2} Q${x} ${my + w * 0.9} ${x + w * 0.7} ${my - 2} Z`, '#5b1f33');
    p.patch(
      `M${x - w * 0.55} ${my + 1} L${x + w * 0.55} ${my + 1} L${x + w * 0.5} ${my + w * 0.18} L${x - w * 0.5} ${my + w * 0.18} Z`,
      '#ffffff',
    );
  }
  return p;
}

/** Heavy brows for fierce or scheming faces. */
export function brows(p: Painter, x: number, y: number, gap: number, w: number, tilt = 6): Painter {
  return p
    .line(`M${x - gap / 2 - w / 2} ${y - tilt} L${x - gap / 2 + w / 2} ${y + tilt}`, 4.5)
    .line(`M${x + gap / 2 + w / 2} ${y - tilt} L${x + gap / 2 - w / 2} ${y + tilt}`, 4.5);
}

/** Text drawn on the art (labels on signs and charts). */
export const label = (
  x: number,
  y: number,
  size: number,
  fill: string,
  text: string,
  weight = 800,
) =>
  `<text x="${x}" y="${y}" font-family="system-ui,-apple-system,sans-serif" font-weight="${weight}" font-size="${size}" fill="${fill}" text-anchor="middle">${text}</text>`;
