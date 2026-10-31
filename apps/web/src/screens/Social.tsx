import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiError,
  type Api,
  type Duel,
  type Friend,
  type FriendCreature,
  type Friends,
  type OwnedCreature,
  type Trade,
} from '../api';
import { useContent } from '../content';
import { DuelReplay } from './DuelReplay';

/**
 * Friends by code (shared in person), face-to-face trades (one creature for one) and friendly
 * duels, both only while the two players stand within 100 m of each other with the map open.
 */
export function Social({ api }: { api: Api }) {
  const { t } = useTranslation();
  const { dex } = useContent(api);
  const names = useMemo(() => new Map(dex?.creatures.map((c) => [c.id, c.name])), [dex]);
  const name = (id: string) => names.get(id) ?? id;
  const [data, setData] = useState<Friends | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [trading, setTrading] = useState<Friend | null>(null);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [challenging, setChallenging] = useState<Friend | null>(null);
  const [mine, setMine] = useState<OwnedCreature[]>([]);
  /** The creature chosen to answer each incoming challenge. */
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const [opened, setOpened] = useState<string | null>(null);

  const fail = useCallback(
    (err: unknown) => {
      const c = err instanceof ApiError ? err.code : 'other';
      setNotice({ ok: false, text: t(`errors.${c}`, { defaultValue: t('errors.other') }) });
    },
    [t],
  );

  const reload = useCallback(async () => {
    try {
      const [f, tr, du] = await Promise.all([api.friends(), api.trades(), api.duels()]);
      setData(f);
      setTrades(tr.trades);
      setDuels(du.duels);
    } catch (err) {
      fail(err);
    }
  }, [api, fail]);

  useEffect(() => {
    // first load now, then again every few seconds: trades come from someone standing next to you
    const first = setTimeout(() => void reload(), 0);
    const timer = setInterval(() => void reload(), 8000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [reload]);

  const loadMine = useCallback(async () => {
    try {
      setMine((await api.myCreatures()).creatures);
    } catch {
      /* the lists below say so when empty */
    }
  }, [api]);
  useEffect(() => {
    const first = setTimeout(() => void loadMine(), 0);
    return () => clearTimeout(first);
  }, [loadMine]);

  async function run(action: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      if (ok) setNotice({ ok: true, text: ok });
      await Promise.all([reload(), loadMine()]);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    void run(async () => {
      const r = await api.addFriend(c);
      setCode('');
      setNotice({
        ok: true,
        text: r.status === 'friends' ? t('social.nowFriends') : t('social.requested'),
      });
    });
  }

  if (!data) {
    return (
      <section className="card">
        <p className="muted" role="status">
          {t('loading')}
        </p>
        {notice && <p role="alert">{notice.text}</p>}
      </section>
    );
  }

  const pending = trades.filter((x) => x.status === 'pending');
  const recent = trades.filter((x) => x.status !== 'pending');

  return (
    <div className="stack">
      {notice && (
        <p role={notice.ok ? 'status' : 'alert'} className={notice.ok ? 'notice' : ''}>
          {notice.text}
        </p>
      )}

      <section className="card stack" aria-labelledby="friends-title">
        <h2 id="friends-title">{t('social.title')}</h2>
        <p className="muted">{t('social.why')}</p>
        <p>
          {t('social.yourCode')} <strong className="friend-code">{data.code}</strong>
        </p>
        <form className="row" onSubmit={add}>
          <label className="sr-only" htmlFor="friend-code">
            {t('social.codeLabel')}
          </label>
          <input
            id="friend-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('social.codeLabel')}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
          />
          <button type="submit" disabled={busy || code.trim().length < 6}>
            {t('social.add')}
          </button>
        </form>

        {data.incoming.length > 0 && (
          <>
            <h3>{t('social.incoming')}</h3>
            <ul className="poi-list social-list">
              {data.incoming.map((f) => (
                <li key={f.id}>
                  <span className="poi-name">
                    {f.name} <span className="muted">{t('levelShort', { level: f.level })}</span>
                  </span>
                  <button
                    type="button"
                    className="small"
                    disabled={busy}
                    onClick={() => run(() => api.acceptFriend(f.id), t('social.nowFriends'))}
                  >
                    {t('social.accept')}
                  </button>
                  <button
                    type="button"
                    className="link small"
                    disabled={busy}
                    onClick={() => run(() => api.removeFriend(f.id))}
                  >
                    {t('social.decline')}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <h3>{t('social.friends', { n: data.friends.length })}</h3>
        {data.friends.length === 0 ? (
          <p className="muted">{t('social.noFriends')}</p>
        ) : (
          <ul className="poi-list social-list">
            {data.friends.map((f) => (
              <li key={f.id}>
                <span className="poi-name">
                  {f.name}{' '}
                  <span className="muted">
                    {t('levelShort', { level: f.level })} ·{' '}
                    {t('social.caught', { n: f.caught ?? 0 })}
                  </span>
                </span>
                <button
                  type="button"
                  className="small"
                  disabled={busy}
                  onClick={() => setTrading(f)}
                >
                  {t('social.trade')}
                </button>
                <button
                  type="button"
                  className="small secondary"
                  disabled={busy || mine.length === 0}
                  onClick={() => setChallenging(f)}
                >
                  {t('duel.challenge')}
                </button>
                <button
                  type="button"
                  className="link small"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t('social.removeConfirm', { name: f.name })))
                      void run(() => api.removeFriend(f.id));
                  }}
                >
                  {t('social.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}

        {data.outgoing.length > 0 && (
          <p className="muted small">
            {t('social.waiting', { names: data.outgoing.map((f) => f.name).join(', ') })}
          </p>
        )}
      </section>

      {trading && (
        <TradeBuilder
          api={api}
          friend={trading}
          name={name}
          busy={busy}
          onCancel={() => setTrading(null)}
          onPropose={(give, want) =>
            run(
              async () => {
                await api.proposeTrade(trading.id, give, want);
                setTrading(null);
              },
              t('social.proposed', { name: trading.name }),
            )
          }
        />
      )}

      {challenging && (
        <ChallengeBuilder
          friend={challenging}
          mine={mine}
          name={name}
          busy={busy}
          onCancel={() => setChallenging(null)}
          onChallenge={(creature) =>
            run(
              async () => {
                await api.challenge(challenging.id, creature);
                setChallenging(null);
              },
              t('duel.sent', { name: challenging.name }),
            )
          }
        />
      )}

      <section className="card stack" aria-labelledby="duels-title">
        <h2 id="duels-title">{t('duel.title')}</h2>
        <p className="muted">{t('duel.why')}</p>
        {duels.length === 0 && <p className="muted">{t('duel.none')}</p>}
        <ul className="plain stack">
          {duels.map((d) => (
            <li key={d.id} className="admin-item">
              {d.status === 'pending' && d.mine && (
                <>
                  <span>
                    {t('duel.waiting', {
                      name: d.friendName,
                      creature: `${name(d.fromCreatureId)} ${t('levelShort', { level: d.fromLevel })}`,
                    })}
                  </span>
                  <button
                    type="button"
                    className="link small"
                    disabled={busy}
                    onClick={() => run(() => api.declineDuel(d.id))}
                  >
                    {t('social.cancel')}
                  </button>
                </>
              )}
              {d.status === 'pending' && !d.mine && (
                <>
                  <span>
                    {t('duel.incoming', {
                      name: d.friendName,
                      creature: `${name(d.fromCreatureId)} ${t('levelShort', { level: d.fromLevel })}`,
                    })}
                  </span>
                  <label>
                    {t('duel.answerWith')}
                    <select
                      value={answer[d.id] ?? ''}
                      onChange={(e) => setAnswer((a) => ({ ...a, [d.id]: e.target.value }))}
                    >
                      <option value="">—</option>
                      {mine.map((c) => (
                        <option key={c.id} value={c.id}>
                          {name(c.creatureId)} {t('levelShort', { level: c.level })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="row tight">
                    <button
                      type="button"
                      className="small"
                      disabled={busy || !answer[d.id]}
                      onClick={() =>
                        run(async () => {
                          await api.acceptDuel(d.id, answer[d.id]!);
                          setOpened(d.id);
                        })
                      }
                    >
                      {t('duel.fight')}
                    </button>
                    <button
                      type="button"
                      className="link small"
                      disabled={busy}
                      onClick={() => run(() => api.declineDuel(d.id))}
                    >
                      {t('social.decline')}
                    </button>
                  </span>
                </>
              )}
              {d.status === 'done' && (
                <>
                  <button
                    type="button"
                    className="link small"
                    aria-expanded={opened === d.id}
                    onClick={() => setOpened(opened === d.id ? null : d.id)}
                  >
                    {t('duel.against', { name: d.friendName })} ·{' '}
                    {d.winner === 'me'
                      ? t('duel.won')
                      : d.winner === 'friend'
                        ? t('duel.lost')
                        : t('duel.draw')}
                  </button>
                  {opened === d.id && <DuelReplay duel={d} dex={dex} watchable />}
                </>
              )}
              {d.status !== 'pending' && d.status !== 'done' && (
                <span className="muted small">
                  {t('duel.against', { name: d.friendName })} · {t(`social.status.${d.status}`)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack" aria-labelledby="trades-title">
        <h2 id="trades-title">{t('social.tradesTitle')}</h2>
        <p className="muted">{t('social.tradesWhy')}</p>
        {pending.length === 0 && <p className="muted">{t('social.noTrades')}</p>}
        <ul className="poi-list social-list">
          {pending.map((x) => (
            <li key={x.id}>
              <span className="poi-name">
                {x.mine
                  ? t('social.youOffer', {
                      name: x.friendName,
                      give: `${name(x.giveCreatureId)} ${t('levelShort', { level: x.giveLevel })}`,
                      want: `${name(x.wantCreatureId)} ${t('levelShort', { level: x.wantLevel })}`,
                    })
                  : t('social.theyOffer', {
                      name: x.friendName,
                      give: `${name(x.giveCreatureId)} ${t('levelShort', { level: x.giveLevel })}`,
                      want: `${name(x.wantCreatureId)} ${t('levelShort', { level: x.wantLevel })}`,
                    })}
              </span>
              {!x.mine && (
                <button
                  type="button"
                  className="small"
                  disabled={busy}
                  onClick={() => run(() => api.acceptTrade(x.id), t('social.traded'))}
                >
                  {t('social.accept')}
                </button>
              )}
              <button
                type="button"
                className="link small"
                disabled={busy}
                onClick={() => run(() => api.declineTrade(x.id))}
              >
                {x.mine ? t('social.cancel') : t('social.decline')}
              </button>
            </li>
          ))}
        </ul>
        {recent.length > 0 && (
          <ul className="token-claims">
            {recent.map((x) => (
              <li key={x.id}>
                {x.friendName}: {name(x.mine ? x.giveCreatureId : x.wantCreatureId)} ⇄{' '}
                {name(x.mine ? x.wantCreatureId : x.giveCreatureId)} ·{' '}
                {t(`social.status.${x.status}`)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Pick one of yours and one of theirs. */
function TradeBuilder({
  api,
  friend,
  name,
  busy,
  onCancel,
  onPropose,
}: {
  api: Api;
  friend: Friend;
  name: (id: string) => string;
  busy: boolean;
  onCancel: () => void;
  onPropose: (give: string, want: string) => void;
}) {
  const { t } = useTranslation();
  const [mine, setMine] = useState<OwnedCreature[] | null>(null);
  const [theirs, setTheirs] = useState<FriendCreature[] | null>(null);
  const [give, setGive] = useState('');
  const [want, setWant] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([api.myCreatures(), api.friendCreatures(friend.id)])
      .then(([a, b]) => {
        if (!live) return;
        // minted creatures live on NEAR now and are traded in the market instead
        setMine(a.creatures.filter((c) => !c.onchain));
        setTheirs(b.creatures);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [api, friend.id]);

  return (
    <section className="card stack" aria-labelledby="trade-title">
      <h2 id="trade-title">{t('social.tradeWith', { name: friend.name })}</h2>
      {failed ? (
        <p role="alert">{t('errors.other')}</p>
      ) : !mine || !theirs ? (
        <p className="muted" role="status">
          {t('loading')}
        </p>
      ) : (
        <>
          <label className="stack">
            <span>{t('social.give')}</span>
            <select value={give} onChange={(e) => setGive(e.target.value)}>
              <option value="">—</option>
              {mine.map((c) => (
                <option key={c.id} value={c.id}>
                  {name(c.creatureId)} {t('levelShort', { level: c.level })}
                </option>
              ))}
            </select>
          </label>
          <label className="stack">
            <span>{t('social.want', { name: friend.name })}</span>
            <select value={want} onChange={(e) => setWant(e.target.value)}>
              <option value="">—</option>
              {theirs.map((c) => (
                <option key={c.id} value={c.id}>
                  {name(c.creatureId)} {t('levelShort', { level: c.level })} · {c.grade}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small">{t('social.tradeHint')}</p>
          <div className="row">
            <button
              type="button"
              disabled={busy || !give || !want}
              onClick={() => onPropose(give, want)}
            >
              {t('social.propose')}
            </button>
            <button type="button" className="link" onClick={onCancel}>
              {t('social.cancel')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** Pick which of your creatures goes to the duel. */
function ChallengeBuilder({
  friend,
  mine,
  name,
  busy,
  onCancel,
  onChallenge,
}: {
  friend: Friend;
  mine: OwnedCreature[];
  name: (id: string) => string;
  busy: boolean;
  onCancel: () => void;
  onChallenge: (creature: string) => void;
}) {
  const { t } = useTranslation();
  const [pick, setPick] = useState('');
  return (
    <section className="card stack" aria-labelledby="challenge-title">
      <h2 id="challenge-title">{t('duel.challengeTitle', { name: friend.name })}</h2>
      <label className="stack">
        <span>{t('duel.yourFighter')}</span>
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">—</option>
          {mine.map((c) => (
            <option key={c.id} value={c.id}>
              {name(c.creatureId)} {t('levelShort', { level: c.level })}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">{t('duel.hint')}</p>
      <div className="row">
        <button type="button" disabled={busy || !pick} onClick={() => onChallenge(pick)}>
          {t('duel.send')}
        </button>
        <button type="button" className="link" onClick={onCancel}>
          {t('social.cancel')}
        </button>
      </div>
    </section>
  );
}
