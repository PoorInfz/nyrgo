import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Api, LeaderboardBoard, Leaderboard } from '../api';
import { Avatar } from '../avatar/Avatar';

const BOARDS: LeaderboardBoard[] = ['level', 'captures', 'species', 'arena'];

/** The best explorers of your age group: by level, creatures caught, species and arena rating. */
export function Leaderboards({ api }: { api: Api }) {
  const { t } = useTranslation();
  const [by, setBy] = useState<LeaderboardBoard>('level');
  const [data, setData] = useState<Leaderboard | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .leaderboard(by)
      .then((d) => {
        if (!live) return;
        setData(d);
        setErr(false);
      })
      .catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, [api, by]);

  const shown = data?.by === by ? data : null;
  const mineInTop = shown?.top.some((r) => r.me);
  return (
    <section className="card stack" aria-labelledby="lb-title">
      <h2 id="lb-title">{t('lb.title')}</h2>
      <div className="hub-tabs" role="tablist" aria-label={t('lb.title')}>
        {BOARDS.map((b) => (
          <button
            key={b}
            type="button"
            role="tab"
            aria-selected={by === b}
            className={by === b ? '' : 'secondary'}
            onClick={() => setBy(b)}
          >
            {t(`lb.by.${b}`)}
          </button>
        ))}
      </div>
      {err && !shown && <p className="muted">{t('error')}</p>}
      {!shown && !err && <p className="muted">{t('loading')}</p>}
      {shown && (
        <>
          <p className="muted small">
            {shown.me?.rank
              ? t('lb.you', { rank: shown.me.rank, value: shown.me.value })
              : t('lb.notYet')}
            {shown.season && <> · {t('arena.season', { season: shown.season })}</>}
          </p>
          {shown.top.length ? (
            <ol className="lb-list">
              {shown.top.map((r) => (
                <li key={r.id} className={r.me ? 'me' : ''}>
                  <span className={`lb-rank r${r.rank}`}>{r.rank}</span>
                  <span className="lb-av" aria-hidden="true">
                    <Avatar look={r.look} size={34} />
                  </span>
                  <span className="lb-name">
                    <strong>{r.name}</strong>
                    <span className="muted small">{t('levelShort', { level: r.level })}</span>
                  </span>
                  <span className="lb-value">{r.value}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{t('lb.empty')}</p>
          )}
          {!mineInTop && shown.me?.rank && (
            <p className="small">{t('lb.outside', { rank: shown.me.rank })}</p>
          )}
        </>
      )}
    </section>
  );
}
