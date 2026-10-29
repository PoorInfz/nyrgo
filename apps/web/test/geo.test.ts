import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserSource,
  distanceM,
  pointAlong,
  routeLength,
  simulatedSource,
  type LocationFix,
} from '../src/geo/location';
import { looksLikeDriving, shouldQuery } from '../src/geo/nearby';
import { ROUTES } from '../src/geo/presets';
import { buildStyle, poisToGeoJSON } from '../src/map/style';

const tendillas = { lat: 37.8847, lng: -4.7792 };
const puente = { lat: 37.8764, lng: -4.7775 };

describe('distanceM', () => {
  it('measures Tendillas to the Roman bridge at roughly 940 m', () => {
    const d = distanceM(tendillas, puente);
    expect(d).toBeGreaterThan(900);
    expect(d).toBeLessThan(980);
  });
});

describe('routes', () => {
  it('walks along a route and stops at its end', () => {
    const r = [tendillas, puente];
    expect(pointAlong(r, 0)).toEqual(tendillas);
    expect(pointAlong(r, 1e6)).toEqual(puente);
    const half = pointAlong(r, routeLength(r) / 2);
    expect(distanceM(half, tendillas)).toBeCloseTo(routeLength(r) / 2, -1);
  });

  it('has preset routes of a walkable length', () => {
    for (const route of ROUTES) {
      expect(routeLength(route.points)).toBeGreaterThan(300);
      expect(routeLength(route.points)).toBeLessThan(3000);
    }
  });
});

describe('simulatedSource', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emits on start, teleports and moves at the chosen speed', () => {
    const sim = simulatedSource(tendillas, 1000, () => 0);
    const fixes: LocationFix[] = [];
    const stop = sim.start(
      (f) => fixes.push(f),
      () => undefined,
    );
    expect(fixes.at(-1)).toMatchObject({ ...tendillas, speed: 0 });

    sim.teleport(puente);
    expect(fixes.at(-1)).toMatchObject(puente);

    sim.play([tendillas, puente], 36); // 10 m/s
    vi.advanceTimersByTime(10_000);
    const moved = distanceM(fixes.at(-1)!, tendillas);
    expect(moved).toBeGreaterThan(95);
    expect(moved).toBeLessThan(105);
    expect(fixes.at(-1)!.speed).toBeCloseTo(10);

    sim.setAccuracy(120);
    expect(fixes.at(-1)!.accuracy).toBe(120);
    stop();
    const count = fixes.length;
    vi.advanceTimersByTime(5_000);
    expect(fixes.length).toBe(count);
  });
});

describe('browserSource', () => {
  it('maps Geolocation API fixes and errors', () => {
    let success: PositionCallback = () => undefined;
    let failure: PositionErrorCallback = () => undefined;
    const geo = {
      watchPosition: vi.fn((s: PositionCallback, e: PositionErrorCallback) => {
        success = s;
        failure = e!;
        return 7;
      }),
      clearWatch: vi.fn(),
    } as unknown as Geolocation;
    const fixes: LocationFix[] = [];
    const errors: string[] = [];
    const stop = browserSource(geo).start(
      (f) => fixes.push(f),
      (e) => errors.push(e),
    );
    success({
      coords: { latitude: 37.88, longitude: -4.78, accuracy: 9, speed: null },
      timestamp: 123,
    } as GeolocationPosition);
    failure({ code: 1 } as GeolocationPositionError);
    expect(fixes).toEqual([{ lat: 37.88, lng: -4.78, accuracy: 9, speed: null, timestamp: 123 }]);
    expect(errors).toEqual(['denied']);
    expect(geo.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    });
    stop();
    expect(geo.clearWatch).toHaveBeenCalledWith(7);
  });

  it('reports unsupported when there is no Geolocation API', () => {
    const errors: string[] = [];
    browserSource(undefined).start(
      () => undefined,
      (e) => errors.push(e),
    );
    expect(errors).toEqual(['unsupported']);
  });
});

describe('shouldQuery', () => {
  const fix = (lat: number, lng: number): LocationFix => ({
    lat,
    lng,
    accuracy: 5,
    speed: 1,
    timestamp: 0,
  });
  const here = fix(37.8847, -4.7792);
  const tenMetres = fix(37.88479, -4.7792);
  const fiftyMetres = fix(37.88515, -4.7792);

  it('asks on the first fix, after moving 25 m or after 15 s, never twice within 3 s', () => {
    expect(shouldQuery(null, here, 0)).toBe(true);
    const last = { fix: here, at: 0 };
    expect(shouldQuery(last, fiftyMetres, 1_000)).toBe(false);
    expect(shouldQuery(last, fiftyMetres, 4_000)).toBe(true);
    expect(shouldQuery(last, tenMetres, 4_000)).toBe(false);
    expect(shouldQuery(last, tenMetres, 15_000)).toBe(true);
  });

  it('flags vehicle speeds', () => {
    expect(looksLikeDriving({ ...here, speed: 1.4 })).toBe(false);
    expect(looksLikeDriving({ ...here, speed: 14 })).toBe(true);
    expect(looksLikeDriving({ ...here, speed: null })).toBe(false);
  });
});

describe('map style', () => {
  it('falls back to a plain background without a PMTiles file', () => {
    const s = buildStyle({ lang: 'es' });
    expect(Object.keys(s.sources)).toEqual([]);
    expect(s.layers.map((l) => l.id)).toEqual(['background']);
    expect(s.glyphs).toBeUndefined(); // no third-party font requests
    expect(s.sprite).toBeUndefined();
  });

  it('uses our PMTiles file with OSM attribution when configured', () => {
    const s = buildStyle({ pmtilesUrl: '/tiles/cordoba.pmtiles', lang: 'es' });
    const src = s.sources.protomaps as { url: string; attribution: string };
    expect(src.url).toBe('pmtiles:///tiles/cordoba.pmtiles');
    expect(src.attribution).toContain('OpenStreetMap');
    expect(s.layers.length).toBeGreaterThan(20);
  });

  it('turns POIs into GeoJSON with lng/lat order', () => {
    const fc = poisToGeoJSON([
      {
        id: 'a',
        name: null,
        kind: 'square',
        biome: 'urban',
        lat: 37.88,
        lng: -4.78,
        distanceM: 3,
        inRange: true,
      },
    ]);
    expect(fc.features[0]!.geometry.coordinates).toEqual([-4.78, 37.88]);
    expect(fc.features[0]!.properties).toMatchObject({ name: '', inRange: true });
  });
});
