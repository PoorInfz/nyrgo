import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  CONTENT_VERSION,
  CREATURES,
  ELEMENTS,
  ELEMENT_INFO,
  ITEMS,
  PASSIVES_BY_ID,
  RECIPES,
  SKILLS,
  STRONG_AGAINST,
  weakAgainst,
} from '@nyrgo/shared';
import i18n from '../src/i18n';
import { createApi, type CaptureResult, type Dex, type Encounter as Enc } from '../src/api';
import { Encounter } from '../src/screens/Encounter';
import { Collection } from '../src/screens/Collection';

const DEX: Dex = {
  version: CONTENT_VERSION,
  elements: ELEMENTS.map((id) => ({
    id,
    name: { es: ELEMENT_INFO[id].es, en: ELEMENT_INFO[id].en },
    color: ELEMENT_INFO[id].color,
    strongAgainst: [...STRONG_AGAINST[id]],
    weakAgainst: weakAgainst(id),
  })),
  skills: SKILLS,
  creatures: CREATURES.map((c) => ({
    ...c,
    passive: PASSIVES_BY_ID.get(c.passive)!,
    art: `/creatures/${c.id}.svg`,
  })),
  items: ITEMS,
  recipes: RECIPES,
};

const SPAWN = {
  id: '11111111-1111-4111-8111-111111111111',
  creatureId: 'shrimpie',
  level: 6,
  lat: 37.88,
  lng: -4.78,
  distanceM: 12,
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  inRange: true,
};

const ENC: Enc = {
  id: '22222222-2222-4222-8222-222222222222',
  spawnId: SPAWN.id,
  creatureId: 'shrimpie',
  level: 6,
  rarity: 'common',
  status: 'open',
  attempts: 0,
  expiresAt: SPAWN.expiresAt,
  inventory: [
    { id: 'patch', qty: 3 },
    { id: 'vault-basic', qty: 2 },
  ],
};

const reward = { xp: 100, gold: 10, level: 2, leveledUp: true, goldCapped: 0 };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
function serve(handler: Handler) {
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) =>
    url.endsWith('/v1/dex') ? json(200, DEX) : handler(url, init),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => i18n.changeLanguage('es'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const captureCalls = (fetch: ReturnType<typeof serve>) =>
  fetch.mock.calls
    .map((c) => c as unknown as [string, RequestInit])
    .filter(([u]) => u.includes('/capture'));

describe('Encounter', () => {
  it('opens the encounter, throws the chosen vault and shows the catch', async () => {
    const result: CaptureResult = {
      result: 'caught',
      chance: 0.71,
      attempts: 1,
      itemsLeft: 1,
      reward,
      creature: null,
    };
    const fetch = serve((url) => (url.endsWith('/encounter') ? json(200, ENC) : json(200, result)));
    const onClose = vi.fn();
    render(<Encounter api={createApi('http://api.test')} spawn={SPAWN} onClose={onClose} />);

    expect(await screen.findByRole('heading', { name: '¡Shrimpie salvaje!' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ilustración de Shrimpie' })).toHaveAttribute(
      'src',
      '/creatures/shrimpie.svg',
    );
    expect(await screen.findByRole('radio', { name: 'Bóveda básica (2)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bóveda fría (0)' })).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lanzar bóveda' }));
    });
    expect(await screen.findByText('¡Shrimpie guardada en tu colección!')).toBeInTheDocument();
    expect(screen.getByText('Probabilidad de este lanzamiento: 71 %')).toBeInTheDocument();
    expect(screen.getByText('+100 XP · +10 Gold')).toBeInTheDocument();
    expect(screen.getByText('¡Subes a nivel 2!')).toBeInTheDocument();

    const [url, init] = captureCalls(fetch)[0]!;
    expect(url).toBe(`http://api.test/v1/encounters/${ENC.id}/capture`);
    const body = JSON.parse(String(init!.body));
    expect(body.item).toBe('vault-basic');
    expect(body.skill).toBeGreaterThanOrEqual(0);
    expect(body.skill).toBeLessThanOrEqual(1);
    expect((init!.headers as Record<string, string>)['idempotency-key']).toMatch(/^[\w-]{8,}$/);

    fireEvent.click(screen.getByRole('button', { name: 'Volver al mapa' }));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it('reuses the same Idempotency-Key when a throw is retried after a lost connection', async () => {
    let first = true;
    const escaped: CaptureResult = {
      result: 'escaped',
      chance: 0.4,
      attempts: 1,
      itemsLeft: 1,
      reward: { ...reward, xp: 10, gold: 0, leveledUp: false, level: 1 },
      creature: null,
    };
    const fetch = serve((url) => {
      if (url.endsWith('/encounter')) return json(200, ENC);
      if (first) {
        first = false;
        throw new TypeError('offline');
      }
      return json(200, escaped);
    });
    render(
      <Encounter api={createApi('http://api.test')} spawn={SPAWN} onClose={() => undefined} />,
    );
    await screen.findByRole('radio', { name: 'Bóveda básica (2)' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lanzar bóveda' }));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('no se gastará otra bóveda');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lanzar bóveda' }));
    });
    expect(await screen.findByText(/se ha escapado/)).toBeInTheDocument();
    const keys = captureCalls(fetch).map(
      ([, init]) => (init.headers as Record<string, string>)['idempotency-key'],
    );
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    // the next throw is a new action with a new key
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lanzar bóveda' }));
    });
    const after = captureCalls(fetch).map(
      ([, init]) => (init.headers as Record<string, string>)['idempotency-key'],
    );
    expect(after[2]).not.toBe(after[0]);
    // vault counter follows the server
    expect(screen.getByRole('radio', { name: 'Bóveda básica (1)' })).toBeInTheDocument();
  });

  it('explains why an encounter cannot start', async () => {
    serve(() => json(422, { code: 'too_far', title: 'Get closer', status: 422, type: 'x' }));
    render(
      <Encounter api={createApi('http://api.test')} spawn={SPAWN} onClose={() => undefined} />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Acércate a menos de 40 m');
    expect(screen.queryByRole('button', { name: 'Lanzar bóveda' })).not.toBeInTheDocument();
  });

  it('ends when the creature runs away', async () => {
    const fled: CaptureResult = {
      result: 'fled',
      chance: 0.3,
      attempts: 1,
      itemsLeft: 1,
      reward: { ...reward, xp: 10, gold: 0, leveledUp: false, level: 1 },
      creature: null,
    };
    serve((url) => (url.endsWith('/encounter') ? json(200, ENC) : json(200, fled)));
    const onClose = vi.fn();
    render(<Encounter api={createApi('http://api.test')} spawn={SPAWN} onClose={onClose} />);
    await screen.findByRole('radio', { name: 'Bóveda básica (2)' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lanzar bóveda' }));
    });
    expect(await screen.findByText('Shrimpie ha huido.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lanzar bóveda' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al mapa' }));
    expect(onClose).toHaveBeenCalledWith(true);
  });
});

describe('Collection', () => {
  it('offers the three starters to a new player and shows the pick afterwards', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let mine: unknown[] = [];
    const fetch = serve((url, init) => {
      if (url.endsWith('/v1/me/starter') && init.method === 'POST') {
        const made = {
          id: '33333333-3333-4333-8333-333333333333',
          creatureId: 'dropling',
          level: 5,
          ivs: { hp: 1, atk: 2, def: 3, spd: 4 },
          stats: { hp: 60, atk: 30, def: 30, spd: 40 },
          hp: 60,
          acquiredVia: 'starter',
          acquiredAt: '2026-10-29T10:00:00.000Z',
        };
        mine = [made];
        return json(201, made);
      }
      return json(200, { creatures: mine });
    });
    render(<Collection api={createApi('http://api.test')} />);
    expect(
      await screen.findByRole('heading', { name: 'Elige tu primera criatura' }),
    ).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /^Elegir a / });
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Elegir a Gwisp',
      'Elegir a Frostkey',
      'Elegir a Dropling',
    ]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Elegir a Dropling' }));
    });
    expect(await screen.findByRole('heading', { name: 'Tu colección' })).toBeInTheDocument();
    expect(screen.getByText('Dropling')).toBeInTheDocument();
    expect(screen.getByText('Nv. 5 · Inicial')).toBeInTheDocument();
    const post = fetch.mock.calls
      .map((c) => c as unknown as [string, RequestInit])
      .find(([u]) => u.endsWith('/v1/me/starter'))!;
    expect(JSON.parse(String(post[1].body))).toEqual({ creatureId: 'dropling' });
  });
});
