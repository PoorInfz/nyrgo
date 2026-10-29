import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CREATURES_BY_ID, evolutionBlock, type Evolution } from '@nyrgo/shared';
import { ApiError, type Api, type OwnedCreature } from '../api';
import { cutUrl, useContent } from '../content';

type Lang = 'es' | 'en';

/** The player's creatures; a new player first picks one of the three starters. */
export function Collection({ api }: { api: Api }) {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language.startsWith('en') ? 'en' : 'es';
  const { dex, failed } = useContent(api);
  const [mine, setMine] = useState<OwnedCreature[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);

  const reload = useCallback(
    () =>
      api
        .myCreatures()
        .then((r) => {
          // the moment the list was loaded: used for "days in your collection"
          setLoadedAt(Date.now());
          setMine(r.creatures);
        })
        .catch(() => setError(true)),
    [api],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  if (failed || error) return <p role="alert">{t('offline')}</p>;
  if (!dex || !mine) return <p role="status">{t('loading')}</p>;

  const byId = new Map(dex.creatures.map((c) => [c.id, c]));
  const elements = new Map(dex.elements.map((e) => [e.id, e]));

  async function heal(id: string) {
    setBusy(true);
    setNotice(null);
    try {
      const healed = await api.heal(id, 'patch');
      setMine((all) => all?.map((m) => (m.id === id ? { ...m, hp: healed.hp } : m)) ?? all);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'other';
      setNotice(t(`errors.${code}`, { defaultValue: t('errors.other') }));
    } finally {
      setBusy(false);
    }
  }

  async function evolve(m: OwnedCreature, from: string, to: string) {
    if (!window.confirm(t('evolveConfirm', { from, to }))) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await api.evolve(m.id);
      setMine((all) => all?.map((x) => (x.id === m.id ? r.creature : x)) ?? all);
      setNotice(t('evolved', { from, to }));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'other';
      setNotice(t(`errors.${code}`, { defaultValue: t('errors.other') }));
    } finally {
      setBusy(false);
    }
  }

  async function pick(id: string, name: string) {
    if (!window.confirm(t('starterConfirm', { name }))) return;
    setBusy(true);
    await api.pickStarter(id).catch(() => undefined);
    await reload();
    setBusy(false);
  }

  if (mine.length === 0) {
    const starters = dex.creatures.filter((c) => c.starter);
    return (
      <section className="stack" aria-labelledby="starter-title">
        <h2 id="starter-title">{t('starterTitle')}</h2>
        <p className="muted">{t('starterWhy')}</p>
        <ul className="plain stack">
          {starters.map((c) => (
            <li key={c.id} className="card starter">
              <img src={c.art} alt="" width={120} height={174} />
              <div className="stack">
                <h3>{c.name}</h3>
                <p>
                  <span className="chip" style={{ background: elements.get(c.element)!.color }}>
                    {elements.get(c.element)!.name[lang]}
                  </span>
                </p>
                <p className="muted">{c.lore[lang]}</p>
                <button type="button" disabled={busy} onClick={() => pick(c.id, c.name)}>
                  {t('pickStarter', { name: c.name })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="stack" aria-labelledby="col-title">
      <h2 id="col-title">{t('collectionTitle')}</h2>
      <p className="muted">{t('collectionCount', { count: mine.length })}</p>
      {notice && <p role="status">{notice}</p>}
      <ul className="dex-grid">
        {mine.map((m) => {
          const def = byId.get(m.creatureId);
          return (
            <li key={m.id}>
              <div className="dex-card owned">
                <span className="pic">
                  <img src={cutUrl(m.creatureId)} alt="" width={112} height={128} />
                </span>
                <span className="dex-name">{def?.name ?? m.creatureId}</span>
                <span className="muted">
                  {t('levelShort', { level: m.level })} · {t(`caughtVia.${m.acquiredVia}`)}
                </span>
                <div className="hp" role="img" aria-label={t('hpLine', { hp: m.hp, max: m.maxHp })}>
                  <span
                    className={m.hp / m.maxHp <= 0.25 ? 'hp-fill low' : 'hp-fill'}
                    style={{ width: `${Math.round((m.hp / m.maxHp) * 100)}%` }}
                  />
                </div>
                <span className="muted small">
                  {t('hpLine', { hp: m.hp, max: m.maxHp })} · {t('stat.atk')} {m.stats.atk} ·{' '}
                  {t('stat.def')} {m.stats.def} · {t('stat.spd')} {m.stats.spd}
                </span>
                {def?.evolution && (
                  <EvolveButton
                    m={m}
                    evo={def.evolution}
                    from={def.name}
                    to={byId.get(def.evolution.to)?.name ?? def.evolution.to}
                    busy={busy}
                    now={loadedAt}
                    onEvolve={evolve}
                  />
                )}
                {m.hp < m.maxHp && (
                  <button
                    type="button"
                    className="secondary small"
                    disabled={busy}
                    onClick={() => heal(m.id)}
                  >
                    {t('healWith', { item: dex.items.find((i) => i.id === 'patch')!.name[lang] })}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EvolveButton({
  m,
  evo,
  from,
  to,
  busy,
  now,
  onEvolve,
}: {
  m: OwnedCreature;
  evo: Evolution;
  from: string;
  to: string;
  busy: boolean;
  now: number;
  onEvolve: (m: OwnedCreature, from: string, to: string) => void;
}) {
  const { t } = useTranslation();
  const heldDays = (now - Date.parse(m.acquiredAt)) / 86_400_000;
  const block = evolutionBlock(CREATURES_BY_ID.get(m.creatureId)!, m.level, heldDays);
  if (block === 'level') {
    return <span className="muted small">{t('evolveAtLevel', { to, level: evo.level })}</span>;
  }
  if (block === 'hold_days') {
    return (
      <span className="muted small">
        {t('evolveAfterDays', { to, days: Math.ceil((evo.holdDays ?? 0) - heldDays) })}
      </span>
    );
  }
  const materials = Object.entries(evo.materials)
    .map(([id, n]) => `${n} ${t(`material.${id}`)}`)
    .join(' · ');
  return (
    <button type="button" className="small" disabled={busy} onClick={() => onEvolve(m, from, to)}>
      {t('evolveTo', { to })}
      <span className="small">
        {' '}
        ({evo.gold} Gold · {materials})
      </span>
    </button>
  );
}
