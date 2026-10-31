import { useId, type ReactNode } from 'react';
import type { Element } from '@nyrgo/shared';

/**
 * Painted backdrops, drawn in SVG: one habitat per element for the Dex (where each kind of
 * creature lives), and one per kind of place on the map for encounters (where this one was found).
 * Original art; layers drift slowly (clouds, water, embers, stars) and stop with reduced motion.
 * The ground line sits at about 70 % of the height, where a creature stands.
 */
export type Place = 'urban' | 'park' | 'historic' | 'culture';
export type HabitatKind = Element | Place;

export function Habitat({ kind, night = false }: { kind: HabitatKind; night?: boolean }) {
  const u = useId().replace(/:/g, '');
  const g = (name: string) => `${name}-${u}`;
  const url = (name: string) => `url(#${g(name)})`;
  const sky = (top: string, bottom: string) => (
    <linearGradient id={g('sky')} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={top} />
      <stop offset="1" stopColor={bottom} />
    </linearGradient>
  );
  const scene: Record<HabitatKind, { defs: ReactNode; body: ReactNode }> = {
    // -------------------------------------------------------------- elements (the Dex)
    water: {
      defs: (
        <>
          {sky('#7fd8ff', '#d9f6ff')}
          <linearGradient id={g('sea')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2bb5d8" />
            <stop offset="1" stopColor="#0d5f8f" />
          </linearGradient>
        </>
      ),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          <circle cx="320" cy="60" r="26" fill="#fff6c9" opacity="0.9" />
          <g className="hb-drift">
            <ellipse cx="80" cy="60" rx="46" ry="12" fill="#fff" opacity="0.8" />
            <ellipse cx="230" cy="40" rx="34" ry="9" fill="#fff" opacity="0.7" />
          </g>
          <path d="M0 150 Q60 130 120 148 T240 146 T400 140 L400 300 L0 300 Z" fill={url('sea')} />
          <g className="hb-wave" fill="none" stroke="#bff3ff" strokeWidth="3" opacity="0.7">
            <path d="M-20 170 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" />
            <path
              d="M-40 196 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0"
              opacity="0.6"
            />
          </g>
          {/* a sandbank with gold coins washed up */}
          <ellipse cx="200" cy="246" rx="190" ry="38" fill="#f2d79a" />
          <ellipse cx="200" cy="240" rx="170" ry="28" fill="#f8e6b8" />
          {[70, 300, 340].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy="236" rx="8" ry="3.5" fill="#d79a1c" />
              <ellipse cx={x} cy="234" rx="8" ry="3.5" fill="#ffcf4d" />
            </g>
          ))}
          <g className="hb-rise" fill="#e8fbff" opacity="0.8">
            <circle cx="40" cy="200" r="4" />
            <circle cx="360" cy="190" r="3" />
            <circle cx="120" cy="215" r="2.5" />
          </g>
        </>
      ),
    },
    fire: {
      defs: (
        <>
          {sky('#3a0f1e', '#ff7a3d')}
          <radialGradient id={g('glow')} cx="0.5" cy="0.4" r="0.6">
            <stop offset="0" stopColor="#ffcf4d" />
            <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
          </radialGradient>
        </>
      ),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          {/* the volcano */}
          <path d="M90 200 L180 70 L220 70 L310 200 Z" fill="#4a1d24" />
          <path d="M180 70 L220 70 L210 90 L195 82 L185 92 Z" fill="#ff7a1f" />
          <ellipse cx="200" cy="66" rx="60" ry="30" fill={url('glow')} className="hb-pulse" />
          <path
            d="M196 90 Q190 130 200 160 Q206 180 198 200"
            stroke="#ff9a2f"
            strokeWidth="5"
            fill="none"
          />
          <path d="M0 210 Q100 180 200 205 T400 200 L400 300 L0 300 Z" fill="#2a0f14" />
          <path d="M0 236 Q120 222 230 240 T400 236 L400 300 L0 300 Z" fill="#3e1418" />
          {/* lava cracks */}
          <path
            d="M40 260 l30 -6 l20 10 M280 270 l26 -10 l30 6 M150 284 l40 -4"
            stroke="#ff7a1f"
            strokeWidth="3"
            fill="none"
          />
          <g className="hb-rise" fill="#ffcf4d">
            <circle cx="60" cy="230" r="2.5" />
            <circle cx="140" cy="250" r="2" />
            <circle cx="260" cy="226" r="3" />
            <circle cx="340" cy="246" r="2" />
          </g>
        </>
      ),
    },
    nature: {
      defs: sky('#9fe3ff', '#e9fbd2'),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          <g className="hb-drift">
            <ellipse cx="110" cy="50" rx="40" ry="11" fill="#fff" />
            <ellipse cx="300" cy="70" rx="30" ry="8" fill="#fff" opacity="0.8" />
          </g>
          <path d="M0 170 Q100 140 200 162 T400 150 L400 300 L0 300 Z" fill="#7fd36b" />
          {/* crop rows of a little farm */}
          <path d="M0 200 Q200 180 400 196 L400 300 L0 300 Z" fill="#5cb85c" />
          {[214, 232, 252, 276].map((y, i) => (
            <path
              key={y}
              d={`M-10 ${y} Q200 ${y - 14 + i * 2} 410 ${y - 2}`}
              stroke="#3f9a45"
              strokeWidth="4"
              fill="none"
            />
          ))}
          {/* trees */}
          {[
            [40, 160],
            [350, 150],
            [300, 168],
          ].map(([x, y]) => (
            <g key={x} className="hb-sway">
              <rect x={x! - 4} y={y! - 6} width="8" height="26" fill="#7a4a22" />
              <circle cx={x} cy={y! - 18} r="22" fill="#3f9a45" />
              <circle cx={x! - 8} cy={y! - 26} r="12" fill="#5cc45c" />
            </g>
          ))}
          {/* sprouts with coin leaves */}
          {[110, 180, 250].map((x) => (
            <g key={x}>
              <path d={`M${x} 236 q-2 -12 2 -18`} stroke="#2f7a35" strokeWidth="3" fill="none" />
              <ellipse cx={x - 6} cy="220" rx="7" ry="4" fill="#7fe07f" />
              <circle cx={x + 6} cy="216" r="4.5" fill="#ffcf4d" stroke="#c99a1c" />
            </g>
          ))}
        </>
      ),
    },
    earth: {
      defs: sky('#c98a5a', '#f3c98e'),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          {/* canyon walls in layers */}
          <path d="M0 40 L70 60 L90 200 L0 210 Z" fill="#9a5a34" />
          <path d="M400 30 L320 70 L300 200 L400 210 Z" fill="#8a4f2e" />
          <path
            d="M0 90 L60 96 M0 140 L80 146 M400 100 L330 110 M400 150 L310 156"
            stroke="#6b3a20"
            strokeWidth="3"
          />
          {/* the mine's entrance */}
          <path d="M150 200 L150 130 Q200 90 250 130 L250 200 Z" fill="#2a1a12" />
          <path
            d="M146 200 L146 128 M254 200 L254 128 M140 126 L260 126"
            stroke="#7a4a22"
            strokeWidth="8"
          />
          <path d="M0 200 L400 200 L400 300 L0 300 Z" fill="#b8784a" />
          <path d="M120 300 L190 200 M280 300 L210 200" stroke="#5a3a24" strokeWidth="5" />
          {/* crystals and blocks */}
          {[
            [40, 250, '#43d2ee'],
            [350, 240, '#9b6bff'],
            [300, 280, '#43f289'],
          ].map(([x, y, c]) => (
            <g key={x as number} className="hb-glint">
              <path
                d={`M${x} ${y} l10 -30 l10 30 Z`}
                fill={c as string}
                stroke="#1b1530"
                strokeWidth="2"
              />
              <path
                d={`M${(x as number) + 12} ${y} l8 -20 l8 20 Z`}
                fill={c as string}
                opacity="0.8"
                stroke="#1b1530"
                strokeWidth="2"
              />
            </g>
          ))}
          <rect
            x="80"
            y="262"
            width="22"
            height="22"
            fill="#8a8f9e"
            stroke="#1b1530"
            strokeWidth="2"
          />
          <rect
            x="96"
            y="250"
            width="18"
            height="18"
            fill="#a6abb9"
            stroke="#1b1530"
            strokeWidth="2"
          />
        </>
      ),
    },
    electric: {
      defs: sky('#160a3a', '#5a1fa0'),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          {/* neon skyline */}
          {[
            [0, 90, 50],
            [46, 60, 40],
            [80, 110, 46],
            [120, 40, 50],
            [260, 70, 46],
            [300, 30, 52],
            [348, 100, 52],
          ].map(([x, y, w]) => (
            <g key={x}>
              <rect
                x={x}
                y={y}
                width={w}
                height={210 - y!}
                fill="#24124f"
                stroke="#c084fc"
                strokeWidth="1.5"
              />
              {Array.from({ length: 5 }, (_, i) => (
                <rect
                  key={i}
                  x={x! + 8}
                  y={y! + 12 + i * 22}
                  width={w! - 16}
                  height="5"
                  fill={i % 2 ? '#43d2ee' : '#ff7ac8'}
                  opacity="0.7"
                  className="hb-flicker"
                />
              ))}
            </g>
          ))}
          <path
            className="hb-bolt"
            d="M210 20 L190 80 L214 80 L196 140"
            stroke="#fff6a0"
            strokeWidth="5"
            fill="none"
          />
          <path d="M0 210 L400 210 L400 300 L0 300 Z" fill="#1b0f3a" />
          {/* circuit lines on the ground */}
          <g stroke="#c084fc" strokeWidth="2.5" fill="none" opacity="0.8">
            <path d="M20 240 H120 V270 H200" />
            <path d="M380 236 H280 V280 H220" />
            <circle cx="200" cy="270" r="5" fill="#c084fc" />
            <circle cx="220" cy="280" r="5" fill="#43d2ee" />
          </g>
        </>
      ),
    },
    wind: {
      defs: sky('#5fc8ff', '#e6f7ff'),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          <g className="hb-drift">
            <ellipse cx="60" cy="90" rx="60" ry="18" fill="#fff" />
            <ellipse cx="340" cy="60" rx="50" ry="14" fill="#fff" />
            <ellipse cx="220" cy="130" rx="40" ry="10" fill="#fff" opacity="0.8" />
          </g>
          {/* parachuted crates drifting down */}
          {[
            [90, 40],
            [300, 110],
          ].map(([x, y]) => (
            <g key={x} className="hb-float">
              <path
                d={`M${x! - 18} ${y} Q${x} ${y! - 22} ${x! + 18} ${y} Z`}
                fill="#ff7ac8"
                stroke="#1b1530"
                strokeWidth="2"
              />
              <path
                d={`M${x! - 18} ${y} L${x! - 5} ${y! + 18} M${x! + 18} ${y} L${x! + 5} ${y! + 18}`}
                stroke="#1b1530"
                strokeWidth="1.2"
              />
              <rect
                x={x! - 7}
                y={y! + 18}
                width="14"
                height="12"
                fill="#c98a5a"
                stroke="#1b1530"
                strokeWidth="2"
              />
            </g>
          ))}
          {/* a floating island */}
          <path d="M40 210 Q200 180 360 210 Q300 280 200 300 Q100 280 40 210 Z" fill="#8a6b3f" />
          <path d="M40 210 Q200 180 360 210 Q200 230 40 210 Z" fill="#7fd36b" />
          <g
            className="hb-wind"
            stroke="#fff"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            opacity="0.8"
          >
            <path d="M20 160 q40 -10 80 0" />
            <path d="M260 180 q40 -10 90 0" />
          </g>
        </>
      ),
    },
    ice: {
      defs: sky('#a8d8ff', '#f2fbff'),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          <path
            d="M0 200 L60 80 L110 170 L170 60 L240 180 L300 90 L400 200 Z"
            fill="#dff1ff"
            stroke="#9cc8ec"
            strokeWidth="3"
          />
          <path
            d="M60 80 L76 112 L50 108 Z M170 60 L188 98 L156 92 Z M300 90 L316 120 L288 116 Z"
            fill="#fff"
          />
          {/* the cold vault, frozen into the glacier */}
          <rect
            x="164"
            y="132"
            width="72"
            height="62"
            rx="8"
            fill="#9cc8ec"
            stroke="#1b1530"
            strokeWidth="2.5"
          />
          <circle cx="200" cy="163" r="18" fill="#dff1ff" stroke="#1b1530" strokeWidth="2.5" />
          <path d="M200 147 V179 M184 163 H216" stroke="#3f6fd8" strokeWidth="3" />
          <path d="M0 200 L400 200 L400 300 L0 300 Z" fill="#eef8ff" />
          <path d="M0 230 Q100 220 200 232 T400 228" stroke="#c9e6ff" strokeWidth="4" fill="none" />
          <g className="hb-snow" fill="#fff">
            {[30, 90, 150, 210, 270, 330, 380].map((x, i) => (
              <circle key={x} cx={x} cy={20 + ((i * 37) % 160)} r={2 + (i % 2)} />
            ))}
          </g>
        </>
      ),
    },
    cosmic: {
      defs: (
        <>
          {sky('#05061a', '#2a1a5c')}
          <radialGradient id={g('moon')} cx="0.4" cy="0.4" r="0.6">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#c9c3e6" />
          </radialGradient>
        </>
      ),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          <g className="hb-twinkle" fill="#fff">
            {Array.from({ length: 28 }, (_, i) => (
              <circle key={i} cx={(i * 53) % 400} cy={(i * 37) % 190} r={i % 4 === 0 ? 1.8 : 1} />
            ))}
          </g>
          <circle cx="300" cy="80" r="40" fill={url('moon')} />
          <circle cx="288" cy="70" r="7" fill="#b3abd9" />
          <circle cx="312" cy="96" r="5" fill="#b3abd9" />
          <g className="hb-orbit">
            <circle cx="90" cy="60" r="14" fill="#ff7ac8" />
            <ellipse cx="90" cy="60" rx="24" ry="6" fill="none" stroke="#ffcf4d" strokeWidth="2" />
          </g>
          {/* a rocket's trail heading up */}
          <path
            d="M60 190 Q140 140 170 40"
            stroke="#ffcf4d"
            strokeWidth="3"
            strokeDasharray="6 8"
            fill="none"
            opacity="0.7"
          />
          {/* the moon's surface */}
          <path d="M0 210 Q200 180 400 210 L400 300 L0 300 Z" fill="#8f86b8" />
          <ellipse cx="90" cy="250" rx="30" ry="8" fill="#6f6698" />
          <ellipse cx="320" cy="262" rx="40" ry="10" fill="#6f6698" />
        </>
      ),
    },
    light: {
      defs: (
        <>
          {sky('#ffe9a8', '#fff8e6')}
          <radialGradient id={g('sun')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff" />
            <stop offset="1" stopColor="#ffcf4d" stopOpacity="0" />
          </radialGradient>
        </>
      ),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          <g className="hb-spin" style={{ transformOrigin: '200px 70px' }} opacity="0.5">
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d="M200 70 L190 -60 L210 -60 Z"
                fill="#ffcf4d"
                transform={`rotate(${i * 30} 200 70)`}
              />
            ))}
          </g>
          <circle cx="200" cy="70" r="60" fill={url('sun')} />
          {/* the oracle's temple, with a screen of rising charts */}
          <path d="M100 120 L200 80 L300 120 Z" fill="#f4f1ea" stroke="#c9a46a" strokeWidth="3" />
          {[120, 160, 240, 280].map((x) => (
            <rect
              key={x}
              x={x - 7}
              y="124"
              width="14"
              height="76"
              fill="#fffaf0"
              stroke="#c9a46a"
              strokeWidth="2"
            />
          ))}
          <rect
            x="170"
            y="130"
            width="60"
            height="44"
            rx="4"
            fill="#24124f"
            stroke="#c9a46a"
            strokeWidth="2"
          />
          <path
            className="hb-chart"
            d="M176 166 L188 156 L198 160 L210 146 L224 140"
            stroke="#43f289"
            strokeWidth="3"
            fill="none"
          />
          <path d="M0 200 L400 200 L400 300 L0 300 Z" fill="#f2e2b8" />
          <path
            d="M80 300 L140 200 M320 300 L260 200 M0 240 H400"
            stroke="#e0c98e"
            strokeWidth="3"
          />
        </>
      ),
    },
    shadow: {
      defs: (
        <>
          {sky('#0d0820', '#3a2a55')}
          <radialGradient id={g('fog')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#b46cff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#b46cff" stopOpacity="0" />
          </radialGradient>
        </>
      ),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          <circle cx="320" cy="60" r="28" fill="#e6dcff" />
          <circle cx="332" cy="54" r="26" fill="#160d2e" />
          {/* crooked ruins and a red candle chart going down */}
          <path
            d="M30 200 L30 110 L60 96 L70 200 Z M330 200 L340 120 L380 130 L372 200 Z"
            fill="#241a3a"
            stroke="#5a4580"
            strokeWidth="2"
          />
          <path d="M120 200 L130 140 L150 150 L156 200 Z" fill="#1d1530" />
          <g>
            {[
              [200, 110, 40],
              [216, 126, 46],
              [232, 146, 40],
              [248, 160, 34],
            ].map(([x, y, h]) => (
              <rect
                key={x}
                x={x}
                y={y}
                width="10"
                height={h}
                fill="#ef4a5b"
                stroke="#1b1530"
                strokeWidth="1.5"
              />
            ))}
          </g>
          <path d="M0 200 Q200 186 400 200 L400 300 L0 300 Z" fill="#1d1530" />
          <ellipse cx="120" cy="230" rx="160" ry="40" fill={url('fog')} className="hb-drift" />
          <ellipse cx="300" cy="250" rx="140" ry="36" fill={url('fog')} className="hb-drift-back" />
          <g className="hb-twinkle" fill="#b46cff">
            <circle cx="90" cy="180" r="2.5" />
            <circle cx="300" cy="170" r="2" />
          </g>
        </>
      ),
    },
    // -------------------------------------------------------------- places on the map
    park: {
      defs: sky('#8fd8ff', '#e9fbd2'),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          <g className="hb-drift">
            <ellipse cx="90" cy="54" rx="44" ry="12" fill="#fff" />
            <ellipse cx="290" cy="40" rx="36" ry="10" fill="#fff" opacity="0.85" />
          </g>
          <path d="M0 180 Q100 160 200 176 T400 170 L400 300 L0 300 Z" fill="#7fd36b" />
          {[
            [30, 172, 30],
            [90, 160, 24],
            [320, 166, 30],
            [380, 176, 22],
          ].map(([x, y, r]) => (
            <g key={x} className="hb-sway">
              <rect x={x! - 5} y={y! - 4} width="10" height="30" fill="#7a4a22" />
              <circle cx={x} cy={y! - 20} r={r} fill="#3f9a45" />
              <circle cx={x! - r! / 3} cy={y! - 28} r={r! / 2} fill="#5cc45c" />
            </g>
          ))}
          {/* pond, bench and flowers */}
          <ellipse cx="300" cy="236" rx="70" ry="16" fill="#4fb8e8" />
          <path
            className="hb-wave"
            d="M250 236 q10 -4 20 0 t20 0 t20 0 t20 0"
            stroke="#d9f6ff"
            strokeWidth="2"
            fill="none"
          />
          <rect x="60" y="214" width="56" height="8" rx="2" fill="#a0683a" />
          <path d="M66 222 v14 M110 222 v14" stroke="#5c3a1e" strokeWidth="4" />
          <path d="M0 260 Q200 248 400 262 L400 300 L0 300 Z" fill="#5cb85c" />
          {[30, 150, 180, 360].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy={262 + (i % 2) * 10}
              r="4"
              fill={['#ff7ac8', '#ffcf4d', '#fff', '#c084fc'][i]}
            />
          ))}
        </>
      ),
    },
    historic: {
      defs: sky('#ffd9a8', '#fff2df'),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          {/* old walls, an arch and a bell tower */}
          <path
            d="M260 200 L260 70 L290 50 L320 70 L320 200 Z"
            fill="#e0b98a"
            stroke="#9a6a3a"
            strokeWidth="3"
          />
          <path d="M280 110 Q290 96 300 110 L300 130 L280 130 Z" fill="#5c3a1e" />
          <circle cx="290" cy="122" r="5" fill="#ffcf4d" className="hb-swing" />
          <path
            d="M0 200 L0 120 L20 120 L20 110 L40 110 L40 120 L60 120 L60 110 L80 110 L80 120 L100 120 L100 110 L120 110 L120 120 L140 120 L140 200 Z"
            fill="#d9a77a"
            stroke="#9a6a3a"
            strokeWidth="3"
          />
          <path d="M40 200 L40 160 Q70 130 100 160 L100 200 Z" fill="#7a4a2a" />
          <path
            d="M150 200 L150 140 L250 140 L250 200 Z"
            fill="#e8c69a"
            stroke="#9a6a3a"
            strokeWidth="3"
          />
          {[170, 200, 230].map((x) => (
            <path
              key={x}
              d={`M${x - 8} 190 L${x - 8} 160 Q${x} 150 ${x + 8} 160 L${x + 8} 190 Z`}
              fill="#8a5a34"
            />
          ))}
          {/* cobbles */}
          <path d="M0 200 L400 200 L400 300 L0 300 Z" fill="#cfa77c" />
          <g stroke="#a67c52" strokeWidth="2" fill="none">
            {[220, 244, 270].map((y) => (
              <path key={y} d={`M0 ${y} H400`} />
            ))}
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d={`M${i * 36 + (i % 2) * 18} 200 v20 M${i * 36} 220 v24 M${i * 36 + 18} 244 v26`}
              />
            ))}
          </g>
        </>
      ),
    },
    culture: {
      defs: sky('#c9b8ff', '#f6f0ff'),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          {/* a museum front with banners and a sculpture */}
          <path d="M60 110 L200 60 L340 110 Z" fill="#f4f1ea" stroke="#8f86b8" strokeWidth="3" />
          <rect
            x="60"
            y="110"
            width="280"
            height="12"
            fill="#e6e1f2"
            stroke="#8f86b8"
            strokeWidth="2"
          />
          {[90, 130, 170, 230, 270, 310].map((x) => (
            <rect
              key={x}
              x={x - 8}
              y="122"
              width="16"
              height="78"
              fill="#fbf9ff"
              stroke="#8f86b8"
              strokeWidth="2"
            />
          ))}
          {[110, 290].map((x, i) => (
            <g key={x} className="hb-sway">
              <rect
                x={x - 10}
                y="128"
                width="20"
                height="44"
                fill={i ? '#ff7ac8' : '#43d2ee'}
                stroke="#1b1530"
                strokeWidth="1.5"
              />
              <circle cx={x} cy="150" r="5" fill="#fff" />
            </g>
          ))}
          <path d="M0 200 L400 200 L400 300 L0 300 Z" fill="#e6e1f2" />
          {/* checkered square */}
          <g opacity="0.6">
            {Array.from({ length: 10 }, (_, i) => (
              <rect
                key={i}
                x={i * 40 + (i % 2) * 0}
                y={i % 2 ? 230 : 250}
                width="40"
                height="20"
                fill="#cbc3e6"
              />
            ))}
          </g>
          <path d="M40 200 L40 176 L56 176 L56 200 Z" fill="#b3abd9" />
          <circle cx="48" cy="166" r="10" fill="#d9d3f0" stroke="#8f86b8" strokeWidth="2" />
        </>
      ),
    },
    urban: {
      defs: sky('#9fc9ff', '#eef4ff'),
      body: (
        <>
          <rect width="400" height="300" fill={url('sky')} />
          <g className="hb-drift">
            <ellipse cx="300" cy="40" rx="40" ry="10" fill="#fff" opacity="0.85" />
          </g>
          {/* blocks of flats with lit windows */}
          {[
            [0, 70, 70, '#8fa4d8'],
            [64, 100, 60, '#b0bfe6'],
            [120, 50, 70, '#7f93c9'],
            [270, 80, 64, '#a3b4e0'],
            [330, 60, 70, '#8597cf'],
          ].map(([x, y, w, c]) => (
            <g key={x as number}>
              <rect
                x={x as number}
                y={y as number}
                width={w as number}
                height={200 - (y as number)}
                fill={c as string}
                stroke="#3a4a7a"
                strokeWidth="2"
              />
              {Array.from({ length: 4 }, (_, r) =>
                Array.from({ length: 2 }, (_, k) => (
                  <rect
                    key={`${r}-${k}`}
                    x={(x as number) + 10 + k * (((w as number) - 30) / 1)}
                    y={(y as number) + 14 + r * 28}
                    width="10"
                    height="14"
                    fill={(r + k) % 3 ? '#e6f0ff' : '#ffe08a'}
                  />
                )),
              )}
            </g>
          ))}
          {/* street lamp and a crossing */}
          <path d="M220 200 V120 Q220 110 232 110" stroke="#3a4a7a" strokeWidth="4" fill="none" />
          <circle cx="236" cy="112" r="6" fill="#ffe08a" className="hb-pulse" />
          <path d="M0 200 L400 200 L400 300 L0 300 Z" fill="#6f7b94" />
          <path d="M0 206 L400 206" stroke="#c9cfdc" strokeWidth="6" />
          {[40, 100, 160, 220, 280, 340].map((x) => (
            <rect key={x} x={x} y="246" width="34" height="10" fill="#eef1f7" />
          ))}
        </>
      ),
    },
  };
  const s = scene[kind];
  return (
    <svg
      className={`habitat hb-${kind}${night ? ' hb-night' : ''}`}
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>{s.defs}</defs>
      {s.body}
      {night && (
        <rect width="400" height="300" fill="#0b1240" opacity="0.45" className="hb-nightfall" />
      )}
      {night && (
        <g className="hb-twinkle" fill="#fff">
          {Array.from({ length: 14 }, (_, i) => (
            <circle key={i} cx={(i * 67 + 13) % 400} cy={(i * 29) % 110} r={i % 3 ? 1 : 1.6} />
          ))}
        </g>
      )}
    </svg>
  );
}

/** Night at the player's place (dark before 7 and from 20 h). */
export const isNight = (d = new Date()) => d.getHours() < 7 || d.getHours() >= 20;
