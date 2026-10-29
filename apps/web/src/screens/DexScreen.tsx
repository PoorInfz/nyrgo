import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Element } from '@nyrgo/shared';
import type { Api, Dex, DexCreature } from '../api';

type Lang = 'es' | 'en';

/** The encyclopedia: every creature, its element, stats, skills and evolution. */
export function DexScreen({ api }: { api: Api }) {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language.startsWith('en') ? 'en' : 'es';
  const [dex, setDex] = useState<Dex | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Element | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api
      .dex()
      .then(setDex)
      .catch(() => setFailed(true));
  }, [api]);

  const elements = useMemo(() => new Map(dex?.elements.map((e) => [e.id, e])), [dex]);
  const skills = useMemo(() => new Map(dex?.skills.map((s) => [s.id, s])), [dex]);
  const byId = useMemo(() => new Map(dex?.creatures.map((c) => [c.id, c])), [dex]);

  if (failed) return <p role="alert">{t('offline')}</p>;
  if (!dex) return <p role="status">{t('loading')}</p>;

  const open = openId ? byId.get(openId) : undefined;
  if (open) {
    const el = elements.get(open.element)!;
    const evolvesTo = open.evolution ? byId.get(open.evolution.to) : undefined;
    const evolvesFrom = dex.creatures.find((c) => c.evolution?.to === open.id);
    const max = Math.max(...Object.values(open.stats));
    return (
      <article className="stack" aria-labelledby="dex-name">
        <button type="button" className="link" onClick={() => setOpenId(null)}>
          ← {t('back')}
        </button>
        <section className="card stack">
          <p className="muted">
            #{String(open.dex).padStart(3, '0')} · {t(`rarity.${open.rarity}`)}
            {open.starter ? ` · ${t('starter')}` : ''}
          </p>
          <h2 id="dex-name" className="name">
            {open.name}
          </h2>
          <p>
            <span className="chip" style={{ background: el.color }}>
              {el.name[lang]}
            </span>
          </p>
          <div className="portrait" style={{ '--el': el.color } as CSSProperties}>
            <img src={open.art} alt={t('artLabel', { name: open.name })} width={256} height={256} />
          </div>
          <p>{open.lore[lang]}</p>
        </section>

        <section className="card stack" aria-labelledby="dex-stats">
          <h3 id="dex-stats">{t('stats')}</h3>
          <dl className="bars">
            {(['hp', 'atk', 'def', 'spd'] as const).map((k) => (
              <div key={k}>
                <dt>{t(`stat.${k}`)}</dt>
                <dd>
                  <span className="bar" style={{ width: `${(open.stats[k] / max) * 100}%` }} />
                  <span className="value">{open.stats[k]}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card stack" aria-labelledby="dex-skills">
          <h3 id="dex-skills">{t('skills')}</h3>
          <ul className="plain">
            {open.skills.map((id) => {
              const s = skills.get(id)!;
              return (
                <li key={id}>
                  <strong>{s.name[lang]}</strong>{' '}
                  <span className="muted">
                    {elements.get(s.element)!.name[lang]} · {t('power')} {s.power} · {t('accuracy')}{' '}
                    {s.accuracy}%
                  </span>
                </li>
              );
            })}
          </ul>
          <p>
            <strong>{open.passive.name[lang]}</strong>: {open.passive.text[lang]}
          </p>
        </section>

        <section className="card stack" aria-labelledby="dex-type">
          <h3 id="dex-type">{t('matchups')}</h3>
          <p>
            {t('strongAgainst')}:{' '}
            {el.strongAgainst.map((x) => elements.get(x)!.name[lang]).join(', ')}
          </p>
          <p>
            {t('weakAgainst')}: {el.weakAgainst.map((x) => elements.get(x)!.name[lang]).join(', ')}
          </p>
        </section>

        {(evolvesFrom || evolvesTo) && (
          <section className="card stack" aria-labelledby="dex-evo">
            <h3 id="dex-evo">{t('evolution')}</h3>
            {evolvesFrom && (
              <button type="button" className="link" onClick={() => setOpenId(evolvesFrom.id)}>
                ← {evolvesFrom.name}
              </button>
            )}
            {evolvesTo && open.evolution && (
              <p>
                <button type="button" className="link" onClick={() => setOpenId(evolvesTo.id)}>
                  {evolvesTo.name} →
                </button>{' '}
                <span className="muted">
                  {open.evolution.level !== null
                    ? t('evolveLevel', { level: open.evolution.level })
                    : t('evolveHold', { days: open.evolution.holdDays })}{' '}
                  · {open.evolution.gold} Gold
                </span>
              </p>
            )}
          </section>
        )}
      </article>
    );
  }

  const list: DexCreature[] =
    filter === 'all' ? dex.creatures : dex.creatures.filter((c) => c.element === filter);

  return (
    <div className="stack">
      <div className="chips" role="group" aria-label={t('filterElement')}>
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          {t('all')}
        </button>
        {dex.elements.map((e) => (
          <button
            key={e.id}
            type="button"
            aria-pressed={filter === e.id}
            onClick={() => setFilter(e.id)}
            style={{ borderColor: e.color }}
          >
            {e.name[lang]}
          </button>
        ))}
      </div>
      <p className="muted">{t('dexCount', { count: list.length })}</p>
      <ul className="dex-grid">
        {list.map((c) => (
          <li key={c.id}>
            <button type="button" className="dex-card" onClick={() => setOpenId(c.id)}>
              <img src={c.art} alt="" width={96} height={96} loading="lazy" decoding="async" />
              <span className="dex-dot" style={{ background: elements.get(c.element)!.color }} />
              <span className="muted">#{String(c.dex).padStart(3, '0')}</span>
              <span className="dex-name">{c.name}</span>
              <span className={`rarity rarity-${c.rarity}`}>{t(`rarity.${c.rarity}`)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
