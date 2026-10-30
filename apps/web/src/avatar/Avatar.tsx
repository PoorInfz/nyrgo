import { COSMETICS_BY_ID, type AvatarLook } from '@nyrgo/shared';

/**
 * The player's explorer, drawn in layers so every cosmetic combines with every other. Original
 * art: a small chibi walker. `walking` swings arms and legs; `facing` mirrors the figure.
 */
export function Avatar({
  look,
  walking = false,
  facing = 'right',
  size = 64,
  title,
}: {
  look: AvatarLook;
  walking?: boolean;
  facing?: 'left' | 'right';
  size?: number;
  /** Accessible name; without it the figure is decorative. */
  title?: string;
}) {
  const color = (id: string, fallback: string) => COSMETICS_BY_ID.get(id)?.color ?? fallback;
  const trim = (id: string, fallback: string) => COSMETICS_BY_ID.get(id)?.trim ?? fallback;
  const skin = color(look.skin, '#f5c6a0');
  const hair = color(look.hairColor, '#6b4226');
  const top = color(look.top, '#2bb5a0');
  const topTrim = trim(look.top, '#1d7f71');
  const hat = look.hat;
  const acc = look.accessory;
  const ink = '#06222b';
  const cls = ['avatar', walking ? 'walking' : '', facing === 'left' ? 'facing-left' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      className={cls}
      viewBox="0 0 64 84"
      width={size}
      height={(size * 84) / 64}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <ellipse cx="32" cy="80" rx="15" ry="3.5" fill="#06222b" opacity="0.22" />
      <g className="avatar-body">
        {/* behind the body */}
        {acc === 'acc_cape' && (
          <path
            d="M20 40 Q32 36 44 40 L50 70 Q32 76 14 70 Z"
            fill={color(acc, '#9b4ff5')}
            stroke={ink}
            strokeWidth="2"
          />
        )}
        {acc === 'acc_backpack' && (
          <rect
            x="40"
            y="39"
            width="11"
            height="17"
            rx="4"
            fill={color(acc, '#22c96b')}
            stroke={ink}
            strokeWidth="2"
          />
        )}
        {(look.hair === 'hair_long' || look.hair === 'hair_ponytail') && (
          <path
            d={
              look.hair === 'hair_long'
                ? 'M17 24 Q16 44 22 48 L42 48 Q48 44 47 24 Z'
                : 'M44 18 Q56 22 52 40 Q48 34 45 26 Z'
            }
            fill={hair}
            stroke={ink}
            strokeWidth="2"
          />
        )}

        {/* legs */}
        <g className="leg leg-back">
          <rect
            x="34"
            y="55"
            width="7"
            height="16"
            rx="3"
            fill="#3b4a6b"
            stroke={ink}
            strokeWidth="2"
          />
          <rect x="33" y="68" width="10" height="6" rx="3" fill={ink} />
        </g>
        <g className="leg leg-front">
          <rect
            x="23"
            y="55"
            width="7"
            height="16"
            rx="3"
            fill="#3b4a6b"
            stroke={ink}
            strokeWidth="2"
          />
          <rect x="21" y="68" width="10" height="6" rx="3" fill={ink} />
        </g>

        {/* arms and body */}
        <g className="arm arm-back">
          <rect
            x="41"
            y="40"
            width="7"
            height="15"
            rx="3.5"
            fill={top}
            stroke={ink}
            strokeWidth="2"
          />
          <circle cx="44.5" cy="56" r="3.2" fill={skin} stroke={ink} strokeWidth="1.6" />
        </g>
        <rect x="20" y="37" width="24" height="22" rx="8" fill={top} stroke={ink} strokeWidth="2" />
        {look.top === 'top_hoodie' && (
          <path d="M24 38 Q32 46 40 38" fill="none" stroke={topTrim} strokeWidth="3" />
        )}
        {look.top === 'top_track' && (
          <path d="M26 38 V58 M38 38 V58" stroke={topTrim} strokeWidth="2.5" />
        )}
        {look.top === 'top_explorer' && (
          <>
            <path d="M32 38 V58" stroke={topTrim} strokeWidth="2" />
            <rect x="23" y="45" width="6" height="5" rx="1" fill={topTrim} />
            <rect x="35" y="45" width="6" height="5" rx="1" fill={topTrim} />
          </>
        )}
        {look.top === 'top_raincoat' && (
          <path d="M22 52 H42" stroke={topTrim} strokeWidth="2.5" strokeLinecap="round" />
        )}
        {look.top === 'top_cosmic' && (
          <>
            <circle cx="27" cy="45" r="1.4" fill={topTrim} />
            <circle cx="37" cy="50" r="1.2" fill={topTrim} />
            <circle cx="31" cy="54" r="1" fill={topTrim} />
            <path
              d="M33 41 l1.2 2.4 2.6.3-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.3z"
              fill="#ffcf4d"
            />
          </>
        )}
        {look.top.startsWith('top_tee') && (
          <path d="M27 38 Q32 42 37 38" fill="none" stroke={topTrim} strokeWidth="2" />
        )}
        {acc === 'acc_backpack' && (
          <path d="M24 38 L26 58 M40 38 L38 58" stroke={trim(acc, ink)} strokeWidth="2.5" />
        )}
        <g className="arm arm-front">
          <rect
            x="16"
            y="40"
            width="7"
            height="15"
            rx="3.5"
            fill={top}
            stroke={ink}
            strokeWidth="2"
          />
          <circle cx="19.5" cy="56" r="3.2" fill={skin} stroke={ink} strokeWidth="1.6" />
        </g>
        {acc === 'acc_scarf' && (
          <>
            <rect
              x="21"
              y="34"
              width="22"
              height="6"
              rx="3"
              fill={color(acc, '#ef4a5b')}
              stroke={ink}
              strokeWidth="2"
            />
            <rect
              x="36"
              y="38"
              width="5"
              height="10"
              rx="2"
              fill={trim(acc, '#ffcf4d')}
              stroke={ink}
              strokeWidth="1.6"
            />
          </>
        )}

        {/* head */}
        <circle cx="32" cy="23" r="14" fill={skin} stroke={ink} strokeWidth="2" />
        <ellipse cx="27" cy="25" rx="1.8" ry="2.4" fill={ink} />
        <ellipse cx="37" cy="25" rx="1.8" ry="2.4" fill={ink} />
        <circle cx="24" cy="29" r="2" fill="#ef4a5b" opacity="0.25" />
        <circle cx="40" cy="29" r="2" fill="#ef4a5b" opacity="0.25" />
        <path
          d="M29.5 30 Q32 32 34.5 30"
          fill="none"
          stroke={ink}
          strokeWidth="1.6"
          strokeLinecap="round"
        />

        {/* hair on top */}
        <Hair
          style={look.hair}
          fill={hair}
          ink={ink}
          hidden={hat !== 'hat_none' && hat !== 'hat_leaf' && hat !== 'hat_crown'}
        />

        {/* hats */}
        {hat === 'hat_cap' && (
          <>
            <path
              d="M18 18 Q32 4 46 18 Z"
              fill={color(hat, '#ef4a5b')}
              stroke={ink}
              strokeWidth="2"
            />
            <path
              d="M40 17 H54 Q54 21 46 21 H40 Z"
              fill={color(hat, '#ef4a5b')}
              stroke={ink}
              strokeWidth="2"
            />
            <circle cx="32" cy="9" r="1.8" fill={trim(hat, '#fff')} />
          </>
        )}
        {hat === 'hat_beanie' && (
          <>
            <path
              d="M18 19 Q32 2 46 19 Z"
              fill={color(hat, '#3f6fd8')}
              stroke={ink}
              strokeWidth="2"
            />
            <rect
              x="17"
              y="16"
              width="30"
              height="6"
              rx="3"
              fill={trim(hat, '#ffcf4d')}
              stroke={ink}
              strokeWidth="2"
            />
            <circle
              cx="32"
              cy="5"
              r="3"
              fill={trim(hat, '#ffcf4d')}
              stroke={ink}
              strokeWidth="1.6"
            />
          </>
        )}
        {hat === 'hat_explorer' && (
          <>
            <ellipse
              cx="32"
              cy="17"
              rx="22"
              ry="4.5"
              fill={color(hat, '#c9a46a')}
              stroke={ink}
              strokeWidth="2"
            />
            <path
              d="M21 16 Q22 4 32 4 Q42 4 43 16 Z"
              fill={color(hat, '#c9a46a')}
              stroke={ink}
              strokeWidth="2"
            />
            <rect x="21.5" y="12" width="21" height="3.5" fill={trim(hat, '#5c4626')} />
          </>
        )}
        {hat === 'hat_leaf' && (
          <>
            <path d="M32 9 Q30 2 34 -1" fill="none" stroke={trim(hat, '#22c96b')} strokeWidth="2" />
            <path
              d="M33 1 Q42 -3 44 5 Q36 8 33 1 Z"
              fill={color(hat, '#43f289')}
              stroke={ink}
              strokeWidth="1.8"
            />
          </>
        )}
        {hat === 'hat_crown' && (
          <>
            <path
              d="M22 13 L24 3 L28 9 L32 1 L36 9 L40 3 L42 13 Z"
              fill={color(hat, '#ffcf4d')}
              stroke={ink}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="32" cy="9.5" r="1.6" fill={trim(hat, '#ef4a5b')} />
          </>
        )}

        {acc === 'acc_glasses' && (
          <g fill="none" stroke={color(acc, ink)} strokeWidth="1.8">
            <circle cx="27" cy="25" r="4" />
            <circle cx="37" cy="25" r="4" />
            <path d="M31 25 H33" />
          </g>
        )}
      </g>
    </svg>
  );
}

function Hair({
  style,
  fill,
  ink,
  hidden,
}: {
  style: string;
  fill: string;
  ink: string;
  /** Under a hat only the fringe shows. */
  hidden: boolean;
}) {
  const p = { fill, stroke: ink, strokeWidth: 2, strokeLinejoin: 'round' as const };
  if (hidden) return <path d="M19 21 Q24 17 30 19 Q36 16 45 21 L45 23 L19 23 Z" {...p} />;
  switch (style) {
    case 'hair_buzz':
      return <path d="M19 19 Q32 6 45 19 Q38 15 32 15 Q26 15 19 19 Z" {...p} />;
    case 'hair_spiky':
      return (
        <path
          d="M18 21 L19 12 L23 15 L25 6 L29 12 L32 3 L35 12 L39 6 L41 15 L45 12 L46 21 Q39 16 32 17 Q25 16 18 21 Z"
          {...p}
        />
      );
    case 'hair_bun':
      return (
        <>
          <circle cx="32" cy="6" r="5" {...p} />
          <path d="M18 22 Q18 8 32 8 Q46 8 46 22 Q40 15 32 15 Q24 15 18 22 Z" {...p} />
        </>
      );
    case 'hair_curly':
      return (
        <path
          d="M17 24 Q14 18 19 15 Q18 9 24 9 Q26 4 32 6 Q38 4 40 9 Q46 9 45 15 Q50 18 47 24 Q44 18 38 18 Q35 15 32 17 Q29 15 26 18 Q20 18 17 24 Z"
          {...p}
        />
      );
    case 'hair_long':
    case 'hair_ponytail':
    case 'hair_short':
    default:
      return (
        <path d="M18 23 Q16 8 32 8 Q48 8 46 23 Q42 15 34 16 Q30 13 26 17 Q21 17 18 23 Z" {...p} />
      );
  }
}
