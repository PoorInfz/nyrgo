import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from '../src/i18n';
import { createApi } from '../src/api';
import { FirstSteps } from '../src/screens/FirstSteps';
import { Admin } from '../src/screens/Admin';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  i18n.changeLanguage('es');
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FirstSteps', () => {
  it('ticks steps from the player’s real state and can be hidden for good', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/v1/me/creatures')
          ? json(200, { creatures: [{ id: 'x', creatureId: 'gwisp', acquiredVia: 'starter' }] })
          : json(200, {
              entries: [
                { creatureId: 'gwisp', caughtCount: 1 },
                { creatureId: 'fuddle', caughtCount: 0 },
              ],
            }),
      ),
    );
    render(
      <FirstSteps
        api={createApi('http://api.test')}
        locationOn={true}
        visited={false}
        refresh={0}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Primeros pasos' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.className)).toEqual(['done', 'done', 'done', '', '']);
    fireEvent.click(screen.getByRole('button', { name: 'Ya sé jugar, ocultar' }));
    expect(screen.queryByRole('heading', { name: 'Primeros pasos' })).not.toBeInTheDocument();
    expect(localStorage.getItem('nyrgo_first_steps_done')).toBe('1');
  });
});

describe('Admin', () => {
  it('asks for a key, then lists cases and closes one with a reason', async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
      if (
        !(init.headers as Record<string, string> | undefined)?.authorization?.startsWith('Bearer ')
      )
        return json(401, { title: 'no' });
      if (url.endsWith('/admin/v1/me')) return json(200, { name: 'rob', role: 'reviewer' });
      if (url.endsWith('/admin/v1/review-cases'))
        return json(200, {
          cases: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              user_id: 'u',
              status: 'open',
              reason: 'risk_threshold',
              risk_at_open: 72,
              opened_at: '2026-10-29T09:00:00Z',
              display_name: 'Explorer-ab12',
              account_status: 'active',
              risk_level: 72,
              signals: { teleport: 3 },
            },
          ],
        });
      if (url.endsWith('/admin/v1/pois/reported')) return json(200, { pois: [] });
      if (url.endsWith('/admin/v1/audit')) return json(200, { entries: [] });
      if (url.endsWith('/close')) return json(200, { status: 'closed' });
      return json(404, {});
    });
    vi.stubGlobal('fetch', fetch);
    render(<Admin apiUrl="http://api.test" />);
    const enter = screen.getByRole('button', { name: 'Entrar' });
    expect(enter).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Clave de acceso'), {
      target: { value: 'k'.repeat(40) },
    });
    await act(async () => {
      fireEvent.click(enter);
    });
    expect(await screen.findByText('Explorer-ab12')).toBeInTheDocument();
    expect(screen.getByText('teleport × 3')).toBeInTheDocument();
    // a reviewer cannot suspend
    expect(screen.getByRole('button', { name: 'Suspender cuenta' })).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aviso' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('motivo');
    fireEvent.change(screen.getByLabelText(/Motivo/), {
      target: { value: 'Tres teleports seguidos' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aviso' }));
    });
    const close = (fetch.mock.calls as unknown as [string, RequestInit][]).find(([u]) =>
      u.endsWith('/close'),
    )!;
    expect(JSON.parse(String(close[1].body))).toEqual({
      decision: 'warning',
      reason: 'Tres teleports seguidos',
    });
    expect(JSON.stringify(fetch.mock.calls)).not.toContain('nyrgo_session');
  });

  it('lets an admin find a place and schedule an event there', async () => {
    const created: unknown[] = [];
    const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith('/v1/dex'))
        return json(200, { creatures: [{ id: 'genesaur', name: 'Genesaur' }] });
      if (url.endsWith('/admin/v1/me')) return json(200, { name: 'eva', role: 'admin' });
      if (url.endsWith('/admin/v1/review-cases')) return json(200, { cases: [] });
      if (url.endsWith('/admin/v1/pois/reported')) return json(200, { pois: [] });
      if (url.endsWith('/admin/v1/audit')) return json(200, { entries: [] });
      if (url.includes('/admin/v1/pois/search'))
        return json(200, {
          pois: [
            {
              id: 'p1',
              name: 'Plaza de las Tendillas',
              kind: 'square',
              lat: 37.88,
              lng: -4.78,
              distanceM: 120,
            },
          ],
        });
      if (url.endsWith('/admin/v1/events') && init.method === 'POST') {
        created.push(JSON.parse(String(init.body)));
        return json(200, { id: 'e1' });
      }
      if (url.endsWith('/admin/v1/events')) return json(200, { events: [] });
      return json(404, {});
    });
    vi.stubGlobal('fetch', fetch);
    render(<Admin apiUrl="http://api.test" />);
    fireEvent.change(screen.getByLabelText('Clave de acceso'), {
      target: { value: 'k'.repeat(40) },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    });
    fireEvent.change(await screen.findByLabelText('Lugar (nombre)'), {
      target: { value: 'Tendillas' },
    });
    fireEvent.change(screen.getByLabelText(/Cerca de/), { target: { value: '37.88, -4.78' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Buscar lugar' }));
    });
    expect(
      (fetch.mock.calls as unknown as [string][]).some(([u]) =>
        u.includes('/admin/v1/pois/search?q=Tendillas&lat=37.88&lng=-4.78'),
      ),
    ).toBe(true);
    fireEvent.click(await screen.findByRole('radio'));
    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Genesaur en Tendillas' },
    });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Genesaur' })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText('Criatura'), { target: { value: 'genesaur' } });
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'Evento de prueba' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));
    });
    expect(created).toEqual([
      expect.objectContaining({
        title: 'Genesaur en Tendillas',
        poiId: 'p1',
        creatureId: 'genesaur',
        level: 20,
        durationMin: 60,
        reason: 'Evento de prueba',
      }),
    ]);
  });
});
