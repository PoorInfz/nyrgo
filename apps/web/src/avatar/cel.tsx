import { useId, type ReactNode } from 'react';

/** Drawing helpers shared by the explorer and the holder outfits. */

export const INK = '#1b1530';
export const LINE = 2.2;

// ------------------------------------------------------------------ colour helpers

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const c = x.map((v, i) => Math.round(v + (y[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Anime shadows lean cool: towards a deep violet rather than black. */
export const shade = (c: string, t = 0.32) => mix(c, '#3b2466', t);
export const light = (c: string, t = 0.45) => mix(c, '#ffffff', t);

// ------------------------------------------------------------------ cel-shaded shape

/**
 * A shape with a hard shadow: filled with the shadow colour, then the base colour drawn again
 * shifted towards the light and clipped to the shape, leaving a crescent of shadow on the far
 * side. Then the outline on top.
 */
export function Cel({
  d,
  fill,
  shadow,
  dx = 2.4,
  dy = 2.6,
  stroke = INK,
  strokeWidth = LINE,
  children,
}: {
  d: string;
  fill: string;
  shadow?: string;
  dx?: number;
  dy?: number;
  stroke?: string;
  strokeWidth?: number;
  /** Extra details drawn inside the shape (clipped to it), before the outline. */
  children?: ReactNode;
}) {
  const id = useId().replace(/:/g, '');
  return (
    <g>
      <clipPath id={`c${id}`}>
        <path d={d} />
      </clipPath>
      <path d={d} fill={shadow ?? shade(fill)} />
      <g clipPath={`url(#c${id})`}>
        <path d={d} fill={fill} transform={`translate(${-dx} ${-dy})`} />
        {children}
      </g>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </g>
  );
}
