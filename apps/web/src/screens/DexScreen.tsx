import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CREATURES_BY_ID, type Element } from '@nyrgo/shared';
import type { Api, Dex, DexCreature, DexEntry } from '../api';
import { cutUrl, spriteUrl } from '../content';
import { Habitat } from '../scenes/Habitat';
import '../scenes/habitat.css';

type Lang = 'es' | 'en';

/** The encyclopedia: every creature, its element, stats, skills and evolution. */
export function DexScreen({ api }: { api: Api }) {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language.startsWith('es') ? 'es' : 'en';
  const [dex, setDex] = useState<Dex | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Element | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  /** The player's own progress; until it loads every entry stays hidden. */
  const [mine, setMine] = useState<Map<string, DexEntry>>(new Map());

  useEffect(() => {
    api
      .dex()
      .then(setDex)
      .catch(() => setFailed(true));
    api
      .myDex()
      .then((r) => setMine(new Map(r.entries.map((e) => [e.creatureId, e]))))
      .catch(() => undefined);
  }, [api]);

  const elements = useMemo(() => new Map(dex?.elements.map((e) => [e.id, e])), [dex]);
  const skills = useMemo(() => new Map(dex?.skills.map((s) => [s.id, s])), [dex]);
  const byId = useMemo(() => new Map(dex?.creatures.map((c) => [c.id, c])), [dex]);

  if (failed) return <p role="alert">{t('offline')}</p>;
  if (!dex) return <p role="status">{t('loading')}</p>;

  const open = openId && mine.has(openId) ? byId.get(openId) : undefined;
  const caughtCount = [...mine.values()].filter((e) => e.caughtCount > 0).length;
  if (open) {
    const el = elements.get(open.element)!;
    const evolvesTo = open.evolution ? byId.get(open.evolution.to) : undefined;
    const evolvesFrom = dex.creatures.find((c) => c.evolution?.to === open.id);
    const max = Math.max(...Object.values(open.stats));
    /** The kinds of map place where it turns up in the wild. */
    const places = CREATURES_BY_ID.get(open.id)?.biomes ?? [];
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
            <img src={open.art} alt={t('artLabel', { name: open.name })} width={384} height={558} />
          </div>
          <p>{open.lore[lang]}</p>
        </section>

        <section className="card stack" aria-labelledby="dex-habitat">
          <h3 id="dex-habitat">{t('habitat.title')}</h3>
          <div className="dex-habitat">
            <Habitat kind={open.element} />
            <span
              className="dex-habitat-sprite"
              style={{ backgroundImage: `url(${spriteUrl(open.id, 'idle')})` }}
              aria-hidden="true"
            />
            <span className="dex-habitat-name">{t(`habitat.${open.element}`)}</span>
          </div>
          <p className="muted">
            {open.wild && places.length > 0
              ? t('habitat.foundIn', {
                  places: places.map((b) => t(`place.${b}`)).join(', '),
                })
              : t('habitat.notWild')}
          </p>
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
            {evolvesFrom &&
              (mine.has(evolvesFrom.id) ? (
                <button type="button" className="link" onClick={() => setOpenId(evolvesFrom.id)}>
                  ← {evolvesFrom.name}
                </button>
              ) : (
                <p className="muted">← {t('unknown')}</p>
              ))}
            {evolvesTo && open.evolution && (
              <p>
                {mine.has(evolvesTo.id) ? (
                  <button type="button" className="link" onClick={() => setOpenId(evolvesTo.id)}>
                    {evolvesTo.name} →
                  </button>
                ) : (
                  <span>{t('unknown')} →</span>
                )}{' '}
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
      <p className="muted">
        {t('dexProgress', { seen: mine.size, caught: caughtCount, total: dex.creatures.length })}
        {' · '}
        {t('dexCount', { count: list.length })}
      </p>
      <ul className="dex-grid">
        {list.map((c) => {
          const entry = mine.get(c.id);
          const number = `#${String(c.dex).padStart(3, '0')}`;
          if (!entry) {
            return (
              <li key={c.id}>
                <div className="dex-card unknown" aria-label={`${number} ${t('unknownCreature')}`}>
                  <span className="pic">
                    <img
                      src={cutUrl(c.id)}
                      alt=""
                      width={112}
                      height={128}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  <span className="muted">{number}</span>
                  <span className="dex-name">{t('unknown')}</span>
                </div>
              </li>
            );
          }
          return (
            <li key={c.id}>
              <button type="button" className="dex-card" onClick={() => setOpenId(c.id)}>
                <span className="pic">
                  <Habitat kind={c.element} />
                  <img
                    src={cutUrl(c.id)}
                    alt=""
                    width={112}
                    height={128}
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                <span className="dex-dot" style={{ background: elements.get(c.element)!.color }} />
                {entry.caughtCount > 0 && (
                  <span className="caught-mark" title={t('caughtMark')}>
                    ✓<span className="sr-only">{t('caughtMark')}</span>
                  </span>
                )}
                <span className="muted">{number}</span>
                <span className="dex-name">{c.name}</span>
                <span className={`rarity rarity-${c.rarity}`}>{t(`rarity.${c.rarity}`)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
