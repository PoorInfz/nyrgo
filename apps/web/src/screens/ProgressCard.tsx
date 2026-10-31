import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Api, HubMe, OwnedCreature } from '../api';
import { useContent } from '../content';

/**
 * Where a player's progress comes from: exploring outdoors and the town. The town counts for at
 * most half; anything beyond waits until the player earns as much outdoors. Also picks the
 * creature that follows them around the town.
 */
export function ProgressCard({ api }: { api: Api }) {
  const { t } = useTranslation();
  const { dex } = useContent(api);
  const [me, setMe] = useState<HubMe | null>(null);
  const [mine, setMine] = useState<OwnedCreature[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([api.hubMe(), api.myCreatures()])
      .then(([h, c]) => {
        // an older API answers without the breakdown: then the card stays hidden
        if (!live || !h?.progress) return;
        setMe(h);
        setMine(Array.isArray(c?.creatures) ? c.creatures : []);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api]);

  if (!me) return null;
  const p = me.progress;
  const pct = (n: number) => (p.nextLevelXp ? Math.min(100, (n / p.nextLevelXp) * 100) : 100);
  const name = (id: string) => dex?.creatures.find((c) => c.id === id)?.name ?? id;

  async function pick(id: string) {
    setSaved(false);
    try {
      await api.hubCompanion(id || null);
      setMe((m) => (m ? { ...m, companionId: id || null } : m));
      setSaved(true);
    } catch {
      // the select keeps the old value on the next load
    }
  }

  return (
    <section className="card stack" aria-labelledby="progress-title">
      <h2 id="progress-title">{t('progress.title')}</h2>
      <p>
        {p.nextLevelXp === null
          ? t('progress.max', { level: p.level })
          : t('progress.next', { level: p.level + 1, xp: p.nextLevelXp - p.xp })}
      </p>
      <div
        className="xp-bar"
        role="img"
        aria-label={t('progress.barLabel', {
          main: p.mainXp,
          hub: p.hubCounted,
          need: p.nextLevelXp ?? p.xp,
        })}
      >
        <span className="xp-main" style={{ width: `${pct(p.mainXp)}%` }} />
        <span className="xp-town" style={{ width: `${pct(p.hubCounted)}%` }} />
      </div>
      <ul className="xp-legend">
        <li>
          <span className="swatch xp-main" aria-hidden="true" />
          {t('progress.main', { xp: p.mainXp })}
        </li>
        <li>
          <span className="swatch xp-town" aria-hidden="true" />
          {t('progress.hub', { xp: p.hubCounted, share: Math.round(p.hubShare * 100) })}
        </li>
      </ul>
      {p.hubWaiting > 0 && <p className="notice">{t('progress.waiting', { xp: p.hubWaiting })}</p>}
      <p className="muted small">
        {t('progress.rule', { share: Math.round(p.maxHubShare * 100) })}
      </p>

      {mine.length > 0 && (
        <label>
          {t('progress.companion')}
          <select value={me.companionId ?? ''} onChange={(e) => void pick(e.target.value)}>
            <option value="">{t('progress.companionAuto')}</option>
            {mine.map((c) => (
              <option key={c.id} value={c.id}>
                {name(c.creatureId)} {t('levelShort', { level: c.level })}
              </option>
            ))}
          </select>
        </label>
      )}
      {saved && (
        <p className="muted small" role="status">
          {t('progress.companionSaved')}
        </p>
      )}
    </section>
  );
}
