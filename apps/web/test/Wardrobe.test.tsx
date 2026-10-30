import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_AVATAR } from '@nyrgo/shared';
import i18n from '../src/i18n';
import { createApi, type AvatarState } from '../src/api';
import { Wardrobe } from '../src/screens/Wardrobe';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => i18n.changeLanguage('es'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('wardrobe and cosmetics shop', () => {
  it('tries a hat on, buys it with Gold and saves the look', async () => {
    let state: AvatarState = { avatar: DEFAULT_AVATAR, owned: [], gold: 100 };
    const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
      const key = `${init.method ?? 'GET'} ${new URL(url).pathname}`;
      if (key === 'GET /v1/me/avatar') return json(200, state);
      if (key === 'POST /v1/me/cosmetics/buy') {
        state = { ...state, owned: ['hat_cap'], gold: 40 };
        return json(200, state);
      }
      if (key === 'PUT /v1/me/avatar') {
        state = { ...state, avatar: JSON.parse(String(init.body)).avatar };
        return json(200, state);
      }
      return json(404, {});
    });
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onGold = vi.fn();
    render(<Wardrobe api={createApi('http://api.test')} onGold={onGold} />);

    expect(await screen.findByText('100 oro')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gorro' }));
    // trying it on is free, but it cannot be saved until bought
    fireEvent.click(screen.getByRole('button', { name: /Gorra/ }));
    expect(screen.getByText(/Te lo estás probando/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar look' })).toBeDisabled();
    // the crown is too expensive
    expect(screen.getAllByRole('button', { name: 'Falta oro' }).length).toBeGreaterThan(0);

    const buy = screen.getAllByRole('button', { name: 'Comprar' })[0]!;
    fireEvent.click(buy);
    expect(await screen.findByText('40 oro')).toBeTruthy();
    expect(onGold).toHaveBeenCalledWith(40);
    const bought = fetch.mock.calls.find(([u]) => String(u).endsWith('/cosmetics/buy'))!;
    expect(JSON.parse(String(bought[1]!.body))).toEqual({ item: 'hat_cap' });
    expect((bought[1]!.headers as Record<string, string>)['idempotency-key']).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar look' }));
    await waitFor(() => expect(state.avatar.hat).toBe('hat_cap'));
    expect(await screen.findByText(/Look guardado/)).toBeTruthy();
  });
});
