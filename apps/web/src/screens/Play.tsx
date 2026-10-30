import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type Api, type GameEvent, type Nearby, type NearbyCreature } from '../api';
import { thumbUrl, useContent } from '../content';
import { Encounter } from './Encounter';
import { Missions } from './Missions';
import { FirstSteps } from './FirstSteps';
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
import { isNativeApp, nativeSource } from '../geo/native';
import { PLACES } from '../geo/presets';
import { DevGps } from './DevGps';
import { useLook } from '../avatar/store';

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
    () =>
      injected ??
      (simulatorEnabled()
        ? simulatedSource(PLACES[0]!.at)
        : isNativeApp()
          ? nativeSource()
          : browserSource()),
    [injected],
  );
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  /** Minutes left in a server cooldown, computed when the answer arrives (not during render). */
  const [cooldownMin, setCooldownMin] = useState<number | null>(null);
  const last = useRef<{ fix: LocationFix; at: number } | null>(null);
  const [active, setActive] = useState(false);
  const [facing, setFacing] = useState<NearbyCreature | null>(null);
  /** Spawns caught or scared away here; the next nearby answer leaves them out anyway. */
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  // Names for the creature list; only fetched once the player starts playing.
  const { dex } = useContent(api, active);
  const names = useMemo(() => new Map(dex?.creatures.map((c) => [c.id, c.name])), [dex]);
  /** Bumped after anything that may move a mission, so the missions card refreshes. */
  const [progressTick, setProgressTick] = useState(0);
  const [visit, setVisit] = useState<{ ok: boolean; text: string } | null>(null);
  const [visited, setVisited] = useState<ReadonlySet<string>>(new Set());
  const look = useLook(api);
  const [events, setEvents] = useState<{ list: GameEvent[]; at: number }>({ list: [], at: 0 });

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
            const until = n.movement.reason === 'teleport_cooldown' ? n.movement.lockedUntil : null;
            setCooldownMin(
              until ? Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60_000)) : null,
            );
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

  // Events near the player: looked up again only when they move to another cell.
  const cell = nearby?.cell;
  useEffect(() => {
    const at = last.current?.fix;
    if (!cell || !at) return;
    let live = true;
    api
      .events(at.lat, at.lng)
      .then(
        (r) =>
          live && setEvents({ list: Array.isArray(r?.events) ? r.events : [], at: Date.now() }),
      )
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, cell]);

  function enable() {
    setStatus({ kind: 'locating' });
    setActive(true);
  }

  async function visitPoi(id: string) {
    setVisit(null);
    try {
      const r = await api.visitPoi(id);
      const itemNames = Object.entries(r.items)
        .map(([item, n]) => {
          const def = dex?.items.find((i) => i.id === item);
          return `${n} × ${def?.name[i18n.language.startsWith('en') ? 'en' : 'es'] ?? item}`;
        })
        .join(', ');
      setVisit({
        ok: true,
        text: `${t('rewardLine', { xp: r.reward.xp, gold: r.reward.gold })}${itemNames ? ` · ${itemNames}` : ''}`,
      });
      setVisited((v) => new Set(v).add(id));
      setProgressTick((n) => n + 1);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'other';
      setVisit({
        ok: false,
        text: t(code === 'cooldown_active' ? 'visitCooldown' : `errors.${code}`, {
          defaultValue: t('errors.other'),
        }),
      });
    }
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

  if (facing) {
    return (
      <Encounter
        api={api}
        spawn={facing}
        onClose={(wasGone) => {
          if (wasGone) setGone((g) => new Set(g).add(facing.id));
          setFacing(null);
          setProgressTick((n) => n + 1);
        }}
      />
    );
  }

  const creatures = (nearby?.creatures ?? []).filter((c) => !gone.has(c.id));

  // Either the device says it is moving fast or the server measured it between fixes.
  const driving = (fix ? looksLikeDriving(fix) : false) || nearby?.movement.reason === 'speed';
  const mocked = nearby?.movement.reason === 'mock_location';

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
      {mocked && (
        <p className="warning" role="alert">
          {t('mockNotice')}
        </p>
      )}
      {cooldownMin !== null && (
        <p className="notice" role="status">
          {t('cooldownNotice', { min: cooldownMin })}
        </p>
      )}
      {status.kind === 'weak' && (
        <p role="status">{t('weakSignal', { m: Math.round(status.accuracy) })}</p>
      )}

      {showMap && (
        <Suspense fallback={<div className="map" />}>
          <MapView
            fix={fix}
            pois={nearby?.pois ?? []}
            creatures={creatures}
            onCreature={(id) => {
              const c = creatures.find((x) => x.id === id);
              if (c?.inRange) setFacing(c);
            }}
            lang={i18n.language}
            label={t('mapLabel')}
            look={look}
          />
        </Suspense>
      )}

      <FirstSteps
        api={api}
        locationOn={status.kind === 'ok'}
        visited={visited.size > 0}
        refresh={progressTick}
      />
      <Missions api={api} refresh={progressTick} />

      {events.list.length > 0 && (
        <section className="card" aria-labelledby="events-title">
          <h2 id="events-title">{t('events.title')}</h2>
          <ul className="creature-list">
            {events.list.map((e) => {
              const live = Date.parse(e.startsAt) <= events.at;
              const when = (iso: string) =>
                new Date(iso).toLocaleString(i18n.language, {
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              return (
                <li key={e.id}>
                  <img src={thumbUrl(e.creatureId)} alt="" width={48} height={70} />
                  <span className="poi-name">
                    <strong>{e.title}</strong>
                    <br />
                    <span className="muted small">
                      {names.get(e.creatureId) ?? e.creatureId}{' '}
                      {t('levelShort', { level: e.level })} · {e.placeName} ·{' '}
                      {t('metres', { m: e.distanceM })}
                    </span>
                    <br />
                    <span className="muted small">
                      {live
                        ? t('events.until', { when: when(e.endsAt) })
                        : t('events.from', { when: when(e.startsAt) })}
                    </span>
                  </span>
                  {live && <span className="badge event">{t('events.badge')}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="creatures-title">
        <h2 id="creatures-title">{t('creaturesTitle')}</h2>
        {nearby?.area === 'loading' ? (
          <p className="muted" role="status">
            {t('areaLoading')}
          </p>
        ) : (
          nearby && creatures.length === 0 && <p className="muted">{t('creaturesEmpty')}</p>
        )}
        <ul className="creature-list">
          {creatures.map((c) => {
            const name = names.get(c.creatureId) ?? c.creatureId;
            return (
              <li key={c.id} data-in-range={c.inRange}>
                <img src={thumbUrl(c.creatureId)} alt="" width={48} height={70} />
                <span className="poi-name">
                  {name} <span className="muted">{t('levelShort', { level: c.level })}</span>
                  {c.eventId && <span className="badge event">{t('events.badge')}</span>}
                </span>
                {c.inRange ? (
                  <button type="button" className="small" onClick={() => setFacing(c)}>
                    {t('catchIt')}
                  </button>
                ) : (
                  <span className="muted">{t('approach', { m: c.distanceM })}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="nearby-title">
        <h2 id="nearby-title">{t('nearbyTitle')}</h2>
        {nearby && nearby.pois.length === 0 && <p className="muted">{t('nearbyEmpty')}</p>}
        {visit && (
          <p role={visit.ok ? 'status' : 'alert'} className={visit.ok ? 'notice' : ''}>
            {visit.text}
          </p>
        )}
        <ul className="poi-list">
          {nearby?.pois.map((p) => (
            <li key={p.id} data-in-range={p.inRange}>
              <span className={`dot biome-${p.biome}`} aria-hidden="true" />
              <span className="poi-name">
                {p.name ?? t(`kind.${p.kind}`, { defaultValue: p.kind })}
              </span>
              {p.inRange && !visited.has(p.id) ? (
                <button type="button" className="small" onClick={() => visitPoi(p.id)}>
                  {t('visit')}
                </button>
              ) : (
                <span className="muted">
                  {p.inRange ? t('visitedRecently') : t('metres', { m: p.distanceM })}
                </span>
              )}
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
