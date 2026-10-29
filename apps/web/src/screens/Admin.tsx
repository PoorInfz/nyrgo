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

const KEY = 'nyrgo_admin_token';

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
    const [m, c, p, a] = await Promise.all([
      call<{ name: string; role: string }>('GET', '/admin/v1/me'),
      call<{ cases: ReviewCase[] }>('GET', '/admin/v1/review-cases'),
      call<{ pois: ReportedPoi[] }>('GET', '/admin/v1/pois/reported'),
      call<{ entries: AuditEntry[] }>('GET', '/admin/v1/audit'),
    ]);
    setMe(m);
    setCases(c.cases);
    setPois(p.pois);
    setAudit(a.entries);
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
