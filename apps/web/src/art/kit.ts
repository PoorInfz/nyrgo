/**
 * Drawing kit for the 2D creature art, in the style of monster-collecting games: animals with
 * bodies, limbs and tails, cel shading (one flat shadow tone per part), a coloured outline that
 * follows the body colour, and glossy anime eyes. Every creature is drawn on a 256 × 256 canvas
 * standing on a soft ground shadow. Pure string building: deterministic and testable.
 */

export const SIZE = 256;

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** Mix a colour towards white (t > 0) or black (t < 0). */
export function tone(hex: string, t: number): string {
  const rgb = toRgb(hex);
  const target = t >= 0 ? 255 : 0;
  const k = Math.abs(t);
  return toHex(rgb.map((v) => v + (target - v) * k) as [number, number, number]);
}
/** The cel-shading shadow for a colour: darker and slightly cooler. */
export function shadeOf(hex: string): string {
  const [r, g, b] = toRgb(tone(hex, -0.24));
  return toHex([r * 0.94, g * 0.96, Math.min(255, b * 1.06 + 6)]);
}

type Attrs = Record<string, string | number | undefined>;
const attrs = (a: Attrs) =>
  Object.entries(a)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');

export const EYE = '#1d1630';

/**
 * A painter for one creature. `ink` is its outline colour; parts are drawn back to front in the
 * order they are added.
 */
export class Painter {
  private out: string[] = [];
  private n = 0;
  constructor(
    private readonly id: string,
    readonly ink: string,
    readonly stroke = 4,
  ) {}

  /**
   * A soft rendered fill for a flat colour: lighter where the light hits (top left), the base
   * colour in the middle and the shade at the far edge. Cached per colour.
   */
  private grads = new Map<string, string>();
  soft(color: string): string {
    if (!color.startsWith('#')) return color;
    let id = this.grads.get(color);
    if (!id) {
      id = `${this.id}-g${this.n++}`;
      this.grads.set(color, id);
      this.out.push(
        `<radialGradient id="${id}" cx="0.36" cy="0.3" r="0.78">` +
          `<stop offset="0" stop-color="${tone(color, 0.42)}"/>` +
          `<stop offset="0.5" stop-color="${color}"/>` +
          `<stop offset="1" stop-color="${shadeOf(color)}"/></radialGradient>`,
      );
    }
    return `url(#${id})`;
  }

  raw(s: string): this {
    this.out.push(s);
    return this;
  }

  /** A filled, outlined part. With `shadow`, that region is painted in the shade colour, clipped to the part. */
  part(
    d: string,
    fill: string,
    shadow?: string,
    opts: { shade?: string; outline?: boolean } = {},
  ): this {
    const stroke = opts.outline === false ? undefined : this.ink;
    if (shadow) {
      const cid = `${this.id}-c${this.n++}`;
      this.out.push(`<clipPath id="${cid}"><path d="${d}"/></clipPath>`);
      this.out.push(`<path ${attrs({ d, fill: this.soft(fill) })}/>`);
      this.out.push(
        `<path ${attrs({ d: shadow, fill: opts.shade ?? shadeOf(fill), opacity: 0.55, 'fill-rule': 'evenodd', 'clip-path': `url(#${cid})` })}/>`,
      );
      if (stroke) this.out.push(this.outline(d));
    } else {
      this.out.push(
        `<path ${attrs({ d, fill: this.soft(fill), stroke, 'stroke-width': stroke ? this.stroke : undefined, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })}/>`,
      );
    }
    return this;
  }

  /** A linear gradient from the top left (first stop) to the bottom right (last stop). */
  grad(...stops: string[]): string {
    const gid = `${this.id}-g${this.n++}`;
    const st = stops
      .map(
        (c, i) =>
          `<stop offset="${stops.length === 1 ? 0 : i / (stops.length - 1)}" stop-color="${c}"/>`,
      )
      .join('');
    this.out.push(
      `<linearGradient id="${gid}" x1="0.2" y1="0" x2="0.8" y2="1">${st}</linearGradient>`,
    );
    return `url(#${gid})`;
  }

  /** A soft round glow (aura, embers, magic). */
  glow(cx: number, cy: number, r: number, color: string, opacity = 0.6): this {
    const gid = `${this.id}-g${this.n++}`;
    this.out.push(
      `<radialGradient id="${gid}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>` +
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${gid})"/>`,
    );
    return this;
  }

  /** A flat patch with no outline (markings, bellies, inner ears). */
  patch(d: string, fill: string, opacity?: number): this {
    this.out.push(`<path ${attrs({ d, fill, opacity })}/>`);
    return this;
  }

  /** A line in the outline colour (folds, toes, mouth). */
  line(d: string, width = this.stroke * 0.8, color = this.ink): this {
    this.out.push(
      `<path ${attrs({ d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })}/>`,
    );
    return this;
  }

  private outline(d: string): string {
    return `<path ${attrs({ d, fill: 'none', stroke: this.ink, 'stroke-width': this.stroke, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })}/>`;
  }

  /**
   * A glossy anime eye: a dark oval with a coloured lower iris and two highlights.
   * `look` shifts the iris sideways (-1 left … 1 right).
   */
  eye(x: number, y: number, rx: number, ry: number, iris: string, look = 0): this {
    const cid = `${this.id}-e${this.n++}`;
    const ox = look * rx * 0.15;
    this.out.push(
      `<clipPath id="${cid}"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/></clipPath>` +
        `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${EYE}"/>` +
        `<ellipse cx="${x + ox}" cy="${y + ry * 0.62}" rx="${rx * 0.95}" ry="${ry * 0.55}" fill="${iris}" clip-path="url(#${cid})"/>` +
        `<ellipse cx="${x + ox - rx * 0.22}" cy="${y - ry * 0.32}" rx="${rx * 0.42}" ry="${ry * 0.3}" fill="#fff"/>` +
        `<circle cx="${x + ox + rx * 0.32}" cy="${y + ry * 0.3}" r="${rx * 0.16}" fill="#fff"/>`,
    );
    return this;
  }

  /** A closed, happy eye (an upward arc). */
  closedEye(x: number, y: number, w: number): this {
    return this.line(
      `M${x - w / 2} ${y + 2} Q${x} ${y - w * 0.55} ${x + w / 2} ${y + 2}`,
      this.stroke * 0.9,
      EYE,
    );
  }

  /** Small open mouth with a tongue. */
  openMouth(x: number, y: number, w: number): this {
    const h = w * 0.7;
    const d = `M${x - w / 2} ${y} Q${x} ${y + h * 1.4} ${x + w / 2} ${y} Z`;
    this.out.push(
      `<path d="${d}" fill="#5b1f33" stroke="${this.ink}" stroke-width="${this.stroke * 0.7}" stroke-linejoin="round"/>`,
    );
    this.out.push(
      `<path d="M${x - w * 0.28} ${y + h * 0.55} Q${x} ${y + h * 0.2} ${x + w * 0.28} ${y + h * 0.55} Q${x} ${y + h * 0.95} ${x - w * 0.28} ${y + h * 0.55} Z" fill="#ff7d93"/>`,
    );
    return this;
  }

  /** Blush mark. */
  blush(x: number, y: number, r = 7): this {
    this.out.push(
      `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.55}" fill="#ff6f91" opacity="0.5"/>`,
    );
    return this;
  }

  /** Soft white gloss on a rounded surface. */
  gloss(x: number, y: number, rx: number, ry: number, angle = -30): this {
    this.out.push(
      `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity="0.45" transform="rotate(${angle} ${x} ${y})"/>`,
    );
    return this;
  }

  toString(): string {
    return this.out.join('');
  }
}

/** An ellipse as path data, so it can be outlined, shaded and clipped like any other part. */
export const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;

/**
 * Cel-shading shadow for a round part: everything outside the same ellipse moved towards the
 * light (top left), which leaves a crescent on the lower right.
 */
export const crescent = (cx: number, cy: number, rx: number, ry: number, dx = -8, dy = -9) =>
  `M0 0 H${SIZE} V${SIZE} H0 Z ${ell(cx + dx, cy + dy, rx, ry)}`;

/** Same idea for any outline: the shadow is everything outside `lit`. */
export const outside = (lit: string) => `M0 0 H${SIZE} V${SIZE} H0 Z ${lit}`;

/** Soft shadow the creature stands on. */
export const ground = (cx = 128, w = 70, y = 230) =>
  `<ellipse cx="${cx}" cy="${y}" rx="${w}" ry="${Math.max(7, w * 0.13)}" fill="#1d1630" opacity="0.16"/>`;

/** Soft glow of the element colour behind the creature. */
export const aura = (id: string, color: string, cx = 128, cy = 130, r = 112) =>
  `<radialGradient id="${id}-aura"><stop offset="0" stop-color="${color}" stop-opacity="0.5"/>` +
  `<stop offset="0.6" stop-color="${color}" stop-opacity="0.16"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>` +
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-aura)"/>`;

/** Four-point sparkle, used for rarity. */
export const sparkle = (cx: number, cy: number, r: number, fill = '#fbbf24') => {
  const k = r * 0.22;
  return `<path d="M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r} Z" fill="${fill}"/>`;
};

export function svg(id: string, title: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-labelledby="${id}-t">` +
    `<title id="${id}-t">${title}</title>${body}</svg>`
  );
}
