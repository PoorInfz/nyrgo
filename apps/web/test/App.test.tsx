import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n, { resources } from '../src/i18n';
import { App } from '../src/App';
import type { Profile } from '../src/api';

const guest: Profile = {
  id: 'u1',
  kind: 'guest',
  email: null,
  ageBand: '18+',
  region: 'ES',
  displayName: 'Explorer-abc123',
  level: 1,
  xp: 0,
  gold: 0,
  canUseWeb3: true,
  createdAt: '2026-10-29T00:00:00Z',
};

type Route = (init: RequestInit) => Response | Promise<Response>;

function mockApi(routes: Record<string, Route>) {
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${new URL(url).pathname}`;
    const route = routes[key];
    if (!route) throw new Error(`unexpected ${key}`);
    return route(init);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(async () => {
  await i18n.changeLanguage('es');
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('signed out', () => {
  it('shows the age gate and safety reminder, then starts a guest game', async () => {
    const fetch = mockApi({
      'GET /v1/me': () => json(401, { code: 'unauthenticated' }),
      'POST /v1/auth/guest': () => json(201, guest),
    });
    render(<App apiUrl="http://api.test" />);
    expect(await screen.findByText('¿Cuándo naciste?')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('no entres en lugares privados');

    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Año'), { target: { value: '1995' } });
    fireEvent.click(screen.getByRole('button', { name: 'Empezar a jugar' }));

    expect(await screen.findByText('Explorer-abc123')).toBeInTheDocument();
    const call = fetch.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ birthYear: 1995, birthMonth: 6 });
    expect(call[1]!.credentials).toBe('include');
  });

  it('explains when the player is too young', async () => {
    mockApi({
      'GET /v1/me': () => json(401, { code: 'unauthenticated' }),
      'POST /v1/auth/guest': () => json(403, { code: 'age_restricted', title: 'x' }),
    });
    render(<App apiUrl="http://api.test" />);
    fireEvent.change(await screen.findByLabelText('Mes'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Año'), { target: { value: '2016' } });
    fireEvent.click(screen.getByRole('button', { name: 'Empezar a jugar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('edad mínima');
  });

  it('shows offline when the API is unreachable', async () => {
    mockApi({
      'GET /v1/me': () => {
        throw new TypeError('network');
      },
    });
    render(<App apiUrl="http://api.test" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('signed in as guest', () => {
  it('offers to save progress with an email', async () => {
    const fetch = mockApi({
      'GET /v1/me': () => json(200, guest),
      'POST /v1/auth/magic-link': () => json(202, { sent: true }),
    });
    render(<App apiUrl="http://api.test" />);
    expect(await screen.findByText('Guarda tu progreso')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviarme el enlace' }));
    expect(await screen.findByRole('status')).toHaveTextContent('te llegará un enlace');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('tells registered players to sign in again before deleting', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi({
      'GET /v1/me': () => json(200, { ...guest, kind: 'registered', email: 'a@b.test' }),
      'DELETE /v1/me': () => json(403, { code: 'reauth_required', title: 'x' }),
    });
    render(<App apiUrl="http://api.test" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Borrar mi cuenta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('entra de nuevo');
    expect(screen.queryByText('Guarda tu progreso')).not.toBeInTheDocument();
  });
});

describe('magic link landing', () => {
  it('verifies the token once and removes it from the address bar', async () => {
    window.history.replaceState(null, '', '/auth/verify?token=abc');
    const fetch = mockApi({
      'POST /v1/auth/verify': () => json(200, { ...guest, kind: 'registered' }),
    });
    render(<App apiUrl="http://api.test" />);
    expect(await screen.findByText('Cuenta guardada')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(window.location.search).toBe('');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('explains an expired link', async () => {
    window.history.replaceState(null, '', '/auth/verify?token=abc');
    mockApi({
      'POST /v1/auth/verify': () => json(400, { code: 'invalid_token', title: 'x' }),
    });
    render(<App apiUrl="http://api.test" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('caducado');
  });
});

describe('translations', () => {
  it('has the same keys in every language', () => {
    expect(Object.keys(resources.en.translation).sort()).toEqual(
      Object.keys(resources.es.translation).sort(),
    );
  });
});
