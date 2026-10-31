import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Rarity } from '@nyrgo/shared';
import { sfx } from '../fight/sfx';

/**
 * "Tune the vault": the capture mini-game. Tapping pumps energy into the vault and the energy
 * keeps draining away; a glowing band in the creature's colour drifts up and down the tube. Keep
 * the energy inside the band to fill the lock ring around the vault. A full ring throws at once
 * with a perfect score; otherwise the throw goes when time runs out, scored by how much of the
 * ring was filled. Rarer creatures have a narrower, faster band.
 *
 * The score (0–1) is all the client sends; the server rolls the catch. Then the vault flies, the
 * creature is pulled in, the vault shakes, and it either clicks shut or bursts open.
 */

export type ThrowOutcome = 'caught' | 'escaped' | 'fled';

/** Band width and drift speed (radians per second) by rarity. */
const BAND: Record<Rarity, { width: number; speed: number }> = {
  common: { width: 0.24, speed: 0.9 },
  uncommon: { width: 0.21, speed: 1.1 },
  rare: { width: 0.18, speed: 1.3 },
  epic: { width: 0.15, speed: 1.5 },
  legendary: { width: 0.13, speed: 1.7 },
  mythic: { width: 0.11, speed: 1.9 },
};
/** Seconds of the round after the first tap. */
export const ROUND_S = 4;
/** Seconds inside the band that fill the lock ring. */
export const LOCK_S = 1.6;
const TAP = 0.12;
const DRAIN = 0.36;

const VAULT_COLORS: Record<string, [string, string]> = {
  'vault-basic': ['#8fa4d8', '#3a4a7a'],
  'vault-reinforced': ['#ffb347', '#8a4f12'],
  'vault-cold': ['#9ee7ff', '#1d6f9e'],
};

type Phase = 'ready' | 'aim' | 'flying' | 'shaking' | 'done';

export function ThrowGame({
  rarity,
  color,
  vault,
  disabled,
  outcome,
  still,
  onThrow,
  onFinished,
}: {
  rarity: Rarity;
  /** The creature's element colour, for the band. */
  color: string;
  vault: string;
  disabled: boolean;
  /** Set by the parent once the server answered the throw. */
  outcome: ThrowOutcome | null;
  /** Reduced motion: the band stays still. */
  still: boolean;
  onThrow: (skill: number) => void;
  onFinished: () => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('ready');
  /** What the last frame showed (the simulation itself lives in a ref). */
  const [view, setView] = useState({
    charge: 0,
    center: 0.55,
    lock: 0,
    inside: false,
    flash: 0,
    timeLeft: ROUND_S,
  });
  const s = useRef({ charge: 0, inZone: 0, start: 0, last: 0, center: 0.55, hit: false, flash: 0 });
  const raf = useRef(0);
  const thrown = useRef(false);
  const band = BAND[rarity];

  const release = useCallback(
    (skill: number) => {
      if (thrown.current) return;
      thrown.current = true;
      cancelAnimationFrame(raf.current);
      setPhase('flying');
      sfx('whoosh');
      onThrow(Math.round(Math.min(1, Math.max(0, skill)) * 100) / 100);
    },
    [onThrow],
  );

  // the round
  useEffect(() => {
    if (phase !== 'aim') return;
    const loop = (now: number) => {
      const st = s.current;
      const dt = Math.min(0.05, (now - st.last) / 1000);
      st.last = now;
      const elapsed = (now - st.start) / 1000;
      st.charge = Math.max(0, st.charge - DRAIN * dt);
      st.center = still ? 0.6 : 0.55 + 0.27 * Math.sin(elapsed * band.speed + 0.6);
      const inside = Math.abs(st.charge - st.center) <= band.width / 2;
      if (inside) st.inZone += dt;
      if (inside && !st.hit) sfx('heal');
      st.hit = inside;
      st.flash = Math.max(0, st.flash - dt * 4);
      setView({
        charge: st.charge,
        center: st.center,
        lock: Math.min(1, st.inZone / LOCK_S),
        inside,
        flash: st.flash,
        timeLeft: Math.max(0, ROUND_S - elapsed),
      });
      if (st.inZone >= LOCK_S) {
        sfx('reveal');
        release(1);
        return;
      }
      if (elapsed >= ROUND_S) {
        release(st.inZone / LOCK_S);
        return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [phase, band, still, release]);

  // the answer arrives: shake, then click shut or burst open (at once with reduced motion)
  useEffect(() => {
    if (phase !== 'flying' || !outcome) return;
    if (still) {
      const id = window.setTimeout(onFinished, 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      setPhase('shaking');
      sfx('knock');
    }, 700);
    return () => window.clearTimeout(id);
  }, [phase, outcome, still, onFinished]);
  useEffect(() => {
    if (phase !== 'shaking' || !outcome) return;
    const shakes = outcome === 'caught' ? 3 : outcome === 'escaped' ? 2 : 1;
    const ids = [
      ...Array.from({ length: shakes - 1 }, (_, i) =>
        window.setTimeout(() => sfx('knock'), 650 * (i + 1)),
      ),
      window.setTimeout(
        () => {
          sfx(outcome === 'caught' ? 'win' : 'miss');
          navigator.vibrate?.(outcome === 'caught' ? [40, 30, 120] : 60);
          setPhase('done');
        },
        650 * shakes + 200,
      ),
      window.setTimeout(onFinished, 650 * shakes + 1500),
    ];
    return () => ids.forEach((i) => window.clearTimeout(i));
  }, [phase, outcome, onFinished]);

  function tap() {
    if (disabled || thrown.current) return;
    const st = s.current;
    if (phase === 'ready') {
      const now = performance.now();
      st.start = now;
      st.last = now;
      setPhase('aim');
    }
    st.charge = Math.min(1, st.charge + TAP);
    st.flash = 1;
    sfx('hit');
  }

  const inside = phase === 'aim' && view.inside;
  const lock = view.lock;
  const [vc, vdark] = VAULT_COLORS[vault] ?? VAULT_COLORS['vault-basic']!;
  const style = {
    '--band': color,
    '--vault': vc,
    '--vault-dark': vdark,
    '--charge': phase === 'aim' ? view.charge : 0,
    '--center': view.center,
    '--width': band.width,
    '--lock': lock,
  } as CSSProperties;

  return (
    <div
      className={`tg tg-${phase}${inside ? ' tg-in' : ''}${outcome ? ` tg-${outcome}` : ''}`}
      style={style}
    >
      {/* the whole scene takes taps while aiming */}
      {(phase === 'ready' || phase === 'aim') && (
        <button
          type="button"
          className="tg-pad"
          onPointerDown={(e) => {
            e.preventDefault();
            tap();
          }}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              tap();
            }
          }}
          disabled={disabled}
          aria-label={t('tg.tap')}
        />
      )}

      {/* the energy tube */}
      {(phase === 'ready' || phase === 'aim') && (
        <div className="tg-tube" aria-hidden="true">
          <span className="tg-band" />
          <span className="tg-fill" />
          <span className="tg-level" />
        </div>
      )}

      {/* the vault, its lock ring and what happens to it */}
      <div className="tg-vault" aria-hidden="true">
        <span className="tg-ring" />
        <svg viewBox="0 0 60 60" className="tg-box">
          <rect
            x="8"
            y="10"
            width="44"
            height="42"
            rx="8"
            fill="var(--vault)"
            stroke="#1b1530"
            strokeWidth="3"
          />
          <rect x="8" y="10" width="44" height="12" rx="6" fill="var(--vault-dark)" opacity="0.5" />
          <circle cx="30" cy="34" r="11" fill="#f4f6fa" stroke="#1b1530" strokeWidth="3" />
          <path
            d="M30 26 V42 M22 34 H38"
            stroke="var(--vault-dark)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="30" cy="34" r="3.5" fill="var(--band)" stroke="#1b1530" strokeWidth="1.5" />
          <path d="M15 16 Q20 13 26 14" stroke="#fff" strokeWidth="2.5" fill="none" opacity="0.7" />
        </svg>
        {phase === 'done' && outcome === 'caught' && (
          <span className="tg-stars">
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} style={{ '--a': `${i * 36}deg` } as CSSProperties} />
            ))}
          </span>
        )}
      </div>

      {phase === 'ready' && <p className="tg-hint">{t('tg.start')}</p>}
      {/* for anyone who cannot tap quickly: throw with what is charged so far */}
      {(phase === 'ready' || phase === 'aim') && (
        <button
          type="button"
          className="tg-now"
          disabled={disabled}
          onClick={() => release(view.lock)}
        >
          {t('tg.now')}
        </button>
      )}
      {phase === 'aim' && (
        <p className="tg-hint" aria-live="off">
          {inside ? t('tg.hold') : view.charge < view.center ? t('tg.more') : t('tg.less')}
          <span className="tg-time">{view.timeLeft.toFixed(1)}</span>
        </p>
      )}
      {phase === 'flying' && lock >= 1 && <p className="tg-perfect">{t('tg.perfect')}</p>}
      {phase === 'aim' && view.flash > 0 && (
        <span className="tg-ripple" style={{ opacity: view.flash }} />
      )}
    </div>
  );
}
