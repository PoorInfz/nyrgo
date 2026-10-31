/** The starter chest, drawn for nyrGo!: violet wood, gold bands and a glowing gem lock. */

export function ChestLid() {
  return (
    <svg viewBox="0 0 200 92" className="sc-lid-svg" aria-hidden="true">
      <defs>
        <linearGradient id="sc-wood-l" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7c4dff" />
          <stop offset="0.55" stopColor="#4c2a9e" />
          <stop offset="1" stopColor="#2c1866" />
        </linearGradient>
        <linearGradient id="sc-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="0.4" stopColor="#ffcf4d" />
          <stop offset="1" stopColor="#b7791f" />
        </linearGradient>
      </defs>
      {/* dome */}
      <path
        d="M8 92 L8 44 Q8 4 100 4 Q192 4 192 44 L192 92 Z"
        fill="url(#sc-wood-l)"
        stroke="#1a0d40"
        strokeWidth="4"
      />
      {/* planks */}
      <path
        d="M10 62 H190 M14 34 Q100 20 186 34"
        stroke="#1a0d40"
        strokeOpacity="0.5"
        strokeWidth="2.5"
        fill="none"
      />
      <path
        d="M30 16 Q60 9 100 9"
        stroke="#b69bff"
        strokeOpacity="0.55"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      {/* bands */}
      <path
        d="M34 92 V22 Q34 14 42 12 L50 10 V92 Z"
        fill="url(#sc-gold)"
        stroke="#5c3a0a"
        strokeWidth="2.5"
      />
      <path
        d="M166 92 V22 Q166 14 158 12 L150 10 V92 Z"
        fill="url(#sc-gold)"
        stroke="#5c3a0a"
        strokeWidth="2.5"
      />
      {/* rim */}
      <rect
        x="4"
        y="80"
        width="192"
        height="12"
        rx="4"
        fill="url(#sc-gold)"
        stroke="#5c3a0a"
        strokeWidth="2.5"
      />
      {/* studs */}
      {[42, 158].map((x) => (
        <g key={x}>
          <circle cx={x} cy="30" r="3.2" fill="#fff3b0" stroke="#5c3a0a" strokeWidth="1.5" />
          <circle cx={x} cy="64" r="3.2" fill="#fff3b0" stroke="#5c3a0a" strokeWidth="1.5" />
        </g>
      ))}
    </svg>
  );
}

export function ChestBase() {
  return (
    <svg viewBox="0 0 200 118" className="sc-base-svg" aria-hidden="true">
      <defs>
        <linearGradient id="sc-wood-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b34c4" />
          <stop offset="1" stopColor="#24124f" />
        </linearGradient>
        <radialGradient id="sc-gem" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" style={{ stopColor: 'var(--gem, #43f289)' }} />
          <stop offset="1" stopColor="#0b3d2a" />
        </radialGradient>
      </defs>
      <rect
        x="8"
        y="0"
        width="184"
        height="112"
        rx="6"
        fill="url(#sc-wood-b)"
        stroke="#1a0d40"
        strokeWidth="4"
      />
      <path d="M10 38 H190 M10 76 H190" stroke="#1a0d40" strokeOpacity="0.5" strokeWidth="2.5" />
      <path
        d="M18 14 H80"
        stroke="#9a7bff"
        strokeOpacity="0.4"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* bands and corners */}
      <rect
        x="34"
        y="0"
        width="16"
        height="112"
        fill="url(#sc-gold)"
        stroke="#5c3a0a"
        strokeWidth="2.5"
      />
      <rect
        x="150"
        y="0"
        width="16"
        height="112"
        fill="url(#sc-gold)"
        stroke="#5c3a0a"
        strokeWidth="2.5"
      />
      <path
        d="M8 96 V112 H26 Z M192 96 V112 H174 Z"
        fill="url(#sc-gold)"
        stroke="#5c3a0a"
        strokeWidth="2"
      />
      <rect
        x="4"
        y="104"
        width="192"
        height="12"
        rx="4"
        fill="url(#sc-gold)"
        stroke="#5c3a0a"
        strokeWidth="2.5"
      />
      {[42, 158].map((x) => (
        <g key={x}>
          <circle cx={x} cy="22" r="3.2" fill="#fff3b0" stroke="#5c3a0a" strokeWidth="1.5" />
          <circle cx={x} cy="88" r="3.2" fill="#fff3b0" stroke="#5c3a0a" strokeWidth="1.5" />
        </g>
      ))}
      {/* lock plate with the gem */}
      <path
        d="M78 -2 H122 V30 Q122 46 100 54 Q78 46 78 30 Z"
        fill="url(#sc-gold)"
        stroke="#5c3a0a"
        strokeWidth="2.5"
      />
      <path
        d="M100 12 L112 24 L100 40 L88 24 Z"
        fill="url(#sc-gem)"
        stroke="#1a0d40"
        strokeWidth="2"
        className="sc-gem"
      />
      <path
        d="M95 20 L100 15 L103 18"
        stroke="#fff"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
