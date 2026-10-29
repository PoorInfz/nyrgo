import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from '../src/i18n';
import { App } from '../src/App';
import { resources } from '../src/i18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App shell', () => {
  it('shows the safety reminder and a connected server', async () => {
    await i18n.changeLanguage('es');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    render(<App apiUrl="http://api.test" />);
    expect(screen.getByRole('note')).toHaveTextContent('no entres en lugares privados');
    expect(await screen.findByText(/conectado/)).toBeInTheDocument();
  });

  it('shows offline when the API is unreachable', async () => {
    await i18n.changeLanguage('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network');
      }),
    );
    render(<App apiUrl="http://api.test" />);
    expect(await screen.findByText(/offline/)).toBeInTheDocument();
  });
});

describe('translations', () => {
  it('has the same keys in every language', () => {
    expect(Object.keys(resources.en.translation).sort()).toEqual(
      Object.keys(resources.es.translation).sort(),
    );
  });
});
