import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CREATURES_BY_ID, SKILLS, type BattleEvent } from '@nyrgo/shared';
import type { Dex, DuelFight } from '../api';
import { sfx, sfxMuted, setSfxMuted } from './sfx';
import './fight.css';

/**
 * A fight, played as a short vertical film: a VS screen, the two creatures facing each other with
 * health bars, every move, hit, dodge and heal animated in order, a K.O. and the result. The fight
 * itself was decided on the server; this only shows its events.
 */

type Side = 'player' | 'foe';
export interface Fighter {
  creatureId: string;
  level: number;
  /** Who it belongs to (player name, the coach…). */
  owner: string;
}

const SKILL = new Map(SKILLS.map((s) => [s.id, s]));
const ELEMENT_COLOR: Record<string, string> = {
  fire: '#ff6b3d',
  water: '#3fa4ff',
  nature: '#43d36a',
  electric: '#ffd43b',
  ice: '#7fe3ff',
  earth: '#c9934a',
  wind: '#9be7c4',
  light: '#fff2a8',
  shadow: '#a46bff',
  cosmic: '#d07bff',
};

type Step =
  | { k: 'intro'; ms: number }
  | { k: 'fight'; ms: number }
  | { k: 'move'; ms: number; side: Side; skill: string }
  | {
      k: 'hit';
      ms: number;
      side: Side;
      damage: number;
      crit: boolean;
      eff: number;
      element: string;
    }
  | { k: 'miss'; ms: number; side: Side }
  | { k: 'dodge'; ms: number; side: Side }
  | { k: 'heal'; ms: number; side: Side; amount: number }
  | { k: 'hurt'; ms: number; side: Side; amount: number }
  | { k: 'note'; ms: number; side: Side; text: string }
  | { k: 'survive'; ms: number; side: Side }
  | { k: 'faint'; ms: number; side: Side }
  | { k: 'end'; ms: number };

interface Frame {
  step: Step;
  hp: Record<Side, number>;
  turn: number;
}

const other = (s: Side): Side => (s === 'player' ? 'foe' : 'player');

/** Each side's full HP: given by newer fights, worked out from the events for older ones. */
function fullHp(fight: DuelFight): Record<Side, number> {
  if (fight.max) return { ...fight.max };
  const max: Record<Side, number> = { player: fight.hp.player, foe: fight.hp.foe };
  for (const t of fight.turns)
    for (const e of t.events)
      if (e.type === 'hit') {
        const target = other(e.side);
        max[target] = Math.max(max[target], e.hpLeft + e.damage);
      }
  return max;
}

function timeline(
  fight: DuelFight,
  passiveName: (id: string) => string,
): { frames: Frame[]; max: Record<Side, number> } {
  const max = fullHp(fight);
  const hp = { ...max };
  const frames: Frame[] = [];
  const push = (step: Step, turn: number) => frames.push({ step, hp: { ...hp }, turn });
  push({ k: 'intro', ms: 2700 }, 0);
  push({ k: 'fight', ms: 1000 }, 1);
  let lastSkill: Record<Side, string> = { player: '', foe: '' };
  for (const t of fight.turns) {
    for (const e of t.events as BattleEvent[]) {
      switch (e.type) {
        case 'move':
          lastSkill = { ...lastSkill, [e.side]: e.skill };
          push({ k: 'move', ms: 700, side: e.side, skill: e.skill }, t.turn);
          break;
        case 'hit': {
          hp[other(e.side)] = Math.max(0, e.hpLeft);
          const skill = SKILL.get(lastSkill[e.side]);
          push(
            {
              k: 'hit',
              ms: e.crit ? 1100 : 750,
              side: e.side,
              damage: e.damage,
              crit: e.crit,
              eff: e.effectiveness,
              element: skill?.element ?? 'light',
            },
            t.turn,
          );
          break;
        }
        case 'miss':
          push({ k: 'miss', ms: 650, side: e.side }, t.turn);
          break;
        case 'dodge':
          push({ k: 'dodge', ms: 700, side: e.side }, t.turn);
          break;
        case 'heal':
          hp[e.side] = Math.min(max[e.side], hp[e.side] + e.amount);
          push({ k: 'heal', ms: 650, side: e.side, amount: e.amount }, t.turn);
          break;
        case 'recoil':
        case 'tax':
          hp[e.side] = Math.max(0, hp[e.side] - e.amount);
          push({ k: 'hurt', ms: 550, side: e.side, amount: e.amount }, t.turn);
          break;
        case 'passive':
        case 'resist':
          push({ k: 'note', ms: 800, side: e.side, text: passiveName(e.passive) }, t.turn);
          break;
        case 'survive':
          push({ k: 'survive', ms: 900, side: e.side }, t.turn);
          break;
        case 'faint':
          hp[e.side] = 0;
          push({ k: 'faint', ms: 1700, side: e.side }, t.turn);
          break;
        default:
          break;
      }
    }
  }
  push({ k: 'end', ms: 0 }, fight.turns.length);
  return { frames, max };
}

export function FightCinematic({
  fight,
  left,
  right,
  leftSide = 'player',
  dex,
  stage = 'arena',
  title,
  result,
  onClose,
}: {
  fight: DuelFight;
  left: Fighter;
  right: Fighter;
  /** Which side of the fight is shown on the left (the viewer's). */
  leftSide?: Side;
  dex: Dex | null;
  stage?: 'arena' | 'gym' | 'plaza';
  title?: string;
  /** Extra lines under the result (rating, XP…). */
  result?: ReactNode;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('es') ? 'es' : 'en';
  const passiveName = (id: string) =>
    dex?.creatures.find((c) => c.passive.id === id)?.passive.name[lang] ?? id;
  const { frames, max } = useMemo(() => timeline(fight, passiveName), [fight]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [fast, setFast] = useState(false);
  const [muted, setMuted] = useState(sfxMuted());
  const shown = useRef(-1);
  const frame = frames[Math.min(i, frames.length - 1)]!;
  const step = frame.step;
  const sideOf = (s: Side): 'l' | 'r' => (s === leftSide ? 'l' : 'r');
  const fighter = (s: Side) => (s === leftSide ? left : right);
  const nameOf = (s: Side) =>
    CREATURES_BY_ID.get(fighter(s).creatureId)?.name ?? fighter(s).creatureId;
  const won = fight.winner === null ? null : fight.winner === leftSide;

  // advance through the steps
  useEffect(() => {
    if (step.k === 'end') return;
    const ms = step.ms / (fast ? 2.2 : 1);
    const id = window.setTimeout(() => setI((n) => n + 1), ms);
    return () => window.clearTimeout(id);
  }, [i, step, fast]);

  // sound and a buzz for the big moments
  useEffect(() => {
    if (shown.current === i) return;
    shown.current = i;
    if (step.k === 'intro') sfx('vs');
    else if (step.k === 'fight') sfx('fight');
    else if (step.k === 'move') sfx('whoosh');
    else if (step.k === 'hit') {
      sfx(step.crit ? 'crit' : 'hit');
      if (step.crit) navigator.vibrate?.(60);
    } else if (step.k === 'miss' || step.k === 'dodge') sfx('miss');
    else if (step.k === 'heal') sfx('heal');
    else if (step.k === 'faint') {
      sfx('ko');
      navigator.vibrate?.([80, 60, 160]);
    } else if (step.k === 'end') sfx(won ? 'win' : won === false ? 'lose' : 'draw');
  }, [i, step, won]);

  // Escape skips, then closes
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (step.k === 'end') onClose();
        else setI(frames.length - 1);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [step, frames.length, onClose]);

  const who = (s: Side) =>
    s === leftSide ? t('battle.yours', { name: nameOf(s) }) : `${nameOf(s)} (${fighter(s).owner})`;
  function describe(st: Step): string {
    switch (st.k) {
      case 'move':
        return t('battle.move', {
          who: who(st.side),
          skill: SKILL.get(st.skill)?.name[lang] ?? st.skill,
        });
      case 'hit':
        return [
          t('battle.hit', { damage: st.damage }),
          st.crit ? t('battle.crit') : '',
          st.eff > 1 ? t('battle.superEffective') : st.eff < 1 ? t('battle.notEffective') : '',
        ]
          .filter(Boolean)
          .join(' ');
      case 'miss':
        return t('battle.miss', { who: who(st.side) });
      case 'dodge':
        return t('battle.dodge', { who: who(st.side) });
      case 'heal':
        return t('battle.heal', { who: who(st.side), amount: st.amount });
      case 'hurt':
        return t('battle.recoil', { who: who(st.side), amount: st.amount });
      case 'note':
        return t('battle.passive', { who: who(st.side), passive: st.text });
      case 'survive':
        return t('battle.survive', { who: who(st.side) });
      case 'faint':
        return t('battle.faint', { who: who(st.side) });
      default:
        return '';
    }
  }

  const pct = (s: Side) => (max[s] ? (frame.hp[s] / max[s]) * 100 : 0);
  const el = (s: Side) => CREATURES_BY_ID.get(fighter(s).creatureId)?.element ?? 'light';
  const target = step.k === 'hit' ? other(step.side) : null;

  function cls(s: Side) {
    const c = ['ft-fighter', `ft-${sideOf(s)}`];
    if (step.k === 'move' && step.side === s) c.push('ft-lunge');
    if (step.k === 'hit' && target === s) c.push(step.crit ? 'ft-hurt-big' : 'ft-hurt');
    if (step.k === 'dodge' && step.side === s) c.push('ft-dodge');
    if (step.k === 'heal' && step.side === s) c.push('ft-heal');
    if (step.k === 'hurt' && step.side === s) c.push('ft-hurt');
    if ((step.k === 'faint' && step.side === s) || (step.k === 'end' && frame.hp[s] <= 0))
      c.push(step.k === 'faint' ? 'ft-faint' : 'ft-down');
    return c.join(' ');
  }
  const sheet = (s: Side) =>
    step.k === 'move' && step.side === s
      ? `url(/sprites/${fighter(s).creatureId}-attack.webp)`
      : `url(/sprites/${fighter(s).creatureId}-idle.webp)`;
  const frames6 = (s: Side) => (step.k === 'move' && step.side === s ? 'ft-attack' : 'ft-idle');

  const ui = (
    <div
      className={`ft-root ft-stage-${stage}${step.k === 'hit' && step.crit ? ' ft-shake' : ''}${step.k === 'faint' ? ' ft-slowmo' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? t('cine.title')}
      style={
        {
          '--cl': ELEMENT_COLOR[el(leftSide)],
          '--cr': ELEMENT_COLOR[el(other(leftSide))],
        } as React.CSSProperties
      }
    >
      <div className="ft-bg" />

      {/* health bars, Street Fighter style */}
      <header className="ft-hud">
        {(['l', 'r'] as const).map((pos) => {
          const s: Side = pos === 'l' ? leftSide : other(leftSide);
          return (
            <div key={pos} className={`ft-bar ft-bar-${pos}`}>
              <div className="ft-bar-track">
                <i className="ft-bar-lag" style={{ width: `${pct(s)}%` }} />
                <i className="ft-bar-hp" style={{ width: `${pct(s)}%` }} />
              </div>
              <div className="ft-bar-name">
                <strong>{nameOf(s)}</strong>{' '}
                <span>{t('levelShort', { level: fighter(s).level })}</span>
              </div>
              <div className="ft-bar-owner">
                {fighter(s).owner} ·{' '}
                <span className="ft-bar-hpnum">
                  {frame.hp[s]}/{max[s]}
                </span>
              </div>
            </div>
          );
        })}
        <div className="ft-turn" aria-live="off">
          {step.k === 'intro' ? '—' : Math.max(1, frame.turn)}
        </div>
      </header>

      {/* the two creatures */}
      <div className="ft-arena">
        {(['player', 'foe'] as const).map((s) => (
          <div key={s} className={cls(s)}>
            <div className="ft-shadow" />
            <div
              key={`${i}-${s}`}
              className={`ft-sprite ${frames6(s)}`}
              style={{ backgroundImage: sheet(s) }}
            />
            {step.k === 'hit' && target === s && (
              <div
                key={`fx-${i}`}
                className="ft-fx"
                style={{ backgroundImage: `url(/fx/${step.element}.webp)` }}
              />
            )}
            {step.k === 'hit' && target === s && (
              <div key={`n-${i}`} className={`ft-num${step.crit ? ' crit' : ''}`}>
                -{step.damage}
              </div>
            )}
            {step.k === 'heal' && step.side === s && (
              <div key={`h-${i}`} className="ft-num heal">
                +{step.amount}
              </div>
            )}
            {step.k === 'hurt' && step.side === s && (
              <div key={`r-${i}`} className="ft-num">
                -{step.amount}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* call-outs */}
      {step.k === 'move' && (
        <div key={`m-${i}`} className={`ft-callout ft-callout-${sideOf(step.side)}`}>
          {SKILL.get(step.skill)?.name[lang] ?? step.skill}
        </div>
      )}
      {step.k === 'note' && (
        <div key={`p-${i}`} className={`ft-callout small ft-callout-${sideOf(step.side)}`}>
          ✦ {step.text}
        </div>
      )}
      {step.k === 'hit' && (step.crit || step.eff !== 1) && (
        <div key={`e-${i}`} className="ft-banner">
          {step.crit ? t('cine.critical') : step.eff > 1 ? t('cine.super') : t('cine.weak')}
        </div>
      )}
      {(step.k === 'miss' || step.k === 'dodge') && (
        <div key={`d-${i}`} className="ft-banner">
          {step.k === 'miss' ? t('cine.miss') : t('cine.dodge')}
        </div>
      )}
      {step.k === 'survive' && (
        <div key={`s-${i}`} className="ft-banner">
          {t('cine.holds', { name: nameOf(step.side) })}
        </div>
      )}
      {step.k === 'fight' && (
        <div key="fight" className="ft-slam">
          <small>{t('cine.round')}</small>
          {t('cine.go')}
        </div>
      )}
      {step.k === 'faint' && (
        <div key="ko" className="ft-slam ft-ko">
          K.O.
        </div>
      )}

      {/* VS screen */}
      {step.k === 'intro' && (
        <div className="ft-vs">
          <div className="ft-vs-half ft-vs-l">
            <img src={`/creatures/${left.creatureId}.webp`} alt="" />
            <div className="ft-vs-name">
              <strong>{CREATURES_BY_ID.get(left.creatureId)?.name}</strong>
              <span>
                {left.owner} · {t('levelShort', { level: left.level })}
              </span>
            </div>
          </div>
          <div className="ft-vs-half ft-vs-r">
            <img src={`/creatures/${right.creatureId}.webp`} alt="" />
            <div className="ft-vs-name">
              <strong>{CREATURES_BY_ID.get(right.creatureId)?.name}</strong>
              <span>
                {right.owner} · {t('levelShort', { level: right.level })}
              </span>
            </div>
          </div>
          <div className="ft-vs-mark">VS</div>
          {title && <div className="ft-vs-title">{title}</div>}
        </div>
      )}

      {/* result */}
      {step.k === 'end' && (
        <div className={`ft-result ${won ? 'win' : won === false ? 'lose' : 'draw'}`}>
          <div className="ft-result-word">
            {won ? t('cine.win') : won === false ? t('cine.lose') : t('cine.draw')}
          </div>
          <p className="ft-result-sub">{t('cine.turns', { n: fight.turns.length - 1 })}</p>
          {result && <div className="ft-result-extra">{result}</div>}
          <div className="ft-result-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setI(0);
                shown.current = -1;
              }}
            >
              {t('cine.replay')}
            </button>
            <button type="button" onClick={onClose}>
              {t('cine.continue')}
            </button>
          </div>
        </div>
      )}

      {/* what happened, in words */}
      {step.k !== 'intro' && step.k !== 'end' && step.k !== 'fight' && (
        <p className="ft-log" aria-live="polite">
          {describe(step)}
        </p>
      )}

      {/* controls */}
      {step.k !== 'end' && (
        <div className="ft-controls">
          <button
            type="button"
            className="ft-ctl"
            aria-label={muted ? t('cine.unmute') : t('cine.mute')}
            onClick={() => {
              setSfxMuted(!muted);
              setMuted(!muted);
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            type="button"
            className={`ft-ctl${fast ? ' on' : ''}`}
            aria-pressed={fast}
            onClick={() => setFast((f) => !f)}
          >
            ×2
          </button>
          <button type="button" className="ft-ctl" onClick={() => setI(frames.length - 1)}>
            {t('cine.skip')}
          </button>
        </div>
      )}
    </div>
  );
  return createPortal(ui, document.body);
}
