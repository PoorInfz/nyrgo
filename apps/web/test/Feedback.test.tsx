import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from '../src/i18n';
import { createApi } from '../src/api';
import { Feedback } from '../src/components/Feedback';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('comments from the game', () => {
  it('sends the kind, the text and the screen it came from', async () => {
    await i18n.changeLanguage('es');
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 7 }), { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    render(<Feedback api={createApi('http://api.test')} screen="dex" />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar un comentario' }));
    expect(screen.getByRole('dialog', { name: 'Cuéntanos' })).toBeTruthy();
    const send = screen.getByRole('button', { name: 'Enviar' });
    expect(send).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('radio', { name: /Idea/ }));
    fireEvent.change(screen.getByLabelText('Tu comentario'), {
      target: { value: 'Más criaturas de agua, por favor' },
    });
    await act(async () => {
      fireEvent.click(send);
    });
    expect(await screen.findByText('¡Gracias! Leemos todos los comentarios.')).toBeTruthy();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/v1/feedback');
    expect(JSON.parse(String(init.body))).toMatchObject({
      category: 'idea',
      body: 'Más criaturas de agua, por favor',
      screen: 'dex',
      lang: 'es',
    });
  });
});
