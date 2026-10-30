import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The admin panel, at /admin. Uses its own bearer token (never the player session) and only
 * shows what the admin API returns: no emails, no locations beyond a reported place's own.
 */

interface ReviewCase {
  id: string;
  user_id: string;
  status: string;
  reason: string;
  risk_at_open: number;
  opened_at: string;
  display_name: string;
  account_status: string;
  risk_level: number;
  signals: Record<string, number> | null;
}
interface ReportedPoi {
  id: string;
  name: string | null;
  kind: string;
  hidden: boolean;
  report_count: number;
  lat: number;
  lng: number;
  reasons: Record<string, number> | null;
}
interface AuditEntry {
  id: number;
  role: string;
  action: string;
  reason: string;
  created_at: string;
}

interface AdminEvent {
  id: string;
  title: string;
  creatureId: string;
  level: number;
  startsAt: string;
  endsAt: string;
  cancelledAt: string | null;
  placeName: string;
  caught: number;
}
interface PoiHit {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lng: number;
  distanceM: number | null;
}

const KEY = 'nyrgo_admin_token';

/** `YYYY-MM-DDTHH:mm` in local time, for a datetime-local input. */
function localInput(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

export function Admin({ apiUrl }: { apiUrl: string }) {
  const { t } = useTranslation();
  const [token, setToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [draft, setDraft] = useState('');
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [cases, setCases] = useState<ReviewCase[]>([]);
  const [pois, setPois] = useState<ReportedPoi[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const call = useCallback(
    async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      const res = await fetch(`${apiUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? null : JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as {
        title?: string;
        detail?: string;
      } | null;
      if (!res.ok) throw new Error(data?.detail ?? data?.title ?? res.statusText);
      return data as T;
    },
    [apiUrl, token],
  );

  const reload = useCallback(async () => {
    const [m, c, p, a, e] = await Promise.all([
      call<{ name: string; role: string }>('GET', '/admin/v1/me'),
      call<{ cases: ReviewCase[] }>('GET', '/admin/v1/review-cases'),
      call<{ pois: ReportedPoi[] }>('GET', '/admin/v1/pois/reported'),
      call<{ entries: AuditEntry[] }>('GET', '/admin/v1/audit'),
      // events are optional: a server without them still shows the rest
      call<{ events: AdminEvent[] }>('GET', '/admin/v1/events').catch(() => ({ events: [] })),
    ]);
    setMe(m);
    setCases(c.cases);
    setPois(p.pois);
    setAudit(a.entries);
    setEvents(e.events);
  }, [call]);

  useEffect(() => {
    if (!token) return;
    let live = true;
    const failed = (e: Error) => {
      if (!live) return;
      setMe(null);
      setError(e.message);
    };
    void Promise.resolve().then(reload).catch(failed);
    return () => {
      live = false;
    };
  }, [token, reload]);

  function signIn() {
    try {
      sessionStorage.setItem(KEY, draft);
    } catch {
      /* private mode: the token lives in memory only */
    }
    setError(null);
    setToken(draft);
  }

  async function act(fn: () => Promise<unknown>) {
    if (reason.trim().length < 5) {
      setError(t('admin.reasonRequired'));
      return;
    }
    setError(null);
    try {
      await fn();
      setReason('');
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!me) {
    return (
      <section className="card stack" aria-labelledby="admin-title">
        <h2 id="admin-title">{t('admin.title')}</h2>
        <label>
          {t('admin.token')}
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="button" onClick={signIn} disabled={draft.length < 32}>
          {t('admin.enter')}
        </button>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="card stack">
        <h2>{t('admin.title')}</h2>
        <p className="muted">{t('admin.signedIn', { name: me.name, role: me.role })}</p>
        <label>
          {t('admin.reason')}
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </label>
        {error && <p role="alert">{error}</p>}
      </section>

      <section className="card stack" aria-labelledby="cases-title">
        <h3 id="cases-title">{t('admin.cases', { count: cases.length })}</h3>
        {cases.length === 0 && <p className="muted">{t('admin.noCases')}</p>}
        <ul className="plain stack">
          {cases.map((c) => (
            <li key={c.id} className="admin-item">
              <strong>{c.display_name}</strong>
              <span className="muted small">
                {t('admin.caseLine', {
                  risk: c.risk_level,
                  reason: c.reason,
                  when: new Date(c.opened_at).toLocaleString(),
                })}
              </span>
              <span className="muted small">
                {Object.entries(c.signals ?? {})
                  .map(([k, n]) => `${k} × ${n}`)
                  .join(' · ') || t('admin.noSignals')}
              </span>
              <span className="row tight">
                {(['no_action', 'warning', 'restricted'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={d === 'restricted' ? 'danger small' : 'secondary small'}
                    disabled={d === 'restricted' && me.role !== 'admin'}
                    onClick={() =>
                      act(() =>
                        call('POST', `/admin/v1/review-cases/${c.id}/close`, {
                          decision: d,
                          reason,
                        }),
                      )
                    }
                  >
                    {t(`admin.decision.${d}`)}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack" aria-labelledby="pois-title">
        <h3 id="pois-title">{t('admin.pois', { count: pois.length })}</h3>
        {pois.length === 0 && <p className="muted">{t('admin.noPois')}</p>}
        <ul className="plain stack">
          {pois.map((p) => (
            <li key={p.id} className="admin-item">
              <strong>
                {p.name ?? p.kind} {p.hidden && <span className="badge">{t('admin.hidden')}</span>}
              </strong>
              <span className="muted small">
                {t('admin.reports', { count: p.report_count })} ·{' '}
                {Object.entries(p.reasons ?? {})
                  .map(([k, n]) => `${k} × ${n}`)
                  .join(' · ')}{' '}
                ·{' '}
                <a
                  href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`}
                  target="_blank"
                  rel="noopener"
                >
                  {t('admin.map')}
                </a>
              </span>
              <span className="row tight">
                <button
                  type="button"
                  className="secondary small"
                  onClick={() =>
                    act(() => call('POST', `/admin/v1/pois/${p.id}`, { hidden: !p.hidden, reason }))
                  }
                >
                  {p.hidden ? t('admin.restore') : t('admin.hide')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <EventsAdmin
        apiUrl={apiUrl}
        call={call}
        act={act}
        reason={reason}
        canEdit={me.role === 'admin'}
        events={events}
      />

      <section className="card stack" aria-labelledby="audit-title">
        <h3 id="audit-title">{t('admin.audit')}</h3>
        <ul className="plain stack">
          {audit.slice(0, 20).map((a) => (
            <li key={a.id} className="muted small">
              {new Date(a.created_at).toLocaleString()} · {a.role} · {a.action} · {a.reason}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Events at places: schedule one (admin role) and cancel it; both need a reason, like every change. */
function EventsAdmin({
  apiUrl,
  call,
  act,
  reason,
  canEdit,
  events,
}: {
  apiUrl: string;
  call: <T>(method: string, path: string, body?: unknown) => Promise<T>;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  reason: string;
  canEdit: boolean;
  events: AdminEvent[];
}) {
  const { t, i18n } = useTranslation();
  const [creatures, setCreatures] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState('');
  const [near, setNear] = useState('');
  const [hits, setHits] = useState<PoiHit[] | null>(null);
  const [place, setPlace] = useState<PoiHit | null>(null);
  const [title, setTitle] = useState('');
  const [creatureId, setCreatureId] = useState('');
  const [level, setLevel] = useState(20);
  const [startsAt, setStartsAt] = useState(() => localInput(new Date()));
  const [duration, setDuration] = useState(60);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`${apiUrl}/v1/dex`)
      .then((r) => r.json() as Promise<{ creatures: { id: string; name: string }[] }>)
      .then((d) => live && setCreatures(d.creatures.map(({ id, name }) => ({ id, name }))))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [apiUrl]);

  async function search() {
    setSearchError(null);
    const params = new URLSearchParams({ q: q.trim() });
    // optional "lat, lng" to sort by distance
    const m = near.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      params.set('lat', m[1]!);
      params.set('lng', m[2]!);
    }
    try {
      setHits((await call<{ pois: PoiHit[] }>('GET', `/admin/v1/pois/search?${params}`)).pois);
    } catch (e) {
      setSearchError((e as Error).message);
    }
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' });
  const ready = canEdit && place && title.trim().length >= 3 && creatureId && startsAt;

  return (
    <section className="card stack" aria-labelledby="events-admin-title">
      <h3 id="events-admin-title">{t('admin.events.title')}</h3>
      {!canEdit && <p className="muted">{t('admin.events.adminOnly')}</p>}

      <ul className="plain stack">
        {events.length === 0 && <li className="muted">{t('admin.events.none')}</li>}
        {events.map((e) => (
          <li key={e.id} className="admin-item">
            <strong>
              {e.title}{' '}
              {e.cancelledAt && <span className="badge">{t('admin.events.cancelled')}</span>}
            </strong>
            <span className="muted small">
              {t('admin.events.line', {
                creature: creatures.find((c) => c.id === e.creatureId)?.name ?? e.creatureId,
                level: e.level,
                place: e.placeName,
                from: when(e.startsAt),
                to: when(e.endsAt),
                caught: e.caught,
              })}
            </span>
            {!e.cancelledAt && Date.parse(e.endsAt) > Date.parse(new Date().toISOString()) && (
              <span className="row tight">
                <button
                  type="button"
                  className="danger small"
                  disabled={!canEdit}
                  onClick={() =>
                    act(() => call('POST', `/admin/v1/events/${e.id}/cancel`, { reason }))
                  }
                >
                  {t('admin.events.cancel')}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <form
          className="stack"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!ready || !place) return;
            void act(async () => {
              await call('POST', '/admin/v1/events', {
                title: title.trim(),
                poiId: place.id,
                creatureId,
                level,
                startsAt: new Date(startsAt).toISOString(),
                durationMin: duration,
                reason,
              });
              setTitle('');
              setPlace(null);
              setHits(null);
            });
          }}
        >
          <h4>{t('admin.events.new')}</h4>
          <label>
            {t('admin.events.place')}
            <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} />
          </label>
          <label>
            {t('admin.events.near')}
            <input
              value={near}
              onChange={(e) => setNear(e.target.value)}
              placeholder="37.8847, -4.7792"
              inputMode="decimal"
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={q.trim().length < 2}
            onClick={() => void search()}
          >
            {t('admin.events.search')}
          </button>
          {searchError && <p role="alert">{searchError}</p>}
          {hits && hits.length === 0 && <p className="muted">{t('admin.events.noPlaces')}</p>}
          {hits && hits.length > 0 && (
            <fieldset className="stack">
              <legend>{t('admin.events.pick')}</legend>
              {hits.map((h) => (
                <label key={h.id} className="radio-option">
                  <input
                    type="radio"
                    name="event-place"
                    checked={place?.id === h.id}
                    onChange={() => setPlace(h)}
                  />
                  <span>
                    {h.name} <span className="muted small">({h.kind}</span>
                    {h.distanceM !== null && (
                      <span className="muted small"> · {t('metres', { m: h.distanceM })}</span>
                    )}
                    <span className="muted small">)</span>{' '}
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lng}#map=18/${h.lat}/${h.lng}`}
                      target="_blank"
                      rel="noopener"
                    >
                      {t('admin.map')}
                    </a>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <label>
            {t('admin.events.eventTitle')}
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
          </label>
          <label>
            {t('admin.events.creature')}
            <select value={creatureId} onChange={(e) => setCreatureId(e.target.value)}>
              <option value="">—</option>
              {creatures.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('admin.events.level')}
            <input
              type="number"
              min={1}
              max={50}
              value={level}
              onChange={(e) => setLevel(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
            />
          </label>
          <label>
            {t('admin.events.starts')}
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label>
            {t('admin.events.duration')}
            <input
              type="number"
              min={15}
              max={240}
              step={15}
              value={duration}
              onChange={(e) =>
                setDuration(Math.min(240, Math.max(15, Number(e.target.value) || 15)))
              }
            />
          </label>
          <p className="muted small">{t('admin.events.hint')}</p>
          <button type="submit" disabled={!ready}>
            {t('admin.events.create')}
          </button>
        </form>
      )}
    </section>
  );
}
