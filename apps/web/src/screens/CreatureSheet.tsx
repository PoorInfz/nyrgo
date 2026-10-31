import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CREATURES_BY_ID,
  DEFAULT_CONFIG,
  ITEMS,
  STRONG_AGAINST,
  captureChance,
  captureFactor,
  weakAgainst,
  type Element,
} from '@nyrgo/shared';
import type { Api, Dex, NearbyCreature } from '../api';
import { artUrl } from '../content';
import { RARITY_FX } from '../starter/rarity';

type Lang = 'es' | 'en';

/** Vaults in the order they get better. */
const VAULTS = ITEMS.filter((i) => i.effects.captureMultiplier).sort(
  (a, b) => a.effects.captureMultiplier! - b.effects.captureMultiplier!,
);

const pct = (x: number) => `${Math.round(x * 100)} %`;

/**
 * What a creature on the map is, before walking up to it: rarity, element and matchups, level,
 * the chance each vault has of storing it (from a plain throw to a perfect one, with the same
 * formula the server uses), how likely it is to run after a miss, its base stats, whether it is
 * new to the Dex, how far it is and how long it stays.
 */
export function CreatureSheet({
  api,
  dex,
  spawn,
  onCatch,
  onClose,
}: {
  api: Api;
  dex: Dex;
  spawn: NearbyCreature;
  onCatch: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language.startsWith('es') ? 'es' : 'en';
  const def = CREATURES_BY_ID.get(spawn.creatureId);
  const info = dex.creatures.find((c) => c.id === spawn.creatureId);
  const [owned, setOwned] = useState<Record<string, number> | null>(null);
  const [caught, setCaught] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    api
      .inventory()
      .then((r) => live && setOwned(Object.fromEntries(r.items.map((i) => [i.id, i.qty]))))
      .catch(() => undefined);
    api
      .myDex()
      .then(
        (r) =>
          live &&
          setCaught(r.entries.find((e) => e.creatureId === spawn.creatureId)?.caughtCount ?? 0),
      )
      .catch(() => undefined);
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [api, spawn.creatureId]);

  // Escape closes
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  if (!def || !info) return null;
  const cap = DEFAULT_CONFIG.capture;
  const factor = captureFactor(def.captureDifficulty, spawn.level);
  const element = (e: Element) => dex.elements.find((x) => x.id === e);
  const chip = (e: Element) => (
    <span key={e} className="chip" style={{ background: element(e)?.color }}>
      {element(e)?.name[lang] ?? e}
    </span>
  );
  const fx = RARITY_FX[def.rarity];
  const minutesLeft = Math.max(0, Math.round((Date.parse(spawn.expiresAt) - now) / 60_000));
  const maxStat = Math.max(info.stats.hp, info.stats.atk, info.stats.def, info.stats.spd, 1);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className={`creature-sheet rar-${def.rarity}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cs-title"
        onClick={(e) => e.stopPropagation()}
        style={{ '--aura': fx.colors[0], '--el': element(def.element)?.color } as CSSProperties}
      >
        <button type="button" className="cs-close" aria-label={t('sheet.close')} onClick={onClose}>
          ✕
        </button>
        <header className="cs-head">
          <div className="cs-pic">
            <img src={artUrl(def.id)} alt="" width={384} height={567} />
          </div>
          <div className="stack-tight">
            <p className="muted small">#{String(def.dex).padStart(3, '0')}</p>
            <h2 id="cs-title">{info.name}</h2>
            <p className="cs-tags">
              {chip(def.element)}
              <span className="cs-rar">{t(`rarity.${def.rarity}`)}</span>
              <span className="muted">{t('levelShort', { level: spawn.level })}</span>
            </p>
            <p className="cs-dex">
              {caught === null
                ? ' '
                : caught === 0
                  ? t('sheet.new')
                  : t('sheet.caught', { n: caught })}
            </p>
          </div>
        </header>

        <h3>{t('sheet.chance')}</h3>
        <ul className="cs-chances">
          {VAULTS.map((v) => {
            const m = v.effects.captureMultiplier!;
            const low = captureChance(cap, def.rarity, m, factor, 0);
            const high = captureChance(cap, def.rarity, m, factor, 1);
            const have = owned?.[v.id] ?? 0;
            return (
              <li key={v.id} className={owned && have === 0 ? 'none' : undefined}>
                <span className="cs-vault">
                  {v.name[lang]}
                  {owned && <span className="muted"> ×{have}</span>}
                </span>
                <span className="cs-bar" aria-hidden="true">
                  <span style={{ width: `${high * 100}%` }} className="hi" />
                  <span style={{ width: `${low * 100}%` }} className="lo" />
                </span>
                <span className="cs-pct">
                  {low === high ? pct(low) : `${pct(low)}–${pct(high)}`}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="muted small">{t('sheet.chanceNote')}</p>
        <p>{t('sheet.flee', { pct: pct(cap.fleeChance[def.rarity]) })}</p>

        <h3>{t('sheet.matchups')}</h3>
        <p className="cs-tags">
          <span className="muted">{t('sheet.strong')}</span> {STRONG_AGAINST[def.element].map(chip)}
        </p>
        <p className="cs-tags">
          <span className="muted">{t('sheet.weak')}</span> {weakAgainst(def.element).map(chip)}
        </p>

        <h3>{t('sheet.stats')}</h3>
        <dl className="cs-stats">
          {(['hp', 'atk', 'def', 'spd'] as const).map((k) => (
            <div key={k}>
              <dt>{t(`stat.${k}`)}</dt>
              <dd>
                <span style={{ width: `${(info.stats[k] / maxStat) * 100}%` }} />
              </dd>
              <span className="muted small">{info.stats[k]}</span>
            </div>
          ))}
        </dl>
        <p className="muted small">{info.lore[lang]}</p>

        <p className="cs-where">
          {spawn.inRange ? t('sheet.inRange') : t('approach', { m: spawn.distanceM })}
          {' · '}
          {t('sheet.leaves', { min: minutesLeft })}
        </p>
        {spawn.inRange ? (
          <button type="button" onClick={onCatch}>
            {t('catchIt')}
          </button>
        ) : (
          <button type="button" className="secondary" onClick={onClose}>
            {t('sheet.close')}
          </button>
        )}
      </section>
    </div>
  );
}
