import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiError,
  type Achievement,
  type Api,
  type HubQuest,
  type OwnedCreature,
  type SeasonsInfo,
  type TournamentInfo,
} from '../api';
import { useContent } from '../content';

/**
 * The notice board (Ivy's daily quests and the town's achievements) and the arena's weekly
 * tournament and seasons. Progress is counted by the server from what players actually did.
 */

const errorKey = (e: unknown) => (e instanceof ApiError ? `errors.${e.code}` : 'errors.other');

export function BoardPanel({ api }: { api: Api }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'quests' | 'achievements'>('quests');
  const [quests, setQuests] = useState<HubQuest[] | null>(null);
  const [ach, setAch] = useState<Achievement[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([api.hubQuests(), api.hubAchievements()])
      .then(([q, a]) => {
        if (!live) return;
        setQuests(q.quests);
        setAch(a.achievements);
      })
      .catch((e) => live && setMsg({ ok: false, text: t(errorKey(e)) }));
    return () => {
      live = false;
    };
  }, [api, t]);

  async function claim(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.hubClaimQuest(id);
      setQuests(r.quests);
      setMsg({ ok: true, text: t('board.claimed', { xp: r.reward.xp, gold: r.reward.gold }) });
    } catch (e) {
      setMsg({ ok: false, text: t(errorKey(e)) });
    } finally {
      setBusy(false);
    }
  }

  if (!quests || !ach) return <p className="muted">{msg ? msg.text : t('loading')}</p>;
  return (
    <div className="stack">
      <div className="hub-tabs" role="tablist">
        {(['quests', 'achievements'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? '' : 'secondary'}
            onClick={() => setTab(k)}
          >
            {t(`board.tab.${k}`)}
          </button>
        ))}
      </div>
      {msg && (
        <p className={msg.ok ? 'notice' : 'error'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      {tab === 'quests' && (
        <>
          <p className="small">{t('board.why')}</p>
          <ul className="hub-list">
            {quests.map((q) => (
              <li key={q.id}>
                <span className="stack-tight">
                  <strong>{t(`board.quest.${q.kind}`, { n: q.target })}</strong>
                  <span className="muted small">
                    {q.progress}/{q.target} · {t('board.reward', { xp: q.xp, gold: q.gold })}
                  </span>
                </span>
                {q.claimed ? (
                  <span className="muted small">✓</span>
                ) : (
                  <button
                    type="button"
                    className="small"
                    disabled={busy || !q.completed}
                    onClick={() => void claim(q.id)}
                  >
                    {t('board.claim')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {tab === 'achievements' && (
        <ul className="hub-achievements">
          {ach.map((a) => (
            <li key={a.id} className={a.done ? 'done' : ''}>
              <span aria-hidden="true">{a.done ? '🏅' : '🔒'}</span>
              <span>
                <strong>{t(`board.ach.${a.id}.name`)}</strong>
                <span className="muted small"> {t(`board.ach.${a.id}.text`, { n: a.goal })}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TournamentTab({ api, mine }: { api: Api; mine: OwnedCreature[] }) {
  const { t, i18n } = useTranslation();
  const { dex } = useContent(api);
  const [info, setInfo] = useState<TournamentInfo | null>(null);
  const [pick, setPick] = useState(mine[0]?.id ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const name = (id: string) => dex?.creatures.find((c) => c.id === id)?.name ?? id;

  useEffect(() => {
    let live = true;
    api
      .hubTournament()
      .then((i) => live && setInfo(i))
      .catch((e) => live && setErr(errorKey(e)));
    return () => {
      live = false;
    };
  }, [api, version]);

  async function act(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      setVersion((v) => v + 1);
    } catch (e) {
      setErr(errorKey(e));
    }
  }

  if (!info) return <p className="muted">{err ? t(err) : t('loading')}</p>;
  const when = new Date(info.current.startsAt).toLocaleString(i18n.language, {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const entered = info.current.myCreature;
  return (
    <div className="stack">
      <p className="small">
        {t('tournament.why', {
          when,
          min: info.current.min,
          first: info.prizes[0],
          second: info.prizes[1],
          third: info.prizes[2],
        })}
      </p>
      <p className="muted small">
        {t('tournament.entrants', { n: info.current.entrants, max: info.current.max })}
      </p>
      <label>
        {t('arena.fighter')}
        <select value={entered ?? pick} onChange={(e) => setPick(e.target.value)}>
          {mine.map((c) => (
            <option key={c.id} value={c.id}>
              {name(c.creatureId)} {t('levelShort', { level: c.level })}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <button
          type="button"
          onClick={() => void act(() => api.hubJoinTournament(pick || entered!))}
        >
          {entered ? t('tournament.change') : t('tournament.join')}
        </button>
        {entered && (
          <button
            type="button"
            className="secondary"
            onClick={() => void act(() => api.hubLeaveTournament())}
          >
            {t('tournament.leave')}
          </button>
        )}
      </div>
      {entered && <p className="notice">{t('tournament.in', { when })}</p>}
      {err && (
        <p className="error" role="alert">
          {t(err)}
        </p>
      )}
      {info.last && (
        <details>
          <summary>
            {t('tournament.last', { name: info.last.champion ?? '?' })}
            {info.last.entered &&
              (info.last.myPlace
                ? ` · ${t('tournament.myPlace', { place: info.last.myPlace, prize: info.last.myPrize })}`
                : ` · ${t('tournament.out')}`)}
          </summary>
          <ol className="hub-bracket">
            {info.last.rounds.map((round, i) => (
              <li key={i}>
                <strong className="small">
                  {i === info.last!.rounds.length - 1
                    ? t('tournament.final')
                    : t('tournament.round', { n: i + 1 })}
                </strong>
                <ul>
                  {round.map((m, j) => (
                    <li key={j} className="small">
                      <span className={m.winner && m.winner === m.a ? 'won' : ''}>
                        {m.a ?? '—'}
                      </span>
                      {' vs '}
                      <span className={m.winner && m.winner === m.b ? 'won' : ''}>
                        {m.b ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

export function SeasonsList({ api }: { api: Api }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<SeasonsInfo | null>(null);
  useEffect(() => {
    let live = true;
    api
      .hubSeasons()
      .then((s) => live && setInfo(s))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api]);
  if (!info || !info.past.length) return null;
  return (
    <>
      <h3>{t('arena.pastSeasons')}</h3>
      <ul className="hub-list">
        {info.past.map((s) => (
          <li key={s.season}>
            <span>{s.season}</span>
            <span className="muted small">
              #{s.rank} · {s.rating} · {t('arena.record', { wins: s.wins, losses: s.losses })}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
