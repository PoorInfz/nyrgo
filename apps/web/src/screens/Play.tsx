import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type Api, type Nearby } from '../api';
import {
  browserSource,
  simulatedSource,
  type LocationError,
  type LocationFix,
  type LocationSource,
  type SimulatorControls,
} from '../geo/location';
import { DEFAULT_CONFIG } from '@nyrgo/shared';
import { looksLikeDriving, shouldQuery } from '../geo/nearby';
import { PLACES } from '../geo/presets';
import { DevGps } from './DevGps';

const MapView = lazy(() => import('../map/MapView'));

/** Development builds use the simulator unless the URL has `?realgps` (testing on a phone). */
function simulatorEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  return !new URLSearchParams(globalThis.location?.search ?? '').has('realgps');
}

type Status =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'error'; error: LocationError }
  | { kind: 'weak'; accuracy: number }
  | { kind: 'ok' };

export function Play({
  api,
  source: injected,
  showMap = true,
}: {
  api: Api;
  /** Tests inject a source; development uses the simulator; everything else uses GPS. */
  source?: LocationSource;
  showMap?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const source = useMemo<LocationSource>(
    () => injected ?? (simulatorEnabled() ? simulatedSource(PLACES[0]!.at) : browserSource()),
    [injected],
  );
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const last = useRef<{ fix: LocationFix; at: number } | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    const stop = source.start(
      (f) => {
        setFix(f);
        // Same threshold as the server: do not spend a request on a fix it would refuse.
        if (f.accuracy > DEFAULT_CONFIG.world.requiredAccuracyM) {
          setStatus({ kind: 'weak', accuracy: f.accuracy });
          return;
        }
        const now = Date.now();
        if (!shouldQuery(last.current, f, now)) return;
        last.current = { fix: f, at: now };
        api
          .nearby(f)
          .then((n) => {
            setNearby(n);
            setStatus({ kind: 'ok' });
          })
          .catch((err) => {
            if (err instanceof ApiError && err.code === 'accuracy_too_low') {
              setStatus({ kind: 'weak', accuracy: f.accuracy });
            }
          });
      },
      (error) => setStatus({ kind: 'error', error }),
    );
    return stop;
  }, [active, api, source]);

  function enable() {
    setStatus({ kind: 'locating' });
    setActive(true);
  }

  async function report(id: string) {
    if (!window.confirm(t('reportConfirm'))) return;
    await api.reportPoi(id, 'unsafe').catch(() => undefined);
    setNearby((n) => (n ? { ...n, pois: n.pois.filter((p) => p.id !== id) } : n));
  }

  if (!active) {
    return (
      <section className="card stack" aria-labelledby="loc-title">
        <h2 id="loc-title">{t('locationTitle')}</h2>
        <p className="muted">{t('locationWhy')}</p>
        <button type="button" onClick={enable}>
          {t('locationEnable')}
        </button>
      </section>
    );
  }

  const driving = fix ? looksLikeDriving(fix) : false;

  return (
    <div className="stack">
      {driving && (
        <p className="warning" role="alert">
          {t('drivingWarning')}
        </p>
      )}
      {status.kind === 'error' && (
        <p role="alert">
          {t(status.error === 'denied' ? 'locationDenied' : 'locationUnavailable')}
        </p>
      )}
      {status.kind === 'locating' && <p role="status">{t('locating')}</p>}
      {status.kind === 'weak' && (
        <p role="status">{t('weakSignal', { m: Math.round(status.accuracy) })}</p>
      )}

      {showMap && (
        <Suspense fallback={<div className="map" />}>
          <MapView fix={fix} pois={nearby?.pois ?? []} lang={i18n.language} label={t('mapLabel')} />
        </Suspense>
      )}

      <section className="card" aria-labelledby="nearby-title">
        <h2 id="nearby-title">{t('nearbyTitle')}</h2>
        {nearby && nearby.pois.length === 0 && <p className="muted">{t('nearbyEmpty')}</p>}
        <ul className="poi-list">
          {nearby?.pois.map((p) => (
            <li key={p.id} data-in-range={p.inRange}>
              <span className={`dot biome-${p.biome}`} aria-hidden="true" />
              <span className="poi-name">
                {p.name ?? t(`kind.${p.kind}`, { defaultValue: p.kind })}
              </span>
              <span className="muted">
                {p.inRange ? t('inRange') : t('metres', { m: p.distanceM })}
              </span>
              <button type="button" className="link small" onClick={() => report(p.id)}>
                {t('report')}
              </button>
            </li>
          ))}
        </ul>
        {nearby && <p className="attribution">{nearby.attribution}</p>}
      </section>

      {import.meta.env.DEV && source.kind === 'simulated' && (
        <DevGps sim={source as LocationSource & SimulatorControls} />
      )}
    </div>
  );
}
