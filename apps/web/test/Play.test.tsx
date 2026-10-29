import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from '../src/i18n';
import { Play } from '../src/screens/Play';
import { createApi, type Nearby } from '../src/api';
import type { LocationError, LocationFix, LocationSource } from '../src/geo/location';

/** A location source driven by the test. */
function manualSource() {
  let onFix: (f: LocationFix) => void = () => undefined;
  let onError: (e: LocationError) => void = () => undefined;
  const source: LocationSource = {
    kind: 'gps',
    start(f, e) {
      onFix = f;
      onError = e;
      return () => undefined;
    },
  };
  return {
    source,
    fix: (over: Partial<LocationFix> = {}) =>
      act(() =>
        onFix({
          lat: 37.8847,
          lng: -4.7792,
          accuracy: 5,
          speed: 1,
          timestamp: Date.now(),
          ...over,
        }),
      ),
    fail: (e: LocationError) => act(() => onError(e)),
  };
}

const NEARBY: Nearby = {
  cell: '89391d0034fffff',
  movement: { speedKmh: 4, interactable: true, reason: null, lockedUntil: null },
  visibleRadiusM: 300,
  interactionRadiusM: 40,
  attribution: '© OpenStreetMap contributors (ODbL)',
  creatures: [],
  pois: [
    {
      id: 'p1',
      name: 'Plaza de las Tendillas',
      kind: 'square',
      biome: 'urban',
      lat: 37.8847,
      lng: -4.7792,
      distanceM: 4,
      inRange: true,
    },
    {
      id: 'p2',
      name: 'Templo Romano',
      kind: 'archaeological_site',
      biome: 'historic',
      lat: 37.8853,
      lng: -4.7767,
      distanceM: 230,
      inRange: false,
    },
  ],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Content is fetched once per API client; answer it here so each test only sees its own calls. */
const CONTENT = { version: 1, elements: [], skills: [], creatures: [], items: [], recipes: [] };
const routed =
  (inner: (url: string, init?: RequestInit) => Promise<Response>) =>
  async (url: string, init?: RequestInit) =>
    url.endsWith('/v1/dex')
      ? json(200, CONTENT)
      : url.endsWith('/v1/me/missions')
        ? json(200, { day: '2026-10-29', missions: [] })
        : url.endsWith('/v1/me/creatures')
          ? json(200, { creatures: [] })
          : url.endsWith('/v1/me/dex')
            ? json(200, { entries: [] })
            : inner(url, init);

beforeEach(() => i18n.changeLanguage('es'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Play', () => {
  it('explains why it needs location before asking for it', async () => {
    const m = manualSource();
    const start = vi.spyOn(m.source, 'start');
    render(<Play api={createApi('http://api.test')} source={m.source} showMap={false} />);
    expect(screen.getByText(/solo mientras juegas/)).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Activar ubicación' }));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('lists nearby places with distance and OSM attribution', async () => {
    const fetch = vi.fn(async () => json(200, NEARBY));
    vi.stubGlobal('fetch', routed(fetch));
    const m = manualSource();
    render(<Play api={createApi('http://api.test')} source={m.source} showMap={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Activar ubicación' }));
    await m.fix();
    expect(await screen.findByText('Plaza de las Tendillas')).toBeInTheDocument();
    // the place in range can be visited
    expect(screen.getByRole('button', { name: 'Visitar' })).toBeInTheDocument();
    expect(screen.getByText('a 230 m')).toBeInTheDocument();
    expect(screen.getByText(/OpenStreetMap/)).toBeInTheDocument();
    const init = (fetch.mock.calls as unknown as [string, RequestInit][]).find(([u]) =>
      u.endsWith('/v1/world/nearby'),
    )![1];
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ lat: 37.8847, lng: -4.7792, accuracy: 5 });
  });

  it('does not query the server with an imprecise fix', async () => {
    const fetch = vi.fn(async (_u: RequestInfo | URL) => json(200, NEARBY));
    vi.stubGlobal('fetch', routed(fetch));
    const m = manualSource();
    render(<Play api={createApi('http://api.test')} source={m.source} showMap={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Activar ubicación' }));
    await m.fix({ accuracy: 120 });
    expect(screen.getByText(/Señal GPS débil \(120 m\)/)).toBeInTheDocument();
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith('/v1/world/nearby'))).toBe(false);
  });

  it('warns at vehicle speeds', async () => {
    vi.stubGlobal('fetch', routed(vi.fn(async () => json(200, NEARBY))));
    const m = manualSource();
    render(<Play api={createApi('http://api.test')} source={m.source} showMap={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Activar ubicación' }));
    await m.fix({ speed: 15 });
    expect(screen.getByRole('alert')).toHaveTextContent('No juegues mientras conduces');
  });

  it('explains a denied permission', async () => {
    const m = manualSource();
    render(<Play api={createApi('http://api.test')} source={m.source} showMap={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Activar ubicación' }));
    await m.fail('denied');
    expect(screen.getByRole('alert')).toHaveTextContent('ajustes del navegador');
  });

  it('reports a place and hides it locally', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetch = vi.fn(async (url: string) =>
      url.includes('/report') ? json(202, { received: true }) : json(200, NEARBY),
    );
    vi.stubGlobal('fetch', routed(fetch));
    const m = manualSource();
    render(<Play api={createApi('http://api.test')} source={m.source} showMap={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Activar ubicación' }));
    await m.fix();
    await screen.findByText('Templo Romano');
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Reportar' })[1]!);
    });
    expect(screen.queryByText('Templo Romano')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('http://api.test/v1/pois/p2/report', expect.anything());
  });

  it('explains a server-side cooldown after a location jump', async () => {
    const lockedUntil = new Date(Date.now() + 4.5 * 60_000).toISOString();
    vi.stubGlobal(
      'fetch',
      routed(
        vi.fn(async () =>
          json(200, {
            ...NEARBY,
            movement: {
              speedKmh: 600,
              interactable: false,
              reason: 'teleport_cooldown',
              lockedUntil,
            },
          }),
        ),
      ),
    );
    const m = manualSource();
    render(<Play api={createApi('http://api.test')} source={m.source} showMap={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Activar ubicación' }));
    await m.fix();
    expect(await screen.findByText(/las interacciones vuelven en 5 min/)).toBeInTheDocument();
  });

  it('shows the driving warning when the server measured vehicle speed', async () => {
    vi.stubGlobal(
      'fetch',
      routed(
        vi.fn(async () =>
          json(200, {
            ...NEARBY,
            movement: { speedKmh: 48, interactable: false, reason: 'speed', lockedUntil: null },
          }),
        ),
      ),
    );
    const m = manualSource();
    render(<Play api={createApi('http://api.test')} source={m.source} showMap={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Activar ubicación' }));
    await m.fix({ speed: null });
    expect(await screen.findByRole('alert')).toHaveTextContent('No juegues mientras conduces');
  });
});
