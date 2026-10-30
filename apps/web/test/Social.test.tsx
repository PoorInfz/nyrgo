import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from '../src/i18n';
import { createApi, type Friends, type Trade } from '../src/api';
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
