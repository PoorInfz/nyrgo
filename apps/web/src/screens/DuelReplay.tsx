import type { BattleEvent } from '@nyrgo/shared';
import { useTranslation } from 'react-i18next';
import type { Dex, Duel } from '../api';
import { thumbUrl } from '../content';

type Lang = 'es' | 'en';

/**
 * A finished duel, turn by turn, from this player's side. The fight was decided by the server;
 * both players read the same turns.
 */
export function DuelReplay({ duel, dex }: { duel: Duel; dex: Dex | null }) {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language.startsWith('en') ? 'en' : 'es';
  const fight = duel.fight;
  if (!fight || !duel.toCreatureId) return null;

  const name = (id: string) => dex?.creatures.find((c) => c.id === id)?.name ?? id;
  const skillName = (id: string) => dex?.skills.find((s) => s.id === id)?.name[lang] ?? id;
  const passiveName = (id: string) =>
    dex?.creatures.find((c) => c.passive.id === id)?.passive.name[lang] ?? id;

  // the challenger fought as `player`
  const mineSide = duel.mine ? 'player' : 'foe';
  const myCreature = duel.mine ? duel.fromCreatureId : duel.toCreatureId;
  const theirCreature = duel.mine ? duel.toCreatureId : duel.fromCreatureId;
  const myLevel = duel.mine ? duel.fromLevel : duel.toLevel;
  const theirLevel = duel.mine ? duel.toLevel : duel.fromLevel;
  const who = (side: 'player' | 'foe') =>
    side === mineSide
      ? t('battle.yours', { name: name(myCreature) })
      : t('duel.theirs', { name: name(theirCreature), friend: duel.friendName });

  function describe(e: BattleEvent): string | null {
    switch (e.type) {
      case 'move':
        return t('battle.move', { who: who(e.side), skill: skillName(e.skill) });
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
      case 'passive':
        return t('battle.passive', { who: who(e.side), passive: passiveName(e.passive) });
      case 'resist':
        return t('battle.resist', { who: who(e.side), passive: passiveName(e.passive) });
      default:
        return null;
    }
  }

  const outcome =
    duel.winner === 'me'
      ? t('duel.won')
      : duel.winner === 'friend'
        ? t('duel.lost')
        : t('duel.draw');

  return (
    <div className="duel-replay stack">
      <div className="duel-vs">
        <figure>
          <img src={thumbUrl(myCreature)} alt="" width={52} height={52} />
          <figcaption>
            {name(myCreature)} {t('levelShort', { level: myLevel })}
          </figcaption>
        </figure>
        <span aria-hidden="true">VS</span>
        <figure>
          <img src={thumbUrl(theirCreature)} alt="" width={52} height={52} />
          <figcaption>
            {name(theirCreature)} {t('levelShort', { level: theirLevel })}
          </figcaption>
        </figure>
      </div>
      <p className={duel.winner === 'me' ? 'tip-won' : ''}>
        <strong>{outcome}</strong>{' '}
        <span className="muted small">{t('duel.turns', { n: fight.turns.length - 1 })}</span>
      </p>
      <details>
        <summary>{t('duel.replay')}</summary>
        <ol className="duel-log">
          {fight.turns.map((turn) => {
            const lines = turn.events.map(describe).filter((l): l is string => Boolean(l));
            if (lines.length === 0) return null;
            return (
              <li key={turn.turn}>
                <span className="muted small">
                  {turn.turn === 0 ? t('duel.start') : t('duel.turn', { n: turn.turn })}
                </span>{' '}
                {lines.join(' ')}
              </li>
            );
          })}
        </ol>
      </details>
    </div>
  );
}
