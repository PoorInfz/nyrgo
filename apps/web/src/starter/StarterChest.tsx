import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { DexCreature } from '../api';
import { sfx, sfxMuted, setSfxMuted } from '../fight/sfx';
import { ChestBase, ChestLid } from './Chest';
import { createSmoke, type Smoke } from './smoke';
import { RARITY_FX, hex6, topRarity } from './rarity';
import './starter.css';

/**
 * The first creature, chosen from a chest: tap it, it shakes and leaks light, the lid blows open
 * in smoke the colours of what is inside (each creature's rarity: green common, blue uncommon,
 * violet rare, pink epic, gold legendary, rainbow mythic; a wisp of its element), three lights
 * fly out and land as cards, and the player picks one. The pick goes to the server only after a
 * second, explicit "yes".
 *
 * Phases: closed → charge → burst → rise → choose (→ focus → sure) → saving → chosen.
 */
type Phase = 'closed' | 'charge' | 'burst' | 'rise' | 'choose' | 'chosen';

interface ElementInfo {
  color: string;
  name: string;
}

export function StarterChest({
  starters,
  element,
  rarityName,
  lore,
  onPick,
  onDone,
  onClose,
}: {
  starters: DexCreature[];
  element: (id: string) => ElementInfo;
  rarityName: (r: DexCreature['rarity']) => string;
  lore: (c: DexCreature) => string;
  /** Saves the pick; resolves false when it failed (the player can try again). */
  onPick: (c: DexCreature) => Promise<boolean>;
  onDone: () => void;
  /** Leaves without choosing (the chest waits in the collection). */
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const reduce = useMemo(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const [phase, setPhase] = useState<Phase>('closed');
  const [focus, setFocus] = useState<number | null>(null);
  const [sure, setSure] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [muted, setMuted] = useState(sfxMuted());
  const [shake, setShake] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const chest = useRef<HTMLDivElement>(null);
  const slots = useRef<(HTMLElement | null)[]>([]);
  const smoke = useRef<Smoke | null>(null);
  const timers = useRef<number[]>([]);
  const stopSteady = useRef<(() => void) | null>(null);

  const colors = useMemo(
    () => starters.map((c) => hex6(element(c.element).color)),
    [starters, element],
  );
  // the smoke takes the colours of what is inside: each creature's rarity
  const rar = useMemo(() => starters.map((c) => RARITY_FX[c.rarity].colors), [starters]);
  const smokeColors = useMemo(() => [...new Set(rar.flat())], [rar]);
  const top = topRarity(starters.map((c) => c.rarity));
  const topFx = RARITY_FX[top];

  const later = useCallback((ms: number, f: () => void) => {
    timers.current.push(window.setTimeout(f, ms));
  }, []);

  // the smoke canvas lives as long as the overlay
  useEffect(() => {
    if (!canvas.current) return;
    smoke.current = createSmoke(canvas.current, reduce);
    const s = smoke.current;
    const all = timers.current;
    return () => {
      s.stop();
      all.forEach((id) => window.clearTimeout(id));
    };
  }, [reduce]);

  // the overlay owns the page while it is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /** Where an element sits on the canvas. */
  const at = (el: HTMLElement | null, fy = 0.5) => {
    const r = root.current?.getBoundingClientRect();
    const b = el?.getBoundingClientRect();
    if (!r || !b) return { x: 0, y: 0 };
    return { x: b.left - r.left + b.width / 2, y: b.top - r.top + b.height * fy };
  };

  // a little smoke curls out of the closed chest
  useEffect(() => {
    if (phase !== 'closed' || !smoke.current) return;
    const id = window.setTimeout(() => {
      const p = at(chest.current, 0.42);
      stopSteady.current = smoke.current?.steady(p.x, p.y, smokeColors) ?? null;
    }, 200);
    return () => {
      window.clearTimeout(id);
      stopSteady.current?.();
    };
  }, [phase, smokeColors]);

  function open() {
    if (phase !== 'closed') return;
    stopSteady.current?.();
    if (reduce) {
      setPhase('choose');
      return;
    }
    setPhase('charge');
    sfx('rumble');
    // three knocks, each harder
    [0, 450, 850].forEach((ms, i) =>
      later(ms, () => {
        setShake(i + 1);
        sfx('knock');
        navigator.vibrate?.(20 + i * 20);
        const p = at(chest.current, 0.42);
        smoke.current?.sparks(p.x, p.y, smokeColors[i % smokeColors.length]!, 8 + i * 8, 0.5);
      }),
    );
    later(1350, burst);
  }

  function burst() {
    setPhase('burst');
    setShake(0);
    sfx('burst');
    navigator.vibrate?.([60, 40, 120]);
    const s = smoke.current;
    const p = at(chest.current, 0.42);
    if (s) {
      s.ring(p.x, p.y, '#ffffff', 1.4);
      for (let i = 0; i < topFx.rings; i++)
        later(120 + i * 140, () =>
          s.ring(p.x, p.y, topFx.colors[i % topFx.colors.length]!, 1 + i * 0.3),
        );
      s.burst(p.x, p.y, smokeColors, topFx.power);
      starters.forEach((c, i) => {
        const fx = RARITY_FX[c.rarity];
        later(80 + i * 90, () => s.sparks(p.x, p.y, fx.colors[0]!, 40 * fx.power, fx.power));
      });
      later(500, () => s.burst(p.x, p.y, [...smokeColors, ...colors], 0.6 * topFx.power));
    }
    later(1500, rise);
  }

  function rise() {
    setPhase('rise');
    const s = smoke.current;
    const from = at(chest.current, 0.3);
    starters.forEach((c, i) => {
      later(i * 260, () => {
        const to = at(slots.current[i] ?? null, 0.45);
        const fx = RARITY_FX[c.rarity];
        s?.plume(from.x, from.y, to.x - from.x, to.y - from.y, fx.colors[0]!, 0.8 * fx.power);
        s?.plume(from.x, from.y, to.x - from.x, to.y - from.y, colors[i]!, 0.4 * fx.power);
        later(420, () => {
          sfx('reveal');
          s?.ring(to.x, to.y, colors[i]!, 0.45);
          s?.sparks(to.x, to.y, fx.colors[0]!, 26 * fx.power, 0.6);
          s?.glow(to.x, to.y, colors[i]!, 110);
        });
      });
    });
    later(260 * starters.length + 700, () => setPhase('choose'));
  }

  function skip() {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    stopSteady.current?.();
    setShake(0);
    setPhase('choose');
  }

  async function confirm(i: number) {
    const c = starters[i]!;
    setSaving(true);
    setFailed(false);
    const ok = await onPick(c);
    setSaving(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setChosen(i);
    setFocus(null);
    setSure(false);
    setPhase('chosen');
    sfx('choose');
    navigator.vibrate?.([40, 30, 40, 30, 160]);
    const s = smoke.current;
    const fx = RARITY_FX[c.rarity];
    // the other two go back into smoke, the chosen one lights up the screen
    starters.forEach((_, j) => {
      if (j === i) return;
      const p = at(slots.current[j] ?? null, 0.45);
      s?.plume(p.x, p.y, 0, -120, rar[j]![0]!, 0.6);
    });
    later(350, () => {
      const r = root.current?.getBoundingClientRect();
      if (!r || !s) return;
      const x = r.width / 2;
      const y = r.height * 0.4;
      s.ring(x, y, '#ffffff', 1.6);
      s.ring(x, y, colors[i]!, 1.2);
      s.burst(x, y, [colors[i]!, ...fx.colors], 0.9);
      s.sparks(x, y, colors[i]!, 90, 1.3);
      s.sparks(x, y, '#ffcf4d', 50, 1);
    });
  }

  // keyboard: Escape steps back, or skips the show
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (sure) setSure(false);
      else if (focus !== null) setFocus(null);
      else if (phase === 'charge' || phase === 'burst' || phase === 'rise') skip();
      else if ((phase === 'closed' || phase === 'choose') && !saving) onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });

  const maxStat = Math.max(
    ...starters.flatMap((c) => [c.stats.hp, c.stats.atk, c.stats.def, c.stats.spd]),
  );
  const shown = phase === 'rise' || phase === 'choose' || phase === 'chosen';
  const f = focus === null ? null : starters[focus]!;

  const ui = (
    <div
      ref={root}
      className={`sc-root sc-${phase}${shake ? ` sc-shake-${shake}` : ''}${reduce ? ' sc-reduce' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sc-title"
      tabIndex={-1}
      style={
        {
          '--top': topFx.colors[0],
          '--c0': rar[0]?.[0],
          '--c1': colors[1] ?? colors[0],
          '--c2': rar[2]?.[0] ?? rar[0]?.[0],
          '--pick': chosen === null ? undefined : colors[chosen],
        } as CSSProperties
      }
    >
      <div className="sc-bg" aria-hidden="true">
        <div className="sc-rays" />
        <div className="sc-stars" />
      </div>
      <div className="sc-flash" aria-hidden="true" />

      <header className="sc-head">
        <h2 id="sc-title">
          {phase === 'chosen' && chosen !== null
            ? t('chest.yours', { name: starters[chosen]!.name })
            : phase === 'choose'
              ? t('chest.choose')
              : t('chest.title')}
        </h2>
        <p className="sc-sub" aria-live="polite">
          {phase === 'closed'
            ? t('chest.tap')
            : phase === 'choose'
              ? t('chest.chooseSub')
              : phase === 'chosen'
                ? t('chest.chosenSub')
                : ' '}
        </p>
      </header>

      {/* the chest */}
      <div
        ref={chest}
        className="sc-chest"
        role={phase === 'closed' ? 'button' : undefined}
        tabIndex={phase === 'closed' ? 0 : -1}
        aria-label={phase === 'closed' ? t('chest.open') : undefined}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
      >
        <div className="sc-halo" aria-hidden="true" />
        <div className="sc-inner" aria-hidden="true" />
        <div className="sc-beam" aria-hidden="true" />
        <div className="sc-lid">
          <ChestLid />
        </div>
        <div className="sc-base">
          <ChestBase />
        </div>
        <div className="sc-leak" aria-hidden="true" />
      </div>

      <canvas ref={canvas} className="sc-canvas" aria-hidden="true" />

      {/* the three creatures */}
      <ul className={`sc-cards${shown ? ' on' : ''}`}>
        {starters.map((c, i) => {
          const el = element(c.element);
          const state =
            phase === 'chosen'
              ? i === chosen
                ? ' picked'
                : ' gone'
              : focus === i
                ? ' focused'
                : '';
          return (
            <li
              key={c.id}
              ref={(n) => {
                slots.current[i] = n;
              }}
              className={`sc-card rar-${c.rarity}${state}`}
              style={
                {
                  '--el': colors[i],
                  '--rar': RARITY_FX[c.rarity].colors[0],
                  '--i': i,
                } as CSSProperties
              }
            >
              <button
                type="button"
                className="sc-card-btn"
                disabled={phase !== 'choose'}
                onClick={() => {
                  setFocus(i);
                  setSure(false);
                  setFailed(false);
                  sfx('reveal');
                }}
                aria-label={`${c.name} · ${el.name} · ${rarityName(c.rarity)}`}
              >
                <span className="sc-card-glow" aria-hidden="true" />
                <img src={c.art} alt="" width={384} height={567} />
                <span className="sc-card-name">{c.name}</span>
                <span className="sc-card-tags">
                  <span className="sc-chip" style={{ background: el.color }}>
                    {el.name}
                  </span>
                </span>
                <span className="sc-rar">{rarityName(c.rarity)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* one creature up close */}
      {f && focus !== null && phase === 'choose' && (
        <div
          className="sc-focus"
          style={{ '--el': colors[focus], '--rar': RARITY_FX[f.rarity].colors[0] } as CSSProperties}
        >
          <div className={`sc-focus-card rar-${f.rarity}`}>
            <img src={f.art} alt="" width={384} height={567} />
            <div className="sc-focus-info">
              <h3>{f.name}</h3>
              <p className="sc-focus-tags">
                <span className="sc-chip" style={{ background: element(f.element).color }}>
                  {element(f.element).name}
                </span>
                <span className="sc-rar">{rarityName(f.rarity)}</span>
              </p>
              <p className="sc-lore">{lore(f)}</p>
            </div>
            <dl className="sc-stats">
              {(['hp', 'atk', 'def', 'spd'] as const).map((k) => (
                <div key={k}>
                  <dt>{t(`stat.${k}`)}</dt>
                  <dd>
                    <span
                      className="sc-bar"
                      style={{ width: `${(f.stats[k] / maxStat) * 100}%` }}
                    />
                    <span className="sc-val">{f.stats[k]}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {failed && (
            <p className="sc-error" role="alert">
              {t('chest.failed')}
            </p>
          )}
          {sure && <p className="sc-sure">{t('chest.sure', { name: f.name })}</p>}
          <div className="sc-actions">
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() => (sure ? setSure(false) : setFocus(null))}
            >
              {t('chest.back')}
            </button>
            {sure ? (
              <button
                type="button"
                className="sc-go"
                disabled={saving}
                onClick={() => void confirm(focus)}
              >
                {saving ? t('loading') : t('chest.yes', { name: f.name })}
              </button>
            ) : (
              <button type="button" className="sc-go" onClick={() => setSure(true)}>
                {t('pickStarter', { name: f.name })}
              </button>
            )}
          </div>
        </div>
      )}

      {phase === 'chosen' && (
        <div className="sc-end">
          <button type="button" className="sc-go" onClick={onDone} autoFocus>
            {t('chest.continue')}
          </button>
        </div>
      )}

      {/* controls */}
      <div className="sc-controls">
        <button
          type="button"
          className="sc-ctl"
          aria-label={muted ? t('cine.unmute') : t('cine.mute')}
          onClick={() => {
            setSfxMuted(!muted);
            setMuted(!muted);
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        {(phase === 'charge' || phase === 'burst' || phase === 'rise') && (
          <button type="button" className="sc-ctl" onClick={skip}>
            {t('cine.skip')}
          </button>
        )}
        {(phase === 'closed' || phase === 'choose') && !saving && (
          <button type="button" className="sc-ctl" aria-label={t('chest.later')} onClick={onClose}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
  return createPortal(ui, document.body);
}
