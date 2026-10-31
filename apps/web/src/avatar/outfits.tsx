import { Cel, INK, light, shade } from './cel';

/**
 * Holder outfits, drawn as the same cel-shaded chibi as every explorer: an outfit only changes
 * what the figure wears (hair, clothes, hat, extras), so it walks, swings its arms and blinks
 * exactly like the default explorer. The player's own skin tone stays.
 */

export type TopKind =
  | 'jacket'
  | 'tee'
  | 'coat'
  | 'robe'
  | 'armor'
  | 'tunic'
  | 'dress'
  | 'lab'
  | 'overalls'
  | 'chef'
  | 'uniform'
  | 'suit'
  | 'blouse';

export type OutfitHatKind =
  | 'cap'
  | 'witch'
  | 'wizard'
  | 'helmet'
  | 'hood'
  | 'toque'
  | 'police'
  | 'straw'
  | 'nurse'
  | 'headphones'
  | 'circlet';

export interface OutfitStyle {
  hair?: string;
  hairColor?: string;
  top: string;
  trim: string;
  kind: TopKind;
  /** A second colour some tops use (the shirt under a coat, the denim of overalls). */
  under?: string;
  pants?: string;
  shoes?: string;
  /** A robe, dress or coat tails below the waist, down to `to` (feet are at 130). */
  skirt?: { color: string; trim?: string; to: number; open?: boolean };
  hat?: OutfitHatKind;
  hatColor?: string;
  hatTrim?: string;
  cape?: string;
  capeTrim?: string;
  backpack?: string;
  glasses?: string;
  beard?: string;
  moustache?: string;
  elf?: boolean;
}

export const OUTFITS: Record<string, OutfitStyle> = {
  skin_cap: {
    hair: 'hair_short',
    hairColor: '#4a3020',
    top: '#3f7fe0',
    trim: '#ffffff',
    kind: 'jacket',
    pants: '#2f3f6e',
    shoes: '#f4f1ea',
    hat: 'cap',
    hatColor: '#3f7fe0',
    hatTrim: '#ffffff',
  },
  skin_headphones: {
    hair: 'hair_long',
    hairColor: '#3a2350',
    top: '#9b5cf5',
    trim: '#ff9ad5',
    kind: 'tee',
    skirt: { color: '#6b3fc4', trim: '#ff9ad5', to: 116 },
    pants: '#2a1f44',
    shoes: '#b88cff',
    hat: 'headphones',
    hatColor: '#ff7ac8',
    hatTrim: '#2a1f44',
  },
  skin_spiky: {
    hair: 'hair_spiky',
    hairColor: '#f2c94c',
    top: '#262833',
    trim: '#ffcf4d',
    kind: 'jacket',
    pants: '#1d1f29',
    shoes: '#ffcf4d',
  },
  skin_bluecoat: {
    hair: 'hair_spiky',
    hairColor: '#2f5fd8',
    top: '#1f2f66',
    trim: '#c9d6ee',
    kind: 'coat',
    under: '#e8eef8',
    skirt: { color: '#1f2f66', trim: '#c9d6ee', to: 124, open: true },
    pants: '#151d3d',
    shoes: '#2a2f45',
  },
  skin_witch: {
    hair: 'hair_long',
    hairColor: '#8a5a3c',
    top: '#7b3fc4',
    trim: '#ffcf4d',
    kind: 'robe',
    skirt: { color: '#7b3fc4', trim: '#ffcf4d', to: 124 },
    shoes: '#3a2350',
    hat: 'witch',
    hatColor: '#6a32b0',
    hatTrim: '#ffcf4d',
  },
  skin_ranger: {
    hair: 'hair_short',
    hairColor: '#6b4226',
    top: '#4caf50',
    trim: '#8a6b3f',
    kind: 'tunic',
    pants: '#6b4f2e',
    shoes: '#4a3420',
    hat: 'hood',
    hatColor: '#3e9d4a',
    hatTrim: '#2a6b33',
    backpack: '#8a6b3f',
  },
  skin_knight: {
    top: '#b8c2d6',
    trim: '#6f7b94',
    kind: 'armor',
    pants: '#8d97ad',
    shoes: '#6f7b94',
    hat: 'helmet',
    hatColor: '#c3cbdc',
    hatTrim: '#ef4a5b',
    cape: '#c2334a',
    capeTrim: '#ffcf4d',
  },
  skin_wizard: {
    hair: 'hair_short',
    hairColor: '#e8c066',
    top: '#2f6fd8',
    trim: '#ffcf4d',
    kind: 'robe',
    skirt: { color: '#2f6fd8', trim: '#ffcf4d', to: 124 },
    shoes: '#5c3a0a',
    hat: 'wizard',
    hatColor: '#2a5fc4',
    hatTrim: '#ffcf4d',
  },
  skin_adventurer: {
    hair: 'hair_spiky',
    hairColor: '#e2452f',
    top: '#e07b2f',
    trim: '#7a4a22',
    kind: 'tunic',
    pants: '#3b5f9e',
    shoes: '#5c3a1e',
    backpack: '#9a6a3a',
  },
  skin_silver: {
    hair: 'hair_long',
    hairColor: '#c9cfdc',
    top: '#3a3346',
    trim: '#9b6bd8',
    kind: 'coat',
    under: '#1f1a2b',
    skirt: { color: '#3a3346', trim: '#9b6bd8', to: 120, open: true },
    pants: '#1f1a2b',
    shoes: '#2a2433',
  },
  skin_elf: {
    hair: 'hair_long',
    hairColor: '#3fbf5a',
    top: '#6b8f3a',
    trim: '#3a5a2a',
    kind: 'tunic',
    pants: '#4a5f2a',
    shoes: '#5c4626',
    backpack: '#8a5a2c',
    elf: true,
  },
  skin_shadow: {
    top: '#2a2040',
    trim: '#b46cff',
    kind: 'robe',
    skirt: { color: '#2a2040', trim: '#b46cff', to: 126 },
    shoes: '#1b1530',
    hat: 'hood',
    hatColor: '#3a2a55',
    hatTrim: '#b46cff',
  },
  skin_priestess: {
    hair: 'hair_long',
    hairColor: '#f2d06b',
    top: '#f4f1ea',
    trim: '#e0b84a',
    kind: 'robe',
    skirt: { color: '#f4f1ea', trim: '#e0b84a', to: 126 },
    shoes: '#e0b84a',
    hat: 'circlet',
    hatColor: '#e0b84a',
    hatTrim: '#3fb0ee',
  },
  skin_casual: {
    hair: 'hair_short',
    hairColor: '#6b4226',
    top: '#f0f0f5',
    trim: '#3f6fd8',
    kind: 'tee',
    pants: '#3b5f9e',
    shoes: '#ef4a5b',
  },
  skin_strawhat: {
    hair: 'hair_bun',
    hairColor: '#7a4a2a',
    top: '#8ec5ff',
    trim: '#ffffff',
    kind: 'dress',
    skirt: { color: '#8ec5ff', trim: '#ffffff', to: 118 },
    shoes: '#c2334a',
    hat: 'straw',
    hatColor: '#e8c26a',
    hatTrim: '#ef4a5b',
  },
  skin_scientist: {
    hair: 'hair_short',
    hairColor: '#b8bec8',
    top: '#f4f6fa',
    trim: '#9aa4b8',
    kind: 'lab',
    under: '#5c6a85',
    skirt: { color: '#f4f6fa', trim: '#9aa4b8', to: 122, open: true },
    pants: '#3a4258',
    shoes: '#2a2f45',
    glasses: '#2a2f45',
  },
  skin_medic: {
    hair: 'hair_bun',
    hairColor: '#7a3a3a',
    top: '#ffffff',
    trim: '#ff6b8a',
    kind: 'dress',
    skirt: { color: '#ffffff', trim: '#ff6b8a', to: 116 },
    shoes: '#ffffff',
    hat: 'nurse',
    hatColor: '#ffffff',
    hatTrim: '#ef4a5b',
  },
  skin_farmer: {
    hair: 'hair_short',
    hairColor: '#6b4226',
    top: '#d9a17a',
    trim: '#3b5f9e',
    kind: 'overalls',
    under: '#3b5f9e',
    pants: '#3b5f9e',
    shoes: '#5c3a1e',
    beard: '#5a3a22',
  },
  skin_pink: {
    hair: 'hair_long',
    hairColor: '#ff7ac0',
    top: '#ff9ccf',
    trim: '#ffffff',
    kind: 'blouse',
    skirt: { color: '#6f8fd8', trim: '#ffffff', to: 116 },
    shoes: '#ff7ac0',
  },
  skin_chef: {
    hair: 'hair_short',
    hairColor: '#2a211c',
    top: '#ffffff',
    trim: '#ef4a5b',
    kind: 'chef',
    pants: '#2f3a5c',
    shoes: '#2a2433',
    hat: 'toque',
    hatColor: '#ffffff',
    hatTrim: '#e4e6ee',
    moustache: '#2a211c',
  },
  skin_officer: {
    hair: 'hair_short',
    hairColor: '#2a211c',
    top: '#2f4f9e',
    trim: '#ffcf4d',
    kind: 'uniform',
    pants: '#1f2f66',
    shoes: '#1b1530',
    hat: 'police',
    hatColor: '#1f2f66',
    hatTrim: '#ffcf4d',
    glasses: '#1b1530',
  },
  skin_office: {
    hair: 'hair_short',
    hairColor: '#4a3020',
    top: '#3a3f4f',
    trim: '#2b2f3a',
    kind: 'suit',
    under: '#ffffff',
    pants: '#2b2f3a',
    shoes: '#1b1530',
    glasses: '#1b1530',
  },
};

/** Hats that cover the hair: only the fringe under the brim shows (or none at all). */
export const HAT_HIDES_HAIR: Partial<Record<OutfitHatKind, 'all' | 'fringe'>> = {
  cap: 'fringe',
  helmet: 'all',
  hood: 'fringe',
  police: 'fringe',
  straw: 'fringe',
};

// ------------------------------------------------------------------ clothes

/** Details inside the torso (clipped to it). */
export function OutfitTopDetails({ o }: { o: OutfitStyle }) {
  const { trim, top } = o;
  const under = o.under ?? '#f4f1ea';
  switch (o.kind) {
    case 'jacket':
      return (
        <>
          <path d="M50 76 L50 110" stroke={trim} strokeWidth="2" />
          <path d="M42 76 L50 86 L58 76" fill="none" stroke={trim} strokeWidth="2.6" />
          <path d="M36 102 Q50 106 64 102 L64 110 L36 110 Z" fill={shade(top, 0.25)} />
          <path d="M40 82 Q43 80 45 84" stroke="#fff" strokeWidth="1.5" fill="none" opacity="0.6" />
        </>
      );
    case 'tee':
      return (
        <>
          <path d="M43 76 Q50 84 57 76" fill="none" stroke={trim} strokeWidth="2.6" />
          <circle cx="50" cy="94" r="5" fill={trim} opacity="0.85" />
          <path d="M47.5 94 L50 91 L52.5 94 L50 97 Z" fill={top} />
        </>
      );
    case 'coat':
    case 'lab':
      return (
        <>
          <path d="M44 76 L50 92 L56 76 Z" fill={under} />
          <path d="M48.5 80 L50 90 L51.5 80 Z" fill={o.kind === 'lab' ? '#3f6fd8' : trim} />
          <path
            d="M42 76 L48 94 L44 96 Z M58 76 L52 94 L56 96 Z"
            fill={trim}
            stroke={INK}
            strokeWidth="1"
          />
          <path d="M50 92 L50 110" stroke={shade(top, 0.4)} strokeWidth="1.4" />
          {o.kind === 'lab' ? (
            <rect
              x="53"
              y="96"
              width="8"
              height="7"
              rx="1"
              fill="none"
              stroke={trim}
              strokeWidth="1.4"
            />
          ) : (
            <>
              <circle cx="46" cy="100" r="1.3" fill={trim} />
              <circle cx="54" cy="100" r="1.3" fill={trim} />
            </>
          )}
        </>
      );
    case 'suit':
      return (
        <>
          <path d="M44 76 L50 94 L56 76 Z" fill={under} />
          <path
            d="M48.6 79 L51.4 79 L52 92 L50 96 L48 92 Z"
            fill="#c2334a"
            stroke={INK}
            strokeWidth="0.8"
          />
          <path
            d="M42 76 L49 96 L44 98 Z M58 76 L51 96 L56 98 Z"
            fill={shade(top, 0.15)}
            stroke={INK}
            strokeWidth="1"
          />
          <circle cx="50" cy="102" r="1.2" fill={INK} />
        </>
      );
    case 'robe':
      return (
        <>
          <path d="M43 76 L50 90 L57 76" fill="none" stroke={trim} strokeWidth="3" />
          <path d="M36 98 Q50 102 64 98 L64 104 Q50 108 36 104 Z" fill={trim} />
          <circle cx="50" cy="101" r="2.2" fill={light(trim, 0.4)} stroke={INK} strokeWidth="0.8" />
        </>
      );
    case 'armor':
      return (
        <>
          <path d="M50 76 L50 104" stroke={light(top, 0.5)} strokeWidth="2.4" />
          <path
            d="M38 88 Q50 84 62 88 M38 96 Q50 92 62 96"
            fill="none"
            stroke={trim}
            strokeWidth="1.6"
          />
          <path d="M42 80 Q45 78 47 82" stroke="#fff" strokeWidth="2" fill="none" opacity="0.8" />
          <path d="M36 102 Q50 106 64 102 L64 108 Q50 112 36 108 Z" fill="#5c3a1e" />
          <rect
            x="47"
            y="102"
            width="6"
            height="5"
            rx="1"
            fill="#ffcf4d"
            stroke={INK}
            strokeWidth="0.8"
          />
        </>
      );
    case 'tunic':
      return (
        <>
          <path d="M45 76 L50 86 L55 76" fill="none" stroke={trim} strokeWidth="2.2" />
          <path d="M47 80 L53 80 M47.5 83 L52.5 83" stroke={trim} strokeWidth="1.2" />
          <path d="M36 98 Q50 101 64 98 L64 103 Q50 106 36 103 Z" fill={trim} />
          <rect
            x="47"
            y="98"
            width="6"
            height="5"
            rx="1"
            fill="#ffcf4d"
            stroke={INK}
            strokeWidth="0.8"
          />
        </>
      );
    case 'dress':
    case 'blouse':
      return (
        <>
          <path d="M42 76 Q50 86 58 76 L58 80 Q50 90 42 80 Z" fill={trim} />
          <path
            d="M50 86 L45 83 L45 89 Z M50 86 L55 83 L55 89 Z"
            fill={o.kind === 'dress' ? trim : '#ef4a5b'}
            stroke={INK}
            strokeWidth="0.8"
          />
          {o.hat === 'nurse' && (
            <path d="M48 96 H52 M50 94 V98" stroke="#ef4a5b" strokeWidth="1.6" />
          )}
        </>
      );
    case 'overalls':
      return (
        <>
          <path d="M40 90 L60 90 L62 110 L38 110 Z" fill={under} />
          <path d="M42 76 L42 92 M58 76 L58 92" stroke={under} strokeWidth="3.2" />
          <circle cx="42.5" cy="90" r="1.4" fill="#ffcf4d" />
          <circle cx="57.5" cy="90" r="1.4" fill="#ffcf4d" />
          <rect
            x="45"
            y="94"
            width="10"
            height="7"
            rx="1"
            fill="none"
            stroke={shade(under, 0.4)}
            strokeWidth="1.2"
          />
        </>
      );
    case 'chef':
      return (
        <>
          <path d="M43 76 Q50 82 57 76 L56 80 Q50 85 44 80 Z" fill={trim} />
          {[86, 93, 100].map((y) => (
            <g key={y}>
              <circle cx="45" cy={y} r="1.3" fill={shade(top, 0.45)} />
              <circle cx="55" cy={y} r="1.3" fill={shade(top, 0.45)} />
            </g>
          ))}
          <path d="M42 76 L58 104" stroke={shade(top, 0.2)} strokeWidth="1" />
        </>
      );
    case 'uniform':
      return (
        <>
          <path d="M45 76 L50 84 L55 76" fill="#e8eef8" stroke={INK} strokeWidth="1" />
          <path d="M50 84 L50 108" stroke={shade(top, 0.4)} strokeWidth="1.2" />
          {[88, 95, 102].map((y) => (
            <circle key={y} cx="50" cy={y} r="1.3" fill={trim} />
          ))}
          <rect
            x="39"
            y="86"
            width="8"
            height="6"
            rx="1"
            fill="none"
            stroke={shade(top, 0.4)}
            strokeWidth="1.2"
          />
          <path
            d="M57 86 L59 84 L61 86 L60.5 89 L57.5 89 Z"
            fill={trim}
            stroke={INK}
            strokeWidth="0.6"
          />
        </>
      );
  }
}

/** Shoulder plates for armour, drawn over the arms. */
export function Pauldrons({ o }: { o: OutfitStyle }) {
  if (o.kind !== 'armor') return null;
  return (
    <>
      <Cel d="M30 84 Q30 76 40 76 L42 86 Q36 90 30 84 Z" fill={o.top} dx={-1.5} dy={-1.5} />
      <Cel
        d="M70 84 Q70 76 60 76 L58 86 Q64 90 70 84 Z"
        fill={shade(o.top, 0.1)}
        dx={-1.5}
        dy={-1.5}
      />
    </>
  );
}

/** Below the waist: a robe, a dress, or coat tails. */
export function OutfitSkirt({ o }: { o: OutfitStyle }) {
  const s = o.skirt;
  if (!s) return null;
  const to = s.to;
  if (s.open) {
    return (
      <>
        <Cel d={`M37 102 L49 104 L46 ${to} Q38 ${to + 2} 31 ${to - 2} Z`} fill={s.color}>
          {s.trim && (
            <path
              d={`M33 ${to - 3} Q39 ${to - 1} 46 ${to - 2}`}
              stroke={s.trim}
              strokeWidth="2"
              fill="none"
            />
          )}
        </Cel>
        <Cel
          d={`M63 102 L51 104 L54 ${to} Q62 ${to + 2} 69 ${to - 2} Z`}
          fill={shade(s.color, 0.12)}
        >
          {s.trim && (
            <path
              d={`M67 ${to - 3} Q61 ${to - 1} 54 ${to - 2}`}
              stroke={s.trim}
              strokeWidth="2"
              fill="none"
            />
          )}
        </Cel>
      </>
    );
  }
  return (
    <Cel d={`M37 101 Q50 105 63 101 L70 ${to} Q50 ${to + 5} 30 ${to} Z`} fill={s.color}>
      <path
        d={`M44 106 L42 ${to} M56 106 L58 ${to}`}
        stroke={shade(s.color, 0.3)}
        strokeWidth="1.2"
      />
      {s.trim && (
        <path
          d={`M30 ${to - 2.5} Q50 ${to + 2.5} 70 ${to - 2.5}`}
          stroke={s.trim}
          strokeWidth="3"
          fill="none"
        />
      )}
    </Cel>
  );
}

/** Beard, moustache and pointed ears, over the face. */
export function FaceExtras({ o, skin }: { o: OutfitStyle; skin: string }) {
  return (
    <>
      {o.elf && (
        <>
          <Cel d="M22 49 Q10 40 3 32 Q8 50 22 59 Z" fill={skin} dx={1} dy={1} />
          <Cel d="M78 49 Q90 40 97 32 Q92 50 78 59 Z" fill={skin} dx={1} dy={1} />
        </>
      )}
      {o.beard && (
        <Cel
          d="M22 54 Q22 80 50 86 Q78 80 78 54 Q74 66 64 68 Q57 63 50 66 Q43 63 36 68 Q26 66 22 54 Z"
          fill={o.beard}
          dx={-1.5}
          dy={-2}
        />
      )}
      {(o.moustache || o.beard) && (
        <Cel
          d="M38 65 Q44 60 50 63.5 Q56 60 62 65 Q58 69 50 67 Q42 69 38 65 Z"
          fill={o.moustache ?? shade(o.beard!, 0.15)}
          dx={-1}
          dy={-1}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ hats

/**
 * Drawn in the same frame as the explorer's own hats (head top near y 10, brow near y 36,
 * temples at x 22 and 78).
 */
export function OutfitHat({
  kind,
  color,
  trim,
}: {
  kind: OutfitHatKind;
  color: string;
  trim: string;
}) {
  switch (kind) {
    case 'witch':
      return (
        <>
          <Cel d="M2 38 Q50 22 98 38 Q50 52 2 38 Z" fill={color} dx={0} dy={-2} />
          <Cel
            d="M26 35 Q32 18 42 8 Q52 -4 70 -20 Q64 -4 64 8 Q70 22 74 35 Q50 29 26 35 Z"
            fill={color}
            dx={-3}
            dy={-2}
          >
            <path d="M27 31 Q50 25 73 31 L74 36 Q50 30 26 36 Z" fill={trim} />
            <path d="M44 8 Q54 0 64 -8" stroke={light(color, 0.4)} strokeWidth="2" fill="none" />
          </Cel>
          <rect
            x="45"
            y="27"
            width="10"
            height="8"
            rx="1.5"
            fill="none"
            stroke={INK}
            strokeWidth="1.6"
          />
        </>
      );
    case 'wizard':
      return (
        <>
          <Cel d="M10 37 Q50 24 90 37 Q50 48 10 37 Z" fill={color} dx={0} dy={-2} />
          <Cel d="M28 35 Q38 6 52 -22 Q62 8 72 35 Q50 29 28 35 Z" fill={color} dx={-3} dy={-2}>
            <path d="M29 31 Q50 25 71 31 L72 36 Q50 30 28 36 Z" fill={trim} />
            <path
              d="M44 12 l1.5 3 3 .4 -2.2 2.1 .6 3 -2.9-1.5 -2.9 1.5 .6-3 -2.2-2.1 3-.4 Z"
              fill={trim}
            />
            <circle cx="58" cy="20" r="1.6" fill={trim} />
            <circle cx="51" cy="2" r="1.3" fill={trim} />
          </Cel>
        </>
      );
    case 'helmet':
      return (
        <>
          <Cel
            d="M14 44 Q12 4 50 2 Q88 4 86 44 L86 64 Q80 70 74 62 L74 44 Q50 36 26 44 L26 62 Q20 70 14 64 Z"
            fill={color}
            shadow={shade(color, 0.35)}
            dx={-3}
            dy={-2}
          >
            <path d="M50 2 L50 38" stroke={shade(color, 0.3)} strokeWidth="1.6" />
            <path d="M24 16 Q34 8 44 7" stroke="#fff" strokeWidth="2.4" fill="none" opacity="0.8" />
            <path
              d="M18 42 Q50 30 82 42"
              stroke={shade(color, 0.3)}
              strokeWidth="1.4"
              fill="none"
            />
          </Cel>
          {/* plume */}
          <Cel d="M50 2 Q46 -12 54 -20 Q70 -18 72 -6 Q62 -10 58 2 Z" fill={trim} dx={-1} dy={-1} />
        </>
      );
    case 'hood':
      return (
        <>
          <Cel
            d="M12 56 Q6 10 50 2 Q94 10 88 56 Q86 72 76 78 Q82 58 78 42 Q72 24 50 24 Q28 24 22 42 Q18 58 24 78 Q14 72 12 56 Z"
            fill={color}
            shadow={shade(color, 0.4)}
            dx={-3}
            dy={-2}
          >
            <path
              d="M22 42 Q28 24 50 24 Q72 24 78 42"
              stroke={trim}
              strokeWidth="2.4"
              fill="none"
            />
          </Cel>
          <Cel d="M44 4 Q50 -10 58 -8 Q54 0 56 6 Z" fill={color} dx={-1} dy={-1} />
        </>
      );
    case 'toque':
      return (
        <>
          <Cel
            d="M26 30 Q12 18 24 6 Q28 -10 44 -4 Q50 -14 60 -4 Q76 -10 76 6 Q88 18 74 30 Z"
            fill={color}
            shadow={trim}
            dx={-3}
            dy={-2}
          >
            <path
              d="M40 2 Q42 14 40 28 M60 2 Q58 14 60 28"
              stroke={trim}
              strokeWidth="1.4"
              fill="none"
            />
          </Cel>
          <Cel d="M26 28 L74 28 L74 37 Q50 33 26 37 Z" fill={color} shadow={trim} dx={0} dy={-1} />
        </>
      );
    case 'police':
      return (
        <>
          <Cel d="M18 25 Q20 4 50 4 Q80 4 82 25 L76 30 L24 30 Z" fill={color} dx={-3} dy={-2}>
            <path
              d="M50 10 l2 4 4.4 .6 -3.2 3.1 .8 4.4 -4-2.1 -4 2.1 .8-4.4 -3.2-3.1 4.4-.6 Z"
              fill={trim}
            />
          </Cel>
          <Cel d="M23 27 L77 27 L77 33 Q50 30 23 33 Z" fill={INK} shadow={INK} />
          <path d="M23 29 L77 29" stroke={trim} strokeWidth="1.4" />
          <Cel d="M27 32 Q50 27 73 32 Q67 38 50 36.5 Q33 38 27 32 Z" fill="#1b1530" shadow="#000" />
        </>
      );
    case 'straw':
      return (
        <>
          <Cel d="M0 37 Q50 22 100 37 Q50 52 0 37 Z" fill={color} dx={0} dy={-2}>
            <path d="M10 36 Q50 26 90 36" stroke={shade(color, 0.25)} strokeWidth="1" fill="none" />
          </Cel>
          <Cel d="M27 34 Q27 8 50 8 Q73 8 73 34 Q50 29 27 34 Z" fill={color} dx={-3} dy={-2}>
            <path d="M27 27 Q50 22 73 27 L73 33 Q50 28 27 33 Z" fill={trim} />
            <path
              d="M34 16 Q50 10 66 16 M30 22 Q50 16 70 22"
              stroke={shade(color, 0.25)}
              strokeWidth="1"
              fill="none"
            />
          </Cel>
        </>
      );
    case 'nurse':
      return (
        <Cel
          d="M30 22 Q50 6 70 22 L67 32 Q50 27 33 32 Z"
          fill={color}
          shadow="#d8dce8"
          dx={-2}
          dy={-1}
        >
          <path d="M47 18 H53 M50 15 V21" stroke={trim} strokeWidth="2.6" />
        </Cel>
      );
    case 'headphones':
      return (
        <>
          <path d="M18 42 Q14 0 50 0 Q86 0 82 42" fill="none" stroke={INK} strokeWidth="7" />
          <path d="M18 42 Q14 0 50 0 Q86 0 82 42" fill="none" stroke={color} strokeWidth="4" />
          <Cel d="M8 38 Q8 30 16 30 Q24 30 24 38 L24 50 Q24 58 16 58 Q8 58 8 50 Z" fill={color}>
            <circle cx="14" cy="44" r="3" fill={trim} />
          </Cel>
          <Cel d="M76 38 Q76 30 84 30 Q92 30 92 38 L92 50 Q92 58 84 58 Q76 58 76 50 Z" fill={color}>
            <circle cx="86" cy="44" r="3" fill={trim} />
          </Cel>
        </>
      );
    case 'circlet':
      return (
        <>
          <path d="M22 30 Q50 20 78 30" fill="none" stroke={INK} strokeWidth="5" />
          <path d="M22 30 Q50 20 78 30" fill="none" stroke={color} strokeWidth="2.8" />
          <Cel d="M50 18 L55 25 L50 31 L45 25 Z" fill={trim} dx={-1} dy={-1} />
        </>
      );
    case 'cap':
      return null; // drawn with the explorer's own cap, in the outfit's colours
  }
}
