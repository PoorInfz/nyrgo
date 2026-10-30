import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from '../src/i18n';
import { createApi, type Duel, type Friends, type Trade } from '../src/api';
import { Social } from '../src/screens/Social';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const FRIENDS: Friends = {
  code: 'ABCD2345',
  friends: [{ id: 'f1', name: 'Lucía', level: 7, caught: 12 }],
  incoming: [{ id: 'f2', name: 'Pablo', level: 3 }],
  outgoing: [],
};
const OFFER: Trade = {
  id: 't1',
  status: 'pending',
  mine: false,
  expiresAt: '2026-10-30T15:00:00.000Z',
  friendId: 'f1',
  friendName: 'Lucía',
  giveCreatureId: 'genesaur',
  giveLevel: 5,
  wantCreatureId: 'zeroknowl',
  wantLevel: 4,
};

function mockApi(routes: Record<string, (init: RequestInit) => Response>) {
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${new URL(url).pathname}`;
    const route = routes[key];
    if (!route) return json(404, { code: 'not_found', title: 'nope' });
    return route(init);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => i18n.changeLanguage('es'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('friends and trades', () => {
  it('shows my code, friends, requests and an offer to accept', async () => {
    const fetch = mockApi({
      'GET /v1/friends': () => json(200, FRIENDS),
      'GET /v1/trades': () => json(200, { trades: [OFFER] }),
      'GET /v1/duels': () => json(200, { duels: [] }),
      'POST /v1/trades/t1/accept': () => json(409, { code: 'trade_too_far', title: 'far' }),
    });
    render(<Social api={createApi('http://api.test')} />);
    expect(await screen.findByText('ABCD2345')).toBeTruthy();
    expect(screen.getByText('Pablo', { exact: false })).toBeTruthy();
    expect(screen.getByText(/12 especies/)).toBeTruthy();
    expect(screen.getByText(/Lucía te da genesaur Nv. 5 por tu zeroknowl Nv. 4/)).toBeTruthy();

    // the server checks both players stand together; its refusal is explained
    const accept = screen.getAllByRole('button', { name: 'Aceptar' });
    fireEvent.click(accept[accept.length - 1]!);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Tenéis que estar a menos de 100 m, los dos con el mapa abierto.',
    );
    expect(fetch).toHaveBeenCalledWith('http://api.test/v1/trades/t1/accept', expect.anything());
  });

  it('adds a friend by code', async () => {
    const fetch = mockApi({
      'GET /v1/friends': () => json(200, { ...FRIENDS, friends: [], incoming: [] }),
      'GET /v1/trades': () => json(200, { trades: [] }),
      'GET /v1/duels': () => json(200, { duels: [] }),
      'POST /v1/friends': () => json(200, { status: 'requested' }),
    });
    render(<Social api={createApi('http://api.test')} />);
    fireEvent.change(await screen.findByLabelText('Código de tu amigo'), {
      target: { value: 'wxyz6789' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/Solicitud enviada/),
    );
    const call = fetch.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ code: 'WXYZ6789' });
  });
});

describe('friendly duels', () => {
  const MINE = {
    id: 'c1',
    creatureId: 'gwisp',
    level: 9,
    xp: 0,
    maxHp: 40,
    ivs: { hp: 5, atk: 5, def: 5, spd: 5 },
    stats: { hp: 40, atk: 20, def: 20, spd: 20 },
    hp: 40,
    acquiredVia: 'capture',
    acquiredAt: '2026-10-30T10:00:00Z',
  };
  const INCOMING: Duel = {
    id: 'd1',
    status: 'pending',
    mine: false,
    expiresAt: '2026-10-30T15:00:00Z',
    finishedAt: null,
    friendId: 'f1',
    friendName: 'Lucía',
    winner: null,
    fromCreatureId: 'dropling',
    fromLevel: 7,
    toCreatureId: null,
    toLevel: null,
    fight: null,
  };
  const DONE: Duel = {
    ...INCOMING,
    id: 'd2',
    status: 'done',
    mine: true,
    finishedAt: '2026-10-30T14:00:00Z',
    winner: 'me',
    toCreatureId: 'dropling',
    toLevel: 7,
    fromCreatureId: 'gwisp',
    fromLevel: 9,
    fight: {
      winner: 'player',
      hp: { player: 12, foe: 0 },
      turns: [
        { turn: 0, events: [] },
        {
          turn: 1,
          events: [
            { type: 'hit', side: 'player', damage: 40, effectiveness: 1, crit: true, hpLeft: 0 },
            { type: 'faint', side: 'foe' },
          ],
        },
      ],
    },
  };

  it('answers a challenge with a chosen creature and shows the fight', async () => {
    const fetch = mockApi({
      'GET /v1/friends': () => json(200, FRIENDS),
      'GET /v1/trades': () => json(200, { trades: [] }),
      'GET /v1/duels': () => json(200, { duels: [INCOMING, DONE] }),
      'GET /v1/me/creatures': () => json(200, { creatures: [MINE] }),
      'POST /v1/duels/d1/accept': () => json(200, { id: 'd1', status: 'done', winner: 'me' }),
    });
    render(<Social api={createApi('http://api.test')} />);
    expect(await screen.findByText(/Lucía te reta con dropling Nv. 7/)).toBeTruthy();
    const select = screen.getByLabelText('Responder con');
    await waitFor(() => expect(screen.getByRole('option', { name: 'gwisp Nv. 9' })).toBeTruthy());
    fireEvent.change(select, { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: '¡Luchar!' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('http://api.test/v1/duels/d1/accept', expect.anything()),
    );
    const call = fetch.mock.calls.find(([u]) => String(u).endsWith('/d1/accept'))!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ creature: 'c1' });

    // the finished duel, from my side
    fireEvent.click(screen.getByRole('button', { name: /Duelo con Lucía · ¡Has ganado!/ }));
    expect(await screen.findByText(/40 de daño\. ¡Golpe certero!/)).toBeTruthy();
    expect(screen.getByText(/dropling de Lucía se queda sin fuerzas/)).toBeTruthy();
  });
});
