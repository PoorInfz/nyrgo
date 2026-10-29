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
import { Battle } from '../src/screens/Battle';
import type { BattleView } from '../src/api';

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
    art: `/creatures/${c.id}.webp`,
    thumb: `/creatures/${c.id}-thumb.webp`,
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
  foeHp: null,
  foeMaxHp: null,
  worn: false,
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
      'data-creature',
      'shrimpie',
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
          maxHp: 60,
          xp: 400,
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

const BATTLE: BattleView = {
  id: '44444444-4444-4444-8444-444444444444',
  turn: 0,
  result: null,
  player: {
    creatureId: 'gwisp',
    level: 8,
    hp: 40,
    maxHp: 40,
    skills: ['base-fee', 'priority-tip'],
    passive: 'gas-fee',
    mods: { atk: 1, def: 1, spd: 1 },
  },
  foe: {
    creatureId: 'dropling',
    level: 6,
    hp: 35,
    maxHp: 35,
    skills: ['gift-shower', 'claim-rush'],
    passive: 'lucky-drop',
    mods: { atk: 1, def: 1, spd: 1.1 },
  },
  items: { patch: 2 },
  events: [{ type: 'passive', side: 'foe', passive: 'lucky-drop', stat: 'spd', amount: 0.1 }],
};

describe('Battle', () => {
  it('shows both creatures, hints the type match-up and tells each turn', async () => {
    const after: BattleView = {
      ...BATTLE,
      turn: 1,
      foe: { ...BATTLE.foe, hp: 20 },
      player: { ...BATTLE.player, hp: 31 },
      events: [
        { type: 'move', side: 'player', skill: 'base-fee' },
        { type: 'hit', side: 'player', damage: 15, effectiveness: 2, crit: false, hpLeft: 20 },
        { type: 'move', side: 'foe', skill: 'gift-shower' },
        { type: 'hit', side: 'foe', damage: 9, effectiveness: 0.5, crit: false, hpLeft: 31 },
      ],
    };
    const fetch = serve(() => json(200, after));
    render(
      <Battle
        api={createApi('http://api.test')}
        dex={DEX}
        start={BATTLE}
        onEnd={() => undefined}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Combate contra Dropling' })).toBeInTheDocument();
    expect(screen.getByText('Dropling salvaje: Regalo inesperado.')).toBeInTheDocument();
    // Gas is strong against Airdrop
    expect(screen.getByRole('button', { name: /Tarifa base.*fuerte/ })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Vida de Dropling salvaje: 35 de 35' }),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Tarifa base/ }));
    });
    expect(await screen.findByText('Tu Gwisp usa Tarifa base.')).toBeInTheDocument();
    expect(screen.getByText('15 de daño. ¡Le da justo en su punto débil!')).toBeInTheDocument();
    expect(screen.getByText('9 de daño. Apenas le hace efecto…')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Vida de Dropling salvaje: 20 de 35' }),
    ).toBeInTheDocument();
    const [url, init] = fetch.mock.calls
      .map((c) => c as unknown as [string, RequestInit])
      .find(([u]) => u.includes('/turn'))!;
    expect(url).toBe(`http://api.test/v1/battles/${BATTLE.id}/turn`);
    expect(JSON.parse(String(init.body))).toEqual({ action: { kind: 'skill', skill: 'base-fee' } });
    expect((init.headers as Record<string, string>)['idempotency-key']).toBeTruthy();
  });

  it('reports the end of the battle with XP and rewards', async () => {
    const won: BattleView = {
      ...BATTLE,
      turn: 3,
      result: 'win',
      foe: { ...BATTLE.foe, hp: 0 },
      events: [{ type: 'faint', side: 'foe' }],
      creatureXp: { level: 9, leveledUp: true, xp: 56 },
      reward: { xp: 150, gold: 25, level: 2, leveledUp: false, goldCapped: 0 },
    };
    serve(() => json(200, won));
    const onEnd = vi.fn();
    render(<Battle api={createApi('http://api.test')} dex={DEX} start={BATTLE} onEnd={onEnd} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Tarifa base/ }));
    });
    expect(await screen.findByText(/Has agotado a Dropling/)).toBeInTheDocument();
    expect(screen.getByText('Gwisp gana 56 XP. ¡Gwisp sube a nivel 9!')).toBeInTheDocument();
    expect(screen.getByText('+150 XP · +25 Gold')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tarifa base/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(onEnd).toHaveBeenCalledWith(won);
  });

  it('heals with a patch and withdraws', async () => {
    let call = 0;
    const fetch = serve(() =>
      json(
        200,
        call++ === 0
          ? { ...BATTLE, turn: 1, items: { patch: 1 }, events: [] }
          : { ...BATTLE, turn: 2, result: 'fled', events: [{ type: 'flee', success: true }] },
      ),
    );
    render(
      <Battle
        api={createApi('http://api.test')}
        dex={DEX}
        start={{ ...BATTLE, player: { ...BATTLE.player, hp: 10 } }}
        onEnd={() => undefined}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Parche (2)' }));
    });
    expect(await screen.findByRole('button', { name: 'Parche (1)' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retirarse' }));
    });
    expect(await screen.findByText('Te retiras del combate.')).toBeInTheDocument();
    const bodies = fetch.mock.calls
      .map((c) => c as unknown as [string, RequestInit])
      .filter(([u]) => u.includes('/turn'))
      .map(([, init]) => JSON.parse(String(init.body)));
    expect(bodies).toEqual([
      { action: { kind: 'item', item: 'patch' } },
      { action: { kind: 'flee' } },
    ]);
  });
});
