import { useRef, useState } from 'react';
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
import { artUrl } from '../content';

type Lang = 'es' | 'en';

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
      setLog((l) => [...l, ...next.events.map(describe).filter((x): x is string => !!x)]);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'network')) pendingKey.current = null;
      const code = err instanceof ApiError ? err.code : 'other';
      setError(t(`errors.${code}`, { defaultValue: t('errors.other') }));
    } finally {
      setBusy(false);
    }
  }

  const patches = Object.entries(b.items).filter(([, n]) => n > 0);
  const lines = [...opened, ...log];

  return (
    <section className="card stack battle" aria-labelledby="battle-title">
      <h2 id="battle-title">{t('battle.title', { name: foe.name })}</h2>

      <div className="fighter foe">
        <div className="fighter-info">
          <strong>{foe.name}</strong>{' '}
          <span className="muted">{t('levelShort', { level: b.foe.level })}</span>
          <HpBar
            side={b.foe}
            label={t('battle.hpOf', { who: who('foe'), hp: b.foe.hp, max: b.foe.maxHp })}
          />
        </div>
        <img src={artUrl(foe.id)} alt="" width={120} height={120} />
      </div>
      <div className="fighter mine">
        <img src={artUrl(me.id)} alt="" width={120} height={120} />
        <div className="fighter-info">
          <strong>{me.name}</strong>{' '}
          <span className="muted">{t('levelShort', { level: b.player.level })}</span>
          <HpBar
            side={b.player}
            label={t('battle.hpOf', { who: who('player'), hp: b.player.hp, max: b.player.maxHp })}
          />
          <span className="muted small">
            {b.player.hp} / {b.player.maxHp}
          </span>
        </div>
      </div>

      <ol className="battle-log" aria-live="polite" aria-label={t('battle.log')}>
        {lines.slice(-6).map((line, i) => (
          <li key={lines.length - 6 + i}>{line}</li>
        ))}
      </ol>
      {error && <p role="alert">{error}</p>}

      {b.result ? (
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
                  style={{ borderColor: el.color }}
                >
                  <span className="skill-name">{s.name[lang]}</span>
                  <span className="muted small">
                    {el.name[lang]} · {t('power')} {s.power}
                    {eff > 1
                      ? ` · ${t('battle.strongHint')}`
                      : eff < 1
                        ? ` · ${t('battle.weakHint')}`
                        : ''}
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
