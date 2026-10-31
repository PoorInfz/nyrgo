import { COSMETICS_BY_ID, type AvatarLook } from '@nyrgo/shared';

/**
 * The player's explorer: an original anime-style chibi, cel shaded. Every part is drawn as a flat
 * base colour with a hard-edged shadow (the same shape, offset away from a top-left light) and,
 * where it helps, a highlight, all under one ink outline. Parts are layered so every cosmetic
 * combines with every other. `walking` swings arms and legs; `facing` mirrors the figure.
 */

import { Cel, INK, light, mix, shade } from './cel';
import {
  FaceExtras,
  HAT_HIDES_HAIR,
  OUTFITS,
  OutfitHat,
  OutfitSkirt,
  OutfitTopDetails,
  Pauldrons,
} from './outfits';

// ------------------------------------------------------------------ the figure

type AvatarProps = {
  look: AvatarLook;
  walking?: boolean;
  facing?: 'left' | 'right';
  size?: number;
  /** Accessible name; without it the figure is decorative. */
  title?: string;
  /**
   * A fixed walking pose (-1, 0, 1) drawn into the SVG itself, for places where CSS animation
   * does not apply (the figure drawn as an image on the town's canvas).
   */
  pose?: -1 | 0 | 1;
};

/** Whether this look wears a holder outfit. */
export const wearsOutfit = (look: AvatarLook) =>
  !!look.outfit && COSMETICS_BY_ID.get(look.outfit)?.holder === true;

/** The player's explorer, wearing a holder outfit if they have one on. */
export function Avatar(props: AvatarProps) {
  return <DrawnAvatar {...props} />;
}

function DrawnAvatar({
  look,
  walking = false,
  facing = 'right',
  size = 64,
  title,
  pose = 0,
}: {
  look: AvatarLook;
  walking?: boolean;
  facing?: 'left' | 'right';
  size?: number;
  /** Accessible name; without it the figure is decorative. */
  title?: string;
  /**
   * A fixed walking pose (-1, 0, 1) drawn into the SVG itself, for places where CSS animation
   * does not apply (the figure drawn as an image on the town's canvas).
   */
  pose?: -1 | 0 | 1;
}) {
  const baseColor = (id: string, fallback: string) => COSMETICS_BY_ID.get(id)?.color ?? fallback;
  const baseTrim = (id: string, fallback: string) => COSMETICS_BY_ID.get(id)?.trim ?? fallback;
  // a holder outfit replaces the clothes, hair and hat, never the skin or the way it moves
  const o = wearsOutfit(look) ? OUTFITS[look.outfit] : undefined;
  const skin = baseColor(look.skin, '#f5c6a0');
  const hairStyle = o ? (o.hair ?? 'hair_short') : look.hair;
  const hair = o?.hairColor ?? baseColor(look.hairColor, '#6b4226');
  const top = o?.top ?? baseColor(look.top, '#2bb5a0');
  const topTrim = o?.trim ?? baseTrim(look.top, '#1d7f71');
  const hat = o ? 'hat_none' : look.hat;
  const acc = o
    ? o.cape
      ? 'acc_cape'
      : o.backpack
        ? 'acc_backpack'
        : o.glasses
          ? 'acc_glasses'
          : 'acc_none'
    : look.accessory;
  const accColor = o?.cape ?? o?.backpack ?? o?.glasses;
  const color = (id: string, fallback: string) =>
    o && id === acc && accColor ? accColor : baseColor(id, fallback);
  const trimOf = (id: string, fallback: string) =>
    o && id === acc && o.capeTrim ? o.capeTrim : baseTrim(id, fallback);
  const glasses = o ? o.glasses : acc === 'acc_glasses' ? color(acc, INK) : undefined;
  // eyes take a jewel tone that suits the hair
  const iris = mix(hair === '#2a211c' ? '#3f6fd8' : hair, '#2bb5a0', 0.35);
  const pants = o?.pants ?? '#2f3a5c';
  const shoe = o?.shoes ?? '#ffffff';
  const outfitHair = o?.hat ? HAT_HIDES_HAIR[o.hat] : undefined;
  const hatHidesHair = o
    ? outfitHair !== undefined
    : hat === 'hat_cap' || hat === 'hat_beanie' || hat === 'hat_explorer';

  const swing = pose * 24;
  const limb = (angle: number, cx: number, cy: number) =>
    angle ? { transform: `rotate(${angle} ${cx} ${cy})` } : {};
  const cls = ['avatar', walking ? 'walking' : '', facing === 'left' ? 'facing-left' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      className={cls}
      viewBox="0 0 100 140"
      width={size}
      height={(size * 140) / 100}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <ellipse cx="50" cy="134" rx="22" ry="4.5" fill={INK} opacity="0.2" />
      <g className="avatar-body">
        {/* ------------------------------------------------ behind everything */}
        {acc === 'acc_cape' && (
          <Cel
            d="M32 76 Q50 70 68 76 L80 122 Q66 128 50 126 Q34 128 20 122 Z"
            fill={color(acc, '#9b4ff5')}
            dx={-3}
            dy={0}
          >
            <path
              d="M50 74 L50 128"
              stroke={trimOf(acc, '#ead9ff')}
              strokeWidth="1.2"
              opacity="0.6"
            />
          </Cel>
        )}
        {acc === 'acc_backpack' && (
          <Cel
            d="M56 80 Q74 78 77 90 L77 106 Q75 112 64 112 L58 112 Z"
            fill={color(acc, '#22c96b')}
          >
            <path d="M62 95 H77" stroke={INK} strokeWidth="1.4" />
          </Cel>
        )}
        {outfitHair !== 'all' && <BackHair style={hairStyle} fill={hair} hidden={hatHidesHair} />}

        {/* ------------------------------------------------ legs */}
        <g className="leg leg-back" {...limb(-swing, 55.5, 106)}>
          <Cel d="M51 106 L60 106 L59 125 L52 125 Z" fill={shade(pants, 0.25)} />
          <Cel
            d="M50 123 Q50 119 56 119 Q65 119 65 126 L65 130 L50 130 Z"
            fill={o ? shade(shoe, 0.12) : '#f4f1ea'}
            shadow={o ? shade(shoe, 0.4) : '#b9b3c9'}
          >
            <path d="M50 126.5 H65" stroke={topTrim} strokeWidth="2" />
          </Cel>
        </g>
        <g className="leg leg-front" {...limb(swing, 44.5, 106)}>
          <Cel d="M40 106 L49 106 L48 125 L41 125 Z" fill={pants} />
          <Cel
            d="M37 123 Q37 119 43 119 Q52 119 52 126 L52 130 L37 130 Z"
            fill={shoe}
            shadow={o ? shade(shoe, 0.35) : '#c9c3d9'}
          >
            <path d="M37 126.5 H52" stroke={topTrim} strokeWidth="2" />
          </Cel>
        </g>

        {o && <OutfitSkirt o={o} />}

        {/* ------------------------------------------------ back arm */}
        <g className="arm arm-back" {...limb(swing, 64, 82)}>
          <Cel d="M60 81 Q69 82 70 95 L69 103 Q65.5 105 63 102 L62 92 Z" fill={shade(top, 0.2)} />
          <Cel
            d="M62.5 101 Q66 98.5 69.5 101 Q70.5 107 66 107.5 Q61.5 107 62.5 101 Z"
            fill={skin}
          />
        </g>

        {/* ------------------------------------------------ torso */}
        <Cel d="M39 80 Q50 75 61 80 L64 108 Q50 112 36 108 Z" fill={top} shadow={shade(top, 0.35)}>
          {o ? <OutfitTopDetails o={o} /> : <TopDetails top={look.top} trim={topTrim} base={top} />}
        </Cel>
        {acc === 'acc_backpack' && (
          <path
            d="M42 79 Q43 94 42 108 M58 79 Q57 94 58 108"
            fill="none"
            stroke={trimOf(acc, INK)}
            strokeWidth="3"
            strokeLinecap="round"
          />
        )}

        {/* ------------------------------------------------ front arm */}
        <g className="arm arm-front" {...limb(-swing, 36, 82)}>
          <Cel d="M40 81 Q31 82 30 95 L31 103 Q34.5 105 37 102 L38 92 Z" fill={top} />
          <Cel
            d="M30.5 101 Q34 98.5 37.5 101 Q38.5 107 34 107.5 Q29.5 107 30.5 101 Z"
            fill={skin}
          />
        </g>

        {o && <Pauldrons o={o} />}

        {/* ------------------------------------------------ neck, scarf */}
        <Cel d="M45.5 72 L54.5 72 L54.5 80 Q50 82 45.5 80 Z" fill={shade(skin, 0.18)} />
        {acc === 'acc_scarf' && (
          <>
            <Cel d="M36 74 Q50 68 64 74 L63 81 Q50 86 37 81 Z" fill={color(acc, '#ef4a5b')}>
              <path
                d="M40 75 L42 82 M48 72 L49 84 M56 73 L56 83"
                stroke={trimOf(acc, '#ffcf4d')}
                strokeWidth="1.6"
              />
            </Cel>
            <Cel d="M55 80 L63 81 L65 96 L58 97 Z" fill={color(acc, '#ef4a5b')}>
              <path d="M57 88 L64 88" stroke={trimOf(acc, '#ffcf4d')} strokeWidth="1.6" />
            </Cel>
          </>
        )}

        {/* ------------------------------------------------ head */}
        <Cel
          d="M20 46 Q20 14 50 14 Q80 14 80 46 Q80 64 66 72 Q58 76.5 50 76.5 Q42 76.5 34 72 Q20 64 20 46 Z"
          fill={skin}
          shadow={shade(skin, 0.28)}
          dx={3.5}
          dy={2}
        />
        {/* ears */}
        <Cel d="M21 48 Q14 47 15 54 Q16 60 23 59 Z" fill={skin} dx={1} dy={1} />
        <Cel d="M79 48 Q86 47 85 54 Q84 60 77 59 Z" fill={skin} dx={1} dy={1} />

        <Face iris={iris} skin={skin} />
        {o && <FaceExtras o={o} skin={skin} />}

        {outfitHair !== 'all' && (
          <FrontHair style={hairStyle} fill={hair} underHat={hatHidesHair} />
        )}
        {/* brows show through the fringe, as in anime */}
        <path
          d="M30 37.5 Q36 34.5 42 36.5"
          fill="none"
          stroke={shade(hair, 0.5)}
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M58 36.5 Q64 34.5 70 37.5"
          fill="none"
          stroke={shade(hair, 0.5)}
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.85"
        />

        {glasses && (
          <g fill="rgba(200,240,255,0.25)" stroke={glasses} strokeWidth="2">
            <rect x="26.5" y="43.5" width="21" height="18" rx="7" />
            <rect x="52.5" y="43.5" width="21" height="18" rx="7" />
            <path d="M47.5 51 Q50 48.5 52.5 51" fill="none" />
            <path d="M30 47 L36 46" stroke="#fff" strokeWidth="1.5" opacity="0.8" />
          </g>
        )}

        <g transform="translate(50 30) scale(1.14) translate(-50 -33)">
          {o?.hat === 'cap' ? (
            <Hat hat="hat_cap" color={o.hatColor ?? top} trim={o.hatTrim ?? '#ffffff'} />
          ) : o?.hat ? (
            <OutfitHat kind={o.hat} color={o.hatColor ?? top} trim={o.hatTrim ?? topTrim} />
          ) : (
            <Hat hat={hat} color={color(hat, '#ef4a5b')} trim={trimOf(hat, '#ffffff')} />
          )}
        </g>
      </g>
    </svg>
  );
}

// ------------------------------------------------------------------ face

function Face({ iris, skin }: { iris: string; skin: string }) {
  const eye = (cx: number, flip: 1 | -1) => (
    <g>
      <path
        d={`M${cx - 8} 53 Q${cx - 8} 43.5 ${cx} 43.5 Q${cx + 8} 43.5 ${cx + 8} 53 Q${cx + 8} 62.5 ${cx} 62.5 Q${cx - 8} 62.5 ${cx - 8} 53 Z`}
        fill="#ffffff"
      />
      {/* iris: deep at the top under the lid, bright at the bottom */}
      <ellipse cx={cx} cy={54} rx={6.4} ry={8.4} fill={iris} />
      <path
        d={`M${cx - 6.4} 52 Q${cx} 44 ${cx + 6.4} 52 L${cx + 6.2} 48 Q${cx} 44.6 ${cx - 6.2} 48 Z`}
        fill={shade(iris, 0.55)}
      />
      <ellipse cx={cx} cy={58.6} rx={4.4} ry={2.4} fill={light(iris, 0.55)} />
      <ellipse cx={cx} cy={54.5} rx={3} ry={4.4} fill={INK} />
      {/* highlights: one big, one small, the anime sparkle */}
      <ellipse cx={cx - 2.6 * flip} cy={49.8} rx={2.6} ry={3.1} fill="#fff" />
      <circle cx={cx + 3 * flip} cy={57.8} r={1.3} fill="#fff" />
      {/* thick upper lid with a flick at the outer corner, thin lower line */}
      <path
        d={`M${cx - 9 * flip} 49 Q${cx - 2 * flip} 41.5 ${cx + 8.5 * flip} 46.5 L${cx + 10.5 * flip} 44.5`}
        fill="none"
        stroke={INK}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={`M${cx - 4} 62.6 Q${cx} 63.6 ${cx + 4} 62.6`}
        fill="none"
        stroke={INK}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.7"
      />
    </g>
  );
  return (
    <g>
      <g className="eyes">
        {eye(36.5, 1)}
        {eye(63.5, -1)}
      </g>
      {/* blush with little hatching */}
      <ellipse cx="27" cy="64" rx="5" ry="2.6" fill="#ff7a8a" opacity="0.35" />
      <ellipse cx="73" cy="64" rx="5" ry="2.6" fill="#ff7a8a" opacity="0.35" />
      <path
        d="M25 63 l-1 2 M28 63 l-1 2 M72 63 l-1 2 M75 63 l-1 2"
        stroke="#e0566b"
        strokeWidth="0.9"
        opacity="0.7"
      />
      {/* nose and mouth */}
      <path
        d="M50.5 62 l-1 1.4"
        stroke={shade(skin, 0.5)}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M46 66.5 Q50 71 54 66.5 Q50 68.4 46 66.5 Z"
        fill="#a33a4c"
        stroke={INK}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </g>
  );
}

// ------------------------------------------------------------------ hair

/** The smooth outer silhouette of the hair, wider and taller than the skull. */
const OUTER = 'Q10 34 20 18 Q32 4 50 4 Q68 4 80 18 Q90 34';

/**
 * A fringe of curved locks: from the left side lock up over the crown to the right side lock,
 * then back along the hairline through each tip. `sweep` bends every lock the same way.
 */
function fringe({
  left,
  right,
  tips,
  root = 30,
  sweep = 1,
  outer = OUTER,
}: {
  left: [number, number];
  right: [number, number];
  tips: [number, number][];
  root?: number;
  sweep?: number;
  outer?: string;
}): string {
  const [lx, ly] = left;
  const [rx, ry] = right;
  let d = `M${lx} ${ly} ${outer} ${rx} ${ry}`;
  // back up the inside of the right side lock
  d += ` Q${rx - 2} ${(ry + root) / 2} ${rx - 6} ${root + 6}`;
  const sorted = [...tips].sort((a, b) => b[0] - a[0]);
  for (let i = 0; i < sorted.length; i++) {
    const [tx, ty] = sorted[i]!;
    const next = sorted[i + 1];
    d += ` Q${tx + 5 * sweep} ${(root + ty) / 2} ${tx} ${ty}`;
    const nx = next ? (tx + next[0]) / 2 : lx + 6;
    const ny = next ? root : root + 6;
    d += ` Q${tx - 1 * sweep} ${(ty + ny) / 2} ${nx} ${ny}`;
  }
  d += ` Q${lx + 2} ${(ly + root) / 2} ${lx} ${ly} Z`;
  return d;
}

const FRONT: Record<string, string> = {
  hair_short: fringe({
    left: [21, 62],
    right: [79, 62],
    tips: [
      [70, 45],
      [57, 43],
      [44, 44],
      [31, 46],
    ],
    root: 27,
    sweep: 1.4,
  }),
  hair_ponytail: fringe({
    left: [22, 60],
    right: [78, 58],
    tips: [
      [68, 42],
      [57, 44],
      [45, 41],
      [33, 44],
    ],
    sweep: -1.6,
  }),
  hair_bun: fringe({
    left: [22, 58],
    right: [78, 58],
    tips: [
      [66, 40],
      [56, 43],
      [44, 43],
      [34, 40],
    ],
    root: 28,
  }),
  hair_long: fringe({
    left: [19, 82],
    right: [81, 82],
    tips: [
      [69, 46],
      [56, 43],
      [44, 45],
      [32, 46],
    ],
    root: 27,
    sweep: 1.2,
  }),
  hair_spiky: fringe({
    left: [20, 60],
    right: [80, 60],
    tips: [
      [70, 44],
      [58, 41],
      [45, 44],
      [32, 43],
    ],
    root: 27,
    sweep: 1.8,
    outer:
      'L8 40 L16 32 L6 18 L22 20 L20 4 L34 12 L40 -4 L50 8 L60 -6 L66 10 L80 2 L80 18 L96 16 L86 32 L94 42',
  }),
  hair_curly: fringe({
    left: [18, 64],
    right: [82, 64],
    tips: [
      [72, 42],
      [62, 39],
      [52, 42],
      [42, 39],
      [32, 42],
    ],
    root: 28,
    sweep: 0.6,
    outer:
      'Q6 56 12 46 Q4 36 12 28 Q8 16 20 14 Q22 2 34 4 Q42 -4 50 2 Q58 -4 66 4 Q78 2 80 14 Q92 16 88 28 Q96 36 88 46 Q94 56',
  }),
  hair_buzz:
    'M20 40 Q18 12 50 10 Q82 12 80 40 Q78 33 72 31 Q62 28 50 28 Q38 28 28 31 Q22 33 20 40 Z',
};

/** The fringe left showing under a hat brim. */
const UNDER_HAT = fringe({
  left: [22, 58],
  right: [78, 58],
  tips: [
    [68, 45],
    [55, 43],
    [42, 45],
    [30, 44],
  ],
  root: 33,
  sweep: 1.2,
  outer: 'Q16 40 24 32 Q36 28 50 28 Q64 28 76 32 Q84 40',
});

function BackHair({ style, fill, hidden }: { style: string; fill: string; hidden: boolean }) {
  const d: Record<string, string> = {
    hair_long:
      'M16 40 Q12 76 18 104 Q26 110 32 102 Q38 110 46 104 L54 104 Q62 110 68 102 Q74 110 82 104 Q88 76 84 40 Z',
    hair_ponytail: 'M72 26 Q98 30 96 62 Q94 84 84 98 Q84 80 80 68 Q78 50 68 38 Z',
    hair_curly: 'M14 48 Q6 64 16 76 Q20 86 30 82 L70 82 Q80 86 84 76 Q94 64 86 48 Z',
    hair_bun: 'M50 -6 Q63 -6 63 5 Q63 16 50 16 Q37 16 37 5 Q37 -6 50 -6 Z',
    // every style has some hair behind the head, so the head never looks bald from the side
    default: 'M18 46 Q16 22 50 18 Q84 22 82 46 Q80 60 76 66 L24 66 Q20 60 18 46 Z',
  };
  if (hidden && style !== 'hair_long' && style !== 'hair_ponytail') return null;
  const path = d[style] ?? d.default!;
  return (
    <Cel d={path} fill={shade(fill, 0.12)} shadow={shade(fill, 0.45)} dx={-3} dy={-1}>
      {(style === 'hair_ponytail' || style === 'hair_long') && (
        <path
          d={
            style === 'hair_long'
              ? 'M22 50 Q20 76 24 98 M78 50 Q80 76 76 98'
              : 'M78 34 Q90 50 86 80'
          }
          fill="none"
          stroke={light(fill, 0.35)}
          strokeWidth="2"
          opacity="0.7"
        />
      )}
    </Cel>
  );
}

function FrontHair({ style, fill, underHat }: { style: string; fill: string; underHat: boolean }) {
  const d = underHat ? UNDER_HAT : (FRONT[style] ?? FRONT.hair_short!);
  return (
    <Cel d={d} fill={fill} shadow={shade(fill, 0.42)} dx={-2.5} dy={-3.5}>
      {/* strand lines and the anime shine band across the crown */}
      {!underHat && style !== 'hair_buzz' && (
        <>
          <path
            d="M36 30 Q40 22 46 18 M58 18 Q63 23 66 30"
            fill="none"
            stroke={shade(fill, 0.4)}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          {/* the "angel ring": broken highlight strokes following the crown */}
          <path
            d="M25 24 Q50 9 75 24"
            fill="none"
            stroke={light(fill, 0.62)}
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeDasharray="9 4 14 4 7 5"
          />
        </>
      )}
      {style === 'hair_buzz' && !underHat && (
        <path d="M32 18 Q50 12 68 18" fill="none" stroke={light(fill, 0.5)} strokeWidth="2.4" />
      )}
    </Cel>
  );
}

// ------------------------------------------------------------------ clothes

function TopDetails({ top, trim, base }: { top: string; trim: string; base: string }) {
  switch (top) {
    case 'top_hoodie':
      return (
        <>
          <path d="M40 76 Q50 88 60 76" fill="none" stroke={trim} strokeWidth="3" />
          <path
            d="M46 84 L45 94 M54 84 L55 94"
            stroke="#f4f1ea"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path d="M40 96 Q50 100 60 96 L60 104 Q50 107 40 104 Z" fill={shade(base, 0.2)} />
        </>
      );
    case 'top_track':
      return (
        <>
          <path d="M42 76 L40 108 M58 76 L60 108" stroke={trim} strokeWidth="3" />
          <path d="M50 76 L50 108" stroke={INK} strokeWidth="1.3" />
          <circle cx="50" cy="82" r="1.6" fill="#ffcf4d" />
        </>
      );
    case 'top_explorer':
      return (
        <>
          <path d="M50 76 L50 108" stroke={trim} strokeWidth="2" />
          <rect x="38" y="86" width="9" height="8" rx="1.5" fill={trim} />
          <rect x="53" y="86" width="9" height="8" rx="1.5" fill={trim} />
          <path d="M44 76 L50 84 L56 76" fill="#f4f1ea" stroke={INK} strokeWidth="1.2" />
          <circle cx="50" cy="90" r="1.3" fill="#ffcf4d" />
          <circle cx="50" cy="98" r="1.3" fill="#ffcf4d" />
        </>
      );
    case 'top_raincoat':
      return (
        <>
          <path d="M50 76 L50 108" stroke={trim} strokeWidth="2" />
          <path d="M36 98 H64" stroke={trim} strokeWidth="2.5" />
          <path d="M40 82 Q44 80 46 84" stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.7" />
        </>
      );
    case 'top_cosmic':
      return (
        <>
          <path d="M36 90 Q50 84 64 90" stroke={trim} strokeWidth="1.6" fill="none" opacity="0.8" />
          <circle cx="42" cy="96" r="1.2" fill="#fff" />
          <circle cx="58" cy="100" r="1" fill="#fff" />
          <circle cx="46" cy="103" r="0.8" fill={trim} />
          <path
            d="M53 80 l1.8 3.6 4 .5-2.9 2.7.7 4-3.6-2-3.6 2 .7-4-2.9-2.7 4-.5z"
            fill="#ffcf4d"
            stroke={INK}
            strokeWidth="0.8"
          />
        </>
      );
    default:
      // tees: collar and a small brand-free chest mark
      return (
        <>
          <path d="M43 76 Q50 82 57 76" fill="none" stroke={trim} strokeWidth="2.4" />
          <path d="M53 90 l2 -3 l2 3 l-2 3 z" fill={light(base, 0.5)} />
        </>
      );
  }
}

// ------------------------------------------------------------------ hats

function Hat({ hat, color, trim }: { hat: string; color: string; trim: string }) {
  switch (hat) {
    case 'hat_cap':
      return (
        <>
          <Cel d="M22 36 Q22 10 50 10 Q78 10 78 36 Q50 30 22 36 Z" fill={color} dx={-3} dy={-2}>
            <path d="M50 10 L50 34" stroke={shade(color, 0.4)} strokeWidth="1.2" />
            <path d="M32 18 Q40 13 48 14" stroke="#fff" strokeWidth="2" fill="none" opacity="0.6" />
          </Cel>
          <Cel d="M60 32 Q80 30 92 36 Q86 41 72 40 L60 38 Z" fill={shade(color, 0.12)} />
          <circle cx="50" cy="11" r="2.6" fill={trim} stroke={INK} strokeWidth="1.2" />
        </>
      );
    case 'hat_beanie':
      return (
        <>
          <Cel d="M22 38 Q20 8 50 8 Q80 8 78 38 Z" fill={color} dx={-3} dy={-2}>
            <path
              d="M34 12 L32 36 M42 9 L41 36 M50 8 L50 36 M58 9 L59 36 M66 12 L68 36"
              stroke={shade(color, 0.25)}
              strokeWidth="1.2"
            />
          </Cel>
          <Cel d="M20 34 Q50 28 80 34 L80 42 Q50 36 20 42 Z" fill={trim} />
          <Cel
            d="M50 -2 Q57 -2 57 4 Q57 10 50 10 Q43 10 43 4 Q43 -2 50 -2 Z"
            fill={trim}
            dx={-1}
            dy={-1}
          />
        </>
      );
    case 'hat_explorer':
      return (
        <>
          <Cel d="M8 36 Q50 24 92 36 Q50 46 8 36 Z" fill={color} dx={0} dy={-2} />
          <Cel d="M28 34 Q28 8 50 8 Q72 8 72 34 Q50 30 28 34 Z" fill={color} dx={-3} dy={-2}>
            <path d="M28 27 Q50 22 72 27 L72 32 Q50 27 28 32 Z" fill={trim} />
          </Cel>
        </>
      );
    case 'hat_leaf':
      return (
        <>
          <path
            d="M50 14 Q47 4 53 -2"
            fill="none"
            stroke={INK}
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          <path
            d="M50 14 Q47 4 53 -2"
            fill="none"
            stroke={trim}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <Cel d="M52 0 Q66 -8 72 4 Q62 12 52 0 Z" fill={color} dx={-1} dy={-1}>
            <path d="M54 1 Q63 1 70 4" stroke={shade(color, 0.4)} strokeWidth="1" fill="none" />
          </Cel>
        </>
      );
    case 'hat_crown':
      return (
        <Cel
          d="M30 22 L32 2 L41 12 L50 -2 L59 12 L68 2 L70 22 Q50 18 30 22 Z"
          fill={color}
          shadow={shade(color, 0.3)}
          dx={-2}
          dy={-1}
        >
          <circle cx="50" cy="14" r="2.8" fill={trim} />
          <circle cx="38" cy="16" r="1.8" fill="#43f289" />
          <circle cx="62" cy="16" r="1.8" fill="#3fb0ee" />
          <path d="M34 8 L36 16" stroke="#fff" strokeWidth="1.6" opacity="0.7" />
        </Cel>
      );
    default:
      return null;
  }
}
