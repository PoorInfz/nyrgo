/** Where the player is, as the game sees it. Real GPS and the dev simulator both produce this. */
export interface LocationFix {
  lat: number;
  lng: number;
  /** Horizontal accuracy in metres. */
  accuracy: number;
  /** Metres per second, or null when the device does not know. */
  speed: number | null;
  timestamp: number;
  /** Android app only: the OS marked this fix as mocked (a location spoofing app). */
  mock?: boolean;
}

export type LocationError = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export interface LocationSource {
  readonly kind: 'gps' | 'simulated';
  start(onFix: (fix: LocationFix) => void, onError: (err: LocationError) => void): () => void;
}

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Foreground-only GPS through the browser Geolocation API. */
export function browserSource(
  geo: Geolocation | undefined = globalThis.navigator?.geolocation,
): LocationSource {
  return {
    kind: 'gps',
    start(onFix, onError) {
      if (!geo) {
        onError('unsupported');
        return () => undefined;
      }
      const id = geo.watchPosition(
        (p) =>
          onFix({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy,
            speed: p.coords.speed,
            timestamp: p.timestamp,
          }),
        (e) => onError(e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable'),
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
      );
      return () => geo.clearWatch(id);
    },
  };
}

export interface Waypoint {
  lat: number;
  lng: number;
}

/** Position after travelling `metres` along the polyline (clamped to its end). */
export function pointAlong(route: Waypoint[], metres: number): Waypoint {
  if (route.length === 0) throw new Error('empty route');
  let left = Math.max(0, metres);
  for (let i = 1; i < route.length; i++) {
    const a = route.at(i - 1)!;
    const b = route.at(i)!;
    const seg = distanceM(a, b);
    if (left <= seg && seg > 0) {
      const f = left / seg;
      return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
    }
    left -= seg;
  }
  return route.at(-1)!;
}

export function routeLength(route: Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += distanceM(route.at(i - 1)!, route.at(i)!);
  return total;
}

export interface SimulatorControls {
  teleport(to: Waypoint): void;
  play(route: Waypoint[], speedKmh: number): void;
  pause(): void;
  setAccuracy(m: number): void;
}

/**
 * Development-only GPS simulator: teleport, or play a route at a chosen speed, emitting a fix
 * every `tickMs`. Speeds above the reward limit are allowed on purpose, to test anti-cheat.
 */
export function simulatedSource(
  start: Waypoint,
  tickMs = 1_000,
  now: () => number = Date.now,
): LocationSource & SimulatorControls {
  let position = start;
  let accuracy = 5;
  let speedMs: number | null = 0;
  let route: Waypoint[] | null = null;
  let travelled = 0;
  let listener: ((f: LocationFix) => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const emit = () =>
    listener?.({
      lat: position.lat,
      lng: position.lng,
      accuracy,
      speed: speedMs,
      timestamp: now(),
    });

  const tick = () => {
    if (route && speedMs) {
      travelled += speedMs * (tickMs / 1000);
      position = pointAlong(route, travelled);
      if (travelled >= routeLength(route)) {
        route = null;
        speedMs = 0;
      }
    }
    emit();
  };

  return {
    kind: 'simulated',
    start(onFix) {
      listener = onFix;
      emit();
      timer = setInterval(tick, tickMs);
      return () => {
        listener = null;
        if (timer) clearInterval(timer);
        timer = null;
      };
    },
    teleport(to) {
      route = null;
      speedMs = 0;
      position = to;
      emit();
    },
    play(r, speedKmh) {
      if (r.length === 0) return;
      route = r;
      travelled = 0;
      position = r.at(0)!;
      speedMs = speedKmh / 3.6;
      emit();
    },
    pause() {
      route = null;
      speedMs = 0;
      emit();
    },
    setAccuracy(m) {
      accuracy = m;
      emit();
    },
  };
}
