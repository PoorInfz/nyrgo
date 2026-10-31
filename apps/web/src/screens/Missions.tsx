import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type Api, type Mission } from '../api';

type Lang = 'es' | 'en';

/** Today's three missions with progress; a completed one can be claimed for its reward. */
export function Missions({ api, refresh = 0 }: { api: Api; refresh?: number }) {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language.startsWith('es') ? 'es' : 'en';
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .missions()
      .then((r) => live && setMissions(r.missions))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, refresh]);

  if (!missions) return null;

  async function claim(id: string) {
    setBusy(true);
    try {
      const r = await api.claimMission(id);
      setMissions(r.missions);
      setMessage(t('rewardLine', { xp: r.reward.xp, gold: r.reward.gold }));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'other';
      setMessage(t(`errors.${code}`, { defaultValue: t('errors.other') }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="missions-title">
      <h2 id="missions-title">{t('missions.title')}</h2>
      <ul className="plain stack">
        {missions.map((m) => (
          <li key={m.id} className="mission">
            <span className={m.rewarded ? 'muted' : ''}>{m.name[lang]}</span>
            <span className="muted small">
              {m.progress} / {m.target}
            </span>
            <div
              className="hp"
              role="img"
              aria-label={t('missions.progress', { progress: m.progress, target: m.target })}
            >
              <span className="hp-fill" style={{ width: `${(m.progress / m.target) * 100}%` }} />
            </div>
            {m.completed && !m.rewarded && (
              <button type="button" className="small" disabled={busy} onClick={() => claim(m.id)}>
                {t('missions.claim')}
              </button>
            )}
            {m.rewarded && <span className="muted small">{t('missions.done')}</span>}
          </li>
        ))}
      </ul>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
