import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { effectiveness, type BattleEvent } from '@nyrgo/shared';
import {
  ApiError,
  type Api,
  type BattleAction,
  type BattleSide,
  type BattleView,
  type Dex,
} from '../api';
import { fxUrl, spriteUrl } from '../content';

type Lang = 'es' | 'en';

/** One visual effect on a fighter while a turn plays back. */
interface Fx {
  side: 'player' | 'foe';
  kind: 'attack' | 'hit' | 'crit' | 'miss' | 'heal' | 'faint' | 'passive';
  /** Element colour of the move being used or received. */
  color: string;
  /** Element of the move that landed: picks the effect sheet played over the target. */
  element?: string | undefined;
}

/** Playback speed: 0 skips every pause and effect (reduced motion, tests). */
function motion(): number {
  if (import.meta.env.MODE === 'test') return 0;
  return (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) ? 0 : 1;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function newKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function HpBar({ side, label }: { side: BattleSide; label: string }) {
  const pct = Math.round((side.hp / side.maxHp) * 100);
  return (
    <div className="hp" aria-label={label} role="img">
      <span
        className={pct <= 25 ? 'hp-fill low' : pct <= 50 ? 'hp-fill mid' : 'hp-fill'}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * A battle against the wild creature of an encounter. Every action goes to the server, which
 * resolves the turn and answers with what happened; this screen only tells the story.
 */
export function Battle({
  api,
  dex,
  start,
  onEnd,
}: {
  api: Api;
  dex: Dex;
  start: BattleView;
  /** Called with the final state once the battle is over and the player closes it. */
  onEnd: (final: BattleView) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language.startsWith('en') ? 'en' : 'es';
  const [b, setB] = useState(start);
  /** What is on screen: lags behind `b` while a turn plays back event by event. */
  const [shown, setShown] = useState(start);
  const [fx, setFx] = useState<{ seq: number; effect: Fx } | null>(null);
  const speed = useMemo(() => motion(), []);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingKey = useRef<string | null>(null);

  const creature = (id: string) => dex.creatures.find((c) => c.id === id)!;
  const skill = (id: string) => dex.skills.find((s) => s.id === id)!;
  const passiveName = (id: string) =>
    dex.creatures.find((c) => c.passive.id === id)?.passive.name[lang] ?? id;
  const me = creature(b.player.creatureId);
  const foe = creature(b.foe.creatureId);
  const who = (side: 'player' | 'foe') =>
    side === 'player' ? t('battle.yours', { name: me.name }) : t('battle.wild', { name: foe.name });

  function describe(e: BattleEvent): string | null {
    switch (e.type) {
      case 'move':
        return t('battle.move', { who: who(e.side), skill: skill(e.skill).name[lang] });
      case 'miss':
        return t('battle.miss', { who: who(e.side) });
      case 'dodge':
        return t('battle.dodge', { who: who(e.side) });
      case 'hit': {
        const parts = [t('battle.hit', { damage: e.damage })];
        if (e.crit) parts.push(t('battle.crit'));
        if (e.effectiveness > 1) parts.push(t('battle.superEffective'));
        if (e.effectiveness < 1) parts.push(t('battle.notEffective'));
        return parts.join(' ');
      }
      case 'heal':
        return t('battle.heal', { who: who(e.side), amount: e.amount });
      case 'recoil':
        return t('battle.recoil', { who: who(e.side), amount: e.amount });
      case 'tax':
        return t('battle.tax', { who: who(e.side), amount: e.amount });
      case 'survive':
        return t('battle.survive', { who: who(e.side) });
      case 'faint':
        return t('battle.faint', { who: who(e.side) });
      case 'item': {
        const item = dex.items.find((i) => i.id === e.item);
        return t('battle.item', { item: item?.name[lang] ?? e.item });
      }
      case 'flee':
        return t(e.success ? 'battle.fleeOk' : 'battle.fleeFail');
      case 'passive':
        return t('battle.passive', { who: who(e.side), passive: passiveName(e.passive) });
      case 'resist':
        return t('battle.resist', { who: who(e.side), passive: passiveName(e.passive) });
      default:
        return null;
    }
  }

  // Fetch the attack sheets and effects up front so the first turn does not flash.
  useEffect(() => {
    if (!speed) return;
    const urls = [me.id, foe.id].map((id) => spriteUrl(id, 'attack'));
    for (const id of [...b.player.skills, ...b.foe.skills]) {
      const el = dex.skills.find((s) => s.id === id)?.element;
      if (el) urls.push(fxUrl(el));
    }
    for (const url of new Set(urls)) new Image().src = url;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per battle
  }, []);

  // Start-of-battle passives arrive with the first view.
  const [opened] = useState(() => start.events.map(describe).filter((x): x is string => !!x));

  async function act(action: BattleAction) {
    pendingKey.current ??= newKey();
    setBusy(true);
    setError(null);
    try {
      const next = await api.battleTurn(b.id, action, pendingKey.current);
      pendingKey.current = null;
      setB(next);
      await playback(next);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'network')) pendingKey.current = null;
      const code = err instanceof ApiError ? err.code : 'other';
      setError(t(`errors.${code}`, { defaultValue: t('errors.other') }));
    } finally {
      setBusy(false);
    }
  }

  /** Shows the turn's events one by one: effect, HP change and log line together. */
  async function playback(next: BattleView) {
    let hp = { player: shown.player.hp, foe: shown.foe.hp };
    let color = '#ffffff';
    let element: string | undefined;
    let seq = 0;
    const show = (f: Fx | null, ms: number) => {
      setFx(f ? { seq: ++seq, effect: f } : null);
      return speed ? sleep(ms * speed) : Promise.resolve();
    };
    const apply = (side: 'player' | 'foe', value: number) => {
      hp = { ...hp, [side]: value };
      setShown((s) => ({ ...s, [side]: { ...s[side], hp: value } }));
    };
    for (const e of next.events) {
      const line = describe(e);
      if (line) setLog((l) => [...l, line]);
      switch (e.type) {
        case 'move':
          element = skill(e.skill).element;
          color = dex.elements.find((x) => x.id === element)?.color ?? color;
          await show({ side: e.side, kind: 'attack', color }, 380);
          break;
        case 'hit': {
          const target = e.side === 'player' ? 'foe' : 'player';
          await show({ side: target, kind: e.crit ? 'crit' : 'hit', color, element }, 120);
          apply(target, e.hpLeft);
          await sleep(speed * 420);
          break;
        }
        case 'miss':
          await show({ side: e.side === 'player' ? 'foe' : 'player', kind: 'miss', color }, 380);
          break;
        case 'dodge':
          await show({ side: e.side, kind: 'miss', color }, 380);
          break;
        case 'heal':
          apply(e.side, Math.min(next[e.side].maxHp, hp[e.side] + e.amount));
          await show({ side: e.side, kind: 'heal', color: '#4ade80' }, 450);
          break;
        case 'recoil':
        case 'tax':
          apply(e.side, Math.max(0, hp[e.side] - e.amount));
          await show({ side: e.side, kind: 'hit', color: '#f87171' }, 380);
          break;
        case 'faint':
          await show({ side: e.side, kind: 'faint', color }, 650);
          break;
        case 'passive':
        case 'resist':
        case 'survive':
          await show({ side: e.side, kind: 'passive', color: '#fbbf24' }, 350);
          break;
        default:
          await show(null, 150);
      }
    }
    setFx(null);
    setShown(next);
  }

  const patches = Object.entries(b.items).filter(([, n]) => n > 0);
  const lines = [...opened, ...log];

  return (
    <section className="card stack battle" aria-labelledby="battle-title">
      <h2 id="battle-title" className="sr-only">
        {t('battle.title', { name: foe.name })}
      </h2>

      <div className="scene battle-scene">
        <div className="hud foe">
          <p className="hud-name">
            <strong>{foe.name}</strong>
            <span>{t('levelShort', { level: shown.foe.level })}</span>
          </p>
          <div className="hud-hp">
            <b aria-hidden="true">{t('battle.hpTag')}</b>
            <HpBar
              side={shown.foe}
              label={t('battle.hpOf', { who: who('foe'), hp: shown.foe.hp, max: shown.foe.maxHp })}
            />
          </div>
        </div>
        <div className="fighter foe">
          <Sprite
            id={foe.id}
            fx={fx?.effect.side === 'foe' ? fx : null}
            fainted={shown.foe.hp <= 0}
          />
          <span className="platform" aria-hidden="true" />
        </div>
        <div className="fighter mine">
          <Sprite
            id={me.id}
            fx={fx?.effect.side === 'player' ? fx : null}
            fainted={shown.player.hp <= 0}
          />
          <span className="platform" aria-hidden="true" />
        </div>
        <div className="hud mine">
          <p className="hud-name">
            <strong>{me.name}</strong>
            <span>{t('levelShort', { level: shown.player.level })}</span>
          </p>
          <div className="hud-hp">
            <b aria-hidden="true">{t('battle.hpTag')}</b>
            <HpBar
              side={shown.player}
              label={t('battle.hpOf', {
                who: who('player'),
                hp: shown.player.hp,
                max: shown.player.maxHp,
              })}
            />
          </div>
          <span className="hud-num">
            {shown.player.hp} / {shown.player.maxHp}
          </span>
        </div>
      </div>

      <div className="dialog">
        <ol className="battle-log" aria-live="polite" aria-label={t('battle.log')}>
          {lines.length === 0 && <li>{t('battle.prompt', { name: me.name })}</li>}
          {lines.slice(-6).map((line, i) => (
            <li key={lines.length - 6 + i}>{line}</li>
          ))}
        </ol>
      </div>
      {error && <p role="alert">{error}</p>}

      {/* the result shows once the last turn has finished playing */}
      {shown.result ? (
        <div role="status" className={`result result-${b.result === 'win' ? 'caught' : b.result}`}>
          <p>
            <strong>{t(`battle.result.${b.result}`, { name: foe.name })}</strong>
          </p>
          {b.creatureXp && (
            <p>
              {t('battle.creatureXp', { name: me.name, xp: b.creatureXp.xp })}
              {b.creatureXp.leveledUp &&
                ` ${t('battle.creatureLevelUp', { name: me.name, level: b.creatureXp.level })}`}
            </p>
          )}
          {b.reward && <p>{t('rewardLine', { xp: b.reward.xp, gold: b.reward.gold })}</p>}
          {b.reward === null && <p className="muted">{t('battle.capReached')}</p>}
          <button type="button" onClick={() => onEnd(b)}>
            {t('battle.continue')}
          </button>
        </div>
      ) : (
        <>
          <div className="skills" role="group" aria-label={t('skills')}>
            {b.player.skills.map((id) => {
              const s = skill(id);
              const eff = effectiveness(s.element, foe.element);
              const el = dex.elements.find((e) => e.id === s.element)!;
              return (
                <button
                  key={id}
                  type="button"
                  className="skill"
                  disabled={busy}
                  onClick={() => act({ kind: 'skill', skill: id })}
                  style={{ '--el': el.color } as CSSProperties}
                >
                  <span className="skill-name">{s.name[lang]}</span>
                  <span className="skill-meta">
                    {el.name[lang]} · {t('power')} {s.power}
                    {eff > 1 && (
                      <span className="hint-strong">{` · ${t('battle.strongHint')}`}</span>
                    )}
                    {eff < 1 && <span className="hint-weak">{` · ${t('battle.weakHint')}`}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="row">
            {patches.map(([id, n]) => (
              <button
                key={id}
                type="button"
                className="secondary"
                disabled={busy || b.player.hp >= b.player.maxHp}
                onClick={() => act({ kind: 'item', item: id })}
              >
                {t('battle.useItem', {
                  item: dex.items.find((i) => i.id === id)?.name[lang] ?? id,
                  count: n,
                })}
              </button>
            ))}
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => act({ kind: 'flee' })}
            >
              {t('battle.flee')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * A fighter: its sprite sheet (idle loop, or the attack frames while it strikes), the element
 * effect of a move that lands on it, and a glow layer for charge, heal and passives.
 */
export function Sprite({
  id,
  fx,
  fainted,
}: {
  id: string;
  fx: { seq: number; effect: Fx } | null;
  fainted: boolean;
}) {
  const style = {
    '--fx': fx?.effect.color ?? 'transparent',
    '--idle': `url(${spriteUrl(id, 'idle')})`,
    '--attack': `url(${spriteUrl(id, 'attack')})`,
    '--burst': fx?.effect.element ? `url(${fxUrl(fx.effect.element)})` : 'none',
  } as CSSProperties;
  return (
    <div
      className={`sprite${fainted ? ' fainted' : ''}`}
      data-fx={fx?.effect.kind}
      data-creature={id}
      style={style}
      // a new key restarts the CSS animation even when the same effect repeats
      key={fx ? fx.seq : 'idle'}
    >
      <span className="body" aria-hidden="true" />
      <span className="fx-layer" aria-hidden="true" />
      <span className="fx-sheet" aria-hidden="true" />
    </div>
  );
}
