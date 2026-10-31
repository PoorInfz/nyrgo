import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiError,
  type Api,
  type ArenaInfo,
  type ArenaResult,
  type Duel,
  type DuelFight,
  type HubBout,
  type OwnedCreature,
  type TrainingInfo,
  type TrainingResult,
} from '../api';
import { useContent } from '../content';
import { DuelReplay } from '../screens/DuelReplay';

/**
 * What the coach and the arena host offer: training bouts and battles against other players'
 * defenders. The server picks the opponent and fights it out; these panels choose, show and
 * replay.
 */

const TIER_KEYS = ['easy', 'normal', 'hard', 'expert', 'master'] as const;

/** The replay component reads duels; a bout is one from this player's side. */
function asDuel(o: {
  id: string;
  won: boolean | null;
  mine: { creatureId: string; level: number };
  theirs: { creatureId: string; level: number };
  name: string;
  fight: DuelFight;
}): Duel {
  return {
    id: o.id,
    status: 'done',
    mine: true,
    expiresAt: '',
    finishedAt: null,
    friendId: '',
    friendName: o.name,
    winner: o.won === null ? null : o.won ? 'me' : 'friend',
    fromCreatureId: o.mine.creatureId,
    fromLevel: o.mine.level,
    toCreatureId: o.theirs.creatureId,
    toLevel: o.theirs.level,
    fight: o.fight,
  };
}

function useCreatures(api: Api) {
  const [mine, setMine] = useState<OwnedCreature[] | null>(null);
  useEffect(() => {
    let live = true;
    api
      .myCreatures()
      .then((c) => live && setMine(Array.isArray(c?.creatures) ? c.creatures : []))
      .catch(() => live && setMine([]));
    return () => {
      live = false;
    };
  }, [api]);
  return mine;
}

function errorKey(e: unknown) {
  return e instanceof ApiError ? `errors.${e.code}` : 'errors.other';
}

function CreaturePick({
  mine,
  value,
  onChange,
  label,
  name,
}: {
  mine: OwnedCreature[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  name: (id: string) => string;
}) {
  const { t } = useTranslation();
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {mine.map((c) => (
          <option key={c.id} value={c.id}>
            {name(c.creatureId)} {t('levelShort', { level: c.level })}
          </option>
        ))}
      </select>
    </label>
  );
}

function Reward({
  r,
}: {
  r: { hubXp: number; xpCapped: number; leveledUp: boolean; level: number | null };
}) {
  const { t } = useTranslation();
  return (
    <p className="small">
      {r.hubXp > 0 ? t('gym.hubXp', { xp: r.hubXp }) : t('gym.noHubXp')}
      {r.xpCapped > 0 && <> · {t('gym.capped')}</>}
      {r.leveledUp && r.level && <> · {t('gym.levelUp', { level: r.level })}</>}
    </p>
  );
}

export function GymPanel({ api }: { api: Api }) {
  const { t } = useTranslation();
  const { dex } = useContent(api);
  const mine = useCreatures(api);
  const [info, setInfo] = useState<TrainingInfo | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<TrainingResult | null>(null);
  const name = (id: string) => dex?.creatures.find((c) => c.id === id)?.name ?? id;

  useEffect(() => {
    let live = true;
    api
      .hubTraining()
      .then((i) => live && setInfo(i))
      .catch((e) => live && setErr(errorKey(e)));
    return () => {
      live = false;
    };
  }, [api]);
  const chosen = mine?.find((c) => c.id === pick) ?? mine?.[0];

  async function train(tier: number) {
    if (!chosen) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.hubTrain(chosen.id, tier);
      setResult(r);
      setInfo((i) => (i ? { ...i, left: r.left, hubXpToday: i.hubXpToday + r.hubXp } : i));
    } catch (e) {
      setErr(errorKey(e));
    } finally {
      setBusy(false);
    }
  }

  if (!info || !mine) return <p className="muted">{err ? t(err) : t('loading')}</p>;
  if (!mine.length || !chosen) return <p>{t('gym.noCreatures')}</p>;
  return (
    <div className="stack">
      <p className="small">{t('gym.why', { n: info.perDay })}</p>
      <p className="muted small">
        {t('gym.left', { n: info.left, of: info.perDay })} ·{' '}
        {t('gym.xpToday', { xp: info.hubXpToday, cap: info.hubXpPerDay })}
      </p>
      <CreaturePick
        mine={mine}
        value={chosen.id}
        onChange={(id) => {
          setPick(id);
          setResult(null);
        }}
        label={t('gym.creature')}
        name={name}
      />
      <div className="hub-tiers" role="group" aria-label={t('gym.difficulty')}>
        {info.tiers.map((off, i) => (
          <button
            key={i}
            type="button"
            className={i >= 3 ? '' : 'secondary'}
            disabled={busy || info.left <= 0}
            onClick={() => void train(i)}
          >
            <strong>{t(`gym.tier.${TIER_KEYS[i] ?? 'normal'}`)}</strong>
            <span className="small">
              {t('levelShort', { level: Math.max(1, Math.min(50, chosen.level + off)) })}
            </span>
          </button>
        ))}
      </div>
      {info.left <= 0 && <p className="notice">{t('gym.doneToday')}</p>}
      {err && (
        <p className="error" role="alert">
          {t(err)}
        </p>
      )}
      {result && (
        <div className="stack" aria-live="polite">
          <DuelReplay
            dex={dex}
            duel={asDuel({
              id: result.id,
              won: result.won,
              mine: { creatureId: chosen.creatureId, level: chosen.level },
              theirs: result.coach,
              name: t('hub.npc.coach.name'),
              fight: result.fight,
            })}
          />
          <Reward r={result} />
          {result.creature.leveledUp && (
            <p className="small">
              {t('gym.creatureUp', { name: name(chosen.creatureId), level: result.creature.level })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ArenaPanel({ api }: { api: Api }) {
  const { t } = useTranslation();
  const { dex } = useContent(api);
  const mine = useCreatures(api);
  const [tab, setTab] = useState<'fight' | 'board' | 'history'>('fight');
  const [info, setInfo] = useState<ArenaInfo | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ArenaResult | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const name = (id: string) => dex?.creatures.find((c) => c.id === id)?.name ?? id;

  useEffect(() => {
    let live = true;
    api
      .hubArena()
      .then((i) => live && setInfo(i))
      .catch((e) => live && setErr(errorKey(e)));
    return () => {
      live = false;
    };
  }, [api, result]);
  const chosen = mine?.find((c) => c.id === pick) ?? mine?.[0];

  async function fight(mode: 'ranked' | 'practice') {
    if (!chosen) return;
    setBusy(true);
    setErr(null);
    try {
      setResult(await api.hubMatch(chosen.id, mode));
    } catch (e) {
      setErr(errorKey(e));
    } finally {
      setBusy(false);
    }
  }

  async function defender(id: string) {
    try {
      const r = await api.hubDefender(id || null);
      setInfo((i) => (i ? { ...i, defenderId: r.defenderId } : i));
    } catch (e) {
      setErr(errorKey(e));
    }
  }

  if (!info || !mine) return <p className="muted">{err ? t(err) : t('loading')}</p>;
  if (!mine.length || !chosen) return <p>{t('gym.noCreatures')}</p>;
  const bout = (b: HubBout) => (
    <li key={`${b.defended ? 'd' : 'a'}${b.id}`}>
      <button
        type="button"
        className="link"
        aria-expanded={opened === b.id}
        onClick={() => setOpened(opened === b.id ? null : b.id)}
        disabled={!b.fight}
      >
        {b.won === null ? '🤝' : b.won ? '🏆' : '·'}{' '}
        {b.defended
          ? t('arena.defendedAgainst', { name: b.opponentName ?? '?' })
          : b.kind === 'arena_practice'
            ? t('arena.practiceAgainst', { name: b.opponentName ?? t('hub.npc.host.name') })
            : t('arena.rankedAgainst', { name: b.opponentName ?? '?' })}
        {b.ratingAfter != null && b.ratingBefore != null && (
          <span className="muted small">
            {' '}
            ({b.ratingAfter - b.ratingBefore >= 0 ? '+' : ''}
            {b.ratingAfter - b.ratingBefore})
          </span>
        )}
      </button>
      {opened === b.id && b.fight && (
        <DuelReplay
          dex={dex}
          duel={asDuel({
            id: b.id,
            won: b.won,
            mine: { creatureId: b.creatureId, level: b.level },
            theirs: { creatureId: b.opponentCreatureId, level: b.opponentLevel },
            name: b.opponentName ?? t('hub.npc.host.name'),
            fight: b.fight,
          })}
        />
      )}
    </li>
  );

  return (
    <div className="stack">
      <p className="hub-rating">
        <strong>{t('arena.rating', { rating: info.rating })}</strong>{' '}
        <span className="muted small">
          {t('arena.record', { wins: info.wins, losses: info.losses })}
        </span>
      </p>
      <div className="tabs" role="tablist">
        {(['fight', 'board', 'history'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? '' : 'secondary'}
            onClick={() => setTab(k)}
          >
            {t(`arena.tab.${k}`)}
          </button>
        ))}
      </div>

      {tab === 'fight' && (
        <>
          <p className="small">{t('arena.why')}</p>
          <p className="muted small">
            {t('arena.left', { n: info.rankedLeft, of: info.rankedPerDay })} ·{' '}
            {t('gym.xpToday', { xp: info.hubXpToday, cap: info.hubXpPerDay })}
          </p>
          <CreaturePick
            mine={mine}
            value={chosen.id}
            onChange={(id) => {
              setPick(id);
              setResult(null);
            }}
            label={t('arena.fighter')}
            name={name}
          />
          <div className="row">
            <button
              type="button"
              disabled={busy || info.rankedLeft <= 0}
              onClick={() => void fight('ranked')}
            >
              {t('arena.ranked')}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void fight('practice')}
            >
              {t('arena.practice')}
            </button>
          </div>
          {err && (
            <p className="error" role="alert">
              {t(err)}
            </p>
          )}
          {result && (
            <div className="stack" aria-live="polite">
              <DuelReplay
                dex={dex}
                duel={asDuel({
                  id: result.id,
                  won: result.won,
                  mine: { creatureId: chosen.creatureId, level: chosen.level },
                  theirs: result.opponent,
                  name: result.opponent.name ?? t('hub.npc.host.name'),
                  fight: result.fight,
                })}
              />
              {result.ratingAfter !== null && result.ratingBefore !== null && (
                <p className="small">
                  {t('arena.ratingChange', {
                    from: result.ratingBefore,
                    to: result.ratingAfter,
                  })}
                </p>
              )}
              <Reward r={result} />
            </div>
          )}
          <label>
            {t('arena.defender')}
            <select value={info.defenderId ?? ''} onChange={(e) => void defender(e.target.value)}>
              <option value="">{t('arena.defenderAuto')}</option>
              {mine.map((c) => (
                <option key={c.id} value={c.id}>
                  {name(c.creatureId)} {t('levelShort', { level: c.level })}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small">{t('arena.defenderWhy')}</p>
        </>
      )}

      {tab === 'board' &&
        (info.leaderboard.length ? (
          <ol className="hub-board">
            {info.leaderboard.map((l, i) => (
              <li key={i} className={l.me ? 'me' : ''}>
                <span>{l.name}</span>
                <strong>{l.rating}</strong>
                <span className="muted small">
                  {t('arena.record', { wins: l.wins, losses: l.losses })}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">{t('arena.boardEmpty')}</p>
        ))}

      {tab === 'history' &&
        (info.history.length || info.defended.length ? (
          <>
            {info.history.length > 0 && <ul className="hub-history">{info.history.map(bout)}</ul>}
            {info.defended.length > 0 && (
              <>
                <h3>{t('arena.defendedTitle')}</h3>
                <ul className="hub-history">{info.defended.map(bout)}</ul>
              </>
            )}
          </>
        ) : (
          <p className="muted">{t('arena.historyEmpty')}</p>
        ))}
    </div>
  );
}
