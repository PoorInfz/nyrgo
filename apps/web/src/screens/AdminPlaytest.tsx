import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

/** What GET /admin/v1/metrics returns. */
export interface Metrics {
  days: number;
  totals: { players: number; registered: number; adults: number; today: number; week: number };
  daily: {
    day: string;
    active: number;
    new: number;
    encounters: number;
    throws: number;
    catches: number;
    battles: number;
    town: number;
    feedback: number;
  }[];
  cohorts: { day: string; size: number; d1: number | null; d3: number | null; d7: number | null }[];
  funnel: {
    joined: number;
    starter: number;
    encounter: number;
    threw: number;
    caught: number;
    returned: number;
    week: number;
  };
  throws: {
    throws: number;
    avg_skill: number | null;
    perfect: number;
    b0: number;
    b1: number;
    b2: number;
    b3: number;
    b4: number;
    catch_rate: number | null;
    byRarity: { rarity: string; throws: number; catch_rate: number }[];
  };
  perDay: { player_days: number; catches_per_day: number | null; days_per_player: number | null };
  feedback: { open: number; bugs: number; ideas: number };
}

export interface FeedbackItem {
  id: number;
  category: 'bug' | 'idea' | 'fun' | 'other';
  body: string;
  screen: string | null;
  build: string | null;
  agent: string | null;
  lang: string | null;
  status: 'open' | 'done';
  note: string | null;
  createdAt: string;
  player: string;
  level: number;
  daysPlayed: number;
}

type Call = <T>(method: string, path: string, body?: unknown) => Promise<T>;

const RANGES = [7, 14, 30, 90] as const;
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

/** One series of daily bars, with the value on hover (an SVG title) and on the last bar. */
function Bars({ data, label }: { data: { day: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / data.length;
  return (
    <figure className="pt-chart">
      <figcaption>{label}</figcaption>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={label}>
        <line x1="0" y1="40" x2="100" y2="40" className="pt-axis" />
        {data.map((d, i) => {
          const h = (d.value / max) * 36;
          return (
            <g key={d.day}>
              <rect
                x={i * w + w * 0.15}
                y={40 - h}
                width={w * 0.7}
                height={Math.max(h, d.value ? 0.6 : 0)}
                rx="0.6"
                className="pt-bar"
              />
              {/* the hover target is the whole column */}
              <rect x={i * w} y="0" width={w} height="40" fill="transparent">
                <title>{`${d.day}: ${d.value}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="pt-chart-axis">
        <span>{data[0]?.day.slice(5)}</span>
        <span>
          {data.at(-1)?.day.slice(5)} · <strong>{data.at(-1)?.value ?? 0}</strong>
        </span>
      </div>
    </figure>
  );
}

const pct = (n: number, of: number) => (of ? Math.round((100 * n) / of) : 0);

/**
 * The playtest view of the admin panel: how many play and come back, where new players stop,
 * how the capture mini-game goes, and the comments players send from the game.
 */
export function AdminPlaytest({ call }: { call: Call }) {
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState<number>(14);
  const [m, setM] = useState<Metrics | null>(null);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [show, setShow] = useState<'open' | 'done'>('open');
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [metrics, fb] = await Promise.all([
      call<Metrics>('GET', `/admin/v1/metrics?days=${days}`),
      call<{ feedback: FeedbackItem[] }>('GET', `/admin/v1/feedback?status=${show}`),
    ]);
    setM(metrics);
    setItems(fb.feedback);
  }, [call, days, show]);

  useEffect(() => {
    let live = true;
    void Promise.resolve()
      .then(load)
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [load]);

  async function close(id: number) {
    setError(null);
    try {
      await call('POST', `/admin/v1/feedback/${id}/close`, { note: notes[id] ?? '' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!m) return error ? <p role="alert">{error}</p> : <p role="status">{t('loading')}</p>;
  const f = m.funnel;
  const steps: [string, number][] = [
    ['joined', f.joined],
    ['starter', f.starter],
    ['encounter', f.encounter],
    ['threw', f.threw],
    ['caught', f.caught],
    ['returned', f.returned],
    ['week', f.week],
  ];
  const buckets = [m.throws.b0, m.throws.b1, m.throws.b2, m.throws.b3, m.throws.b4];
  const bmax = Math.max(1, ...buckets);
  const when = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <section className="card stack playtest" aria-labelledby="pt-title">
      <h3 id="pt-title">{t('admin.pt.title')}</h3>
      <div className="chips" role="group" aria-label={t('admin.pt.range')}>
        {RANGES.map((d) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
            {t('admin.pt.days', { n: d })}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}

      <div className="pt-tiles">
        {(
          [
            ['players', m.totals.players],
            ['today', m.totals.today],
            ['week', m.totals.week],
            ['daysPerPlayer', m.perDay.days_per_player ?? 0],
            ['catchesPerDay', m.perDay.catches_per_day ?? 0],
            ['openComments', m.feedback.open],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="pt-tile">
            <span className="pt-num">{v}</span>
            <span className="muted small">{t(`admin.pt.${k}`)}</span>
          </div>
        ))}
      </div>

      <Bars
        data={m.daily.map((d) => ({ day: d.day, value: d.active }))}
        label={t('admin.pt.activeDaily')}
      />
      <Bars
        data={m.daily.map((d) => ({ day: d.day, value: d.new }))}
        label={t('admin.pt.newDaily')}
      />
      <Bars
        data={m.daily.map((d) => ({ day: d.day, value: d.catches }))}
        label={t('admin.pt.catchesDaily')}
      />

      <h4>{t('admin.pt.retention')}</h4>
      {m.cohorts.length === 0 ? (
        <p className="muted">{t('admin.pt.noData')}</p>
      ) : (
        <table className="pt-table">
          <thead>
            <tr>
              <th scope="col">{t('admin.pt.cohort')}</th>
              <th scope="col">{t('admin.pt.size')}</th>
              <th scope="col">D1</th>
              <th scope="col">D3</th>
              <th scope="col">D7</th>
            </tr>
          </thead>
          <tbody>
            {m.cohorts.map((c) => (
              <tr key={c.day}>
                <th scope="row">{c.day.slice(5)}</th>
                <td>{c.size}</td>
                {[c.d1, c.d3, c.d7].map((v, i) => (
                  <td key={i} className="pt-ret" style={{ '--v': v ?? 0 } as CSSProperties}>
                    {v === null ? '·' : `${v} %`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4>{t('admin.pt.funnel', { n: m.days })}</h4>
      <ol className="pt-funnel">
        {steps.map(([k, v]) => (
          <li key={k}>
            <span className="pt-step">{t(`admin.pt.step.${k}`)}</span>
            <span className="pt-track">
              <span style={{ width: `${pct(v, f.joined)}%` }} />
            </span>
            <span className="pt-val">
              {v} · {pct(v, f.joined)} %
            </span>
          </li>
        ))}
      </ol>

      <h4>{t('admin.pt.minigame')}</h4>
      <p className="muted">
        {t('admin.pt.throwsLine', {
          throws: m.throws.throws,
          avg: m.throws.avg_skill ?? '–',
          perfect: pct(m.throws.perfect, m.throws.throws),
          rate: m.throws.catch_rate ?? '–',
        })}
      </p>
      <figure className="pt-hist">
        <figcaption>{t('admin.pt.skillHist')}</figcaption>
        <div className="pt-hist-bars">
          {buckets.map((b, i) => (
            <div key={i} title={`${i * 20}–${i * 20 + 20} %: ${b}`}>
              <span style={{ height: `${(b / bmax) * 100}%` }} />
              <small>
                {i * 20}–{i * 20 + 20}
              </small>
            </div>
          ))}
        </div>
      </figure>
      {m.throws.byRarity.length > 0 && (
        <table className="pt-table">
          <thead>
            <tr>
              <th scope="col">{t('admin.pt.rarity')}</th>
              <th scope="col">{t('admin.pt.throws')}</th>
              <th scope="col">{t('admin.pt.catchRate')}</th>
            </tr>
          </thead>
          <tbody>
            {[...m.throws.byRarity]
              .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
              .map((r) => (
                <tr key={r.rarity}>
                  <th scope="row">{t(`rarity.${r.rarity}`)}</th>
                  <td>{r.throws}</td>
                  <td>{r.catch_rate} %</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      <h4>{t('admin.pt.comments')}</h4>
      <div className="chips" role="group" aria-label={t('admin.pt.comments')}>
        {(['open', 'done'] as const).map((s) => (
          <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)}>
            {t(`admin.pt.show.${s}`)}
          </button>
        ))}
      </div>
      {items.length === 0 && <p className="muted">{t('admin.pt.noComments')}</p>}
      <ul className="plain stack">
        {items.map((x) => (
          <li key={x.id} className={`pt-comment pt-${x.category}`}>
            <p className="pt-meta">
              <span className="pt-cat">{t(`feedback.cat.${x.category}`)}</span>{' '}
              <span className="muted small">
                {x.player} · {t('levelShort', { level: x.level })} ·{' '}
                {t('admin.pt.played', { n: x.daysPlayed })} · {when(x.createdAt)}
                {x.screen ? ` · ${x.screen}` : ''}
                {x.build ? ` · v${x.build}` : ''}
                {x.lang ? ` · ${x.lang}` : ''}
              </span>
            </p>
            <p className="pt-body">{x.body}</p>
            {x.agent && <p className="muted small">{x.agent}</p>}
            {x.status === 'open' ? (
              <div className="row">
                <input
                  value={notes[x.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [x.id]: e.target.value })}
                  placeholder={t('admin.pt.note')}
                  maxLength={500}
                  aria-label={t('admin.pt.note')}
                />
                <button type="button" className="small" onClick={() => void close(x.id)}>
                  {t('admin.pt.done')}
                </button>
              </div>
            ) : (
              x.note && <p className="muted small">✓ {x.note}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
