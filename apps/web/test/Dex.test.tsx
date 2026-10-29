import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
import { createApi, type Dex } from '../src/api';
import { DexScreen } from '../src/screens/DexScreen';

/** Same shape the API's GET /v1/dex returns, built from the real content. */
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

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const entry = (creatureId: string, caughtCount = 0) => ({
  creatureId,
  seenAt: '2026-10-29T09:00:00.000Z',
  caughtAt: caughtCount ? '2026-10-29T09:01:00.000Z' : null,
  caughtCount,
});

/** Serves the content and a personal Dex; by default the player has seen everything. */
function serve(entries = CREATURES.map((c) => entry(c.id))) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (url.endsWith('/v1/me/dex') ? json({ entries }) : json(DEX))),
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
  serve();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderDex = () => render(<DexScreen api={createApi('http://api.test')} />);

describe('Dex', () => {
  it('lists all 50 creatures and filters by element', async () => {
    renderDex();
    expect(await screen.findByText(/· 50 criaturas/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    // thumbnails are decorative: the name is already on the card
    expect(document.querySelectorAll('.dex-card img[alt=""]')).toHaveLength(50);
    fireEvent.click(screen.getByRole('button', { name: 'Gas' }));
    expect(screen.getByText(/· 5 criaturas/)).toBeInTheDocument();
    expect(screen.getByText('Gwisp')).toBeInTheDocument();
    expect(screen.queryByText('Frostkey')).not.toBeInTheDocument();
  });

  it('shows a creature with stats, skills, passive, match-ups and evolution', async () => {
    renderDex();
    fireEvent.click(await screen.findByText('Gwisp'));
    const page = screen.getByRole('article');
    expect(within(page).getByRole('heading', { name: 'Gwisp' })).toBeInTheDocument();
    expect(within(page).getByText(/#001 · Común · Inicial/)).toBeInTheDocument();
    expect(within(page).getByRole('img', { name: 'Ilustración de Gwisp' })).toHaveAttribute(
      'src',
      '/creatures/gwisp.webp',
    );
    expect(within(page).getByText(/cobra un peaje/)).toBeInTheDocument();
    expect(within(page).getByText('Tarifa base')).toBeInTheDocument();
    expect(within(page).getByText('Peaje')).toBeInTheDocument();
    expect(within(page).getByText(/Fuerte contra: Airdrop, Luna/)).toBeInTheDocument();
    expect(within(page).getByText(/Débil contra: Quema, Minado/)).toBeInTheDocument();
    expect(within(page).getByText(/al nivel 16/)).toBeInTheDocument();

    fireEvent.click(within(page).getByRole('button', { name: 'Gasguzzle →' }));
    expect(screen.getByRole('heading', { name: 'Gasguzzle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Gwisp' })).toBeInTheDocument();
  });

  it('explains the HODL evolution', async () => {
    renderDex();
    fireEvent.click(await screen.findByText('Paperpaw'));
    expect(screen.getByText(/tras 30 días en tu colección sin intercambiarla/)).toBeInTheDocument();
  });

  it('switches descriptions to English', async () => {
    await i18n.changeLanguage('en');
    renderDex();
    fireEvent.click(await screen.findByText('Seedsnatcher'));
    expect(screen.getByText(/Never give them/)).toBeInTheDocument();
    expect(screen.getByText(/Strong against: Liquidity, Yield/)).toBeInTheDocument();
  });

  it('hides creatures the player has not seen and marks the caught ones', async () => {
    serve([entry('gwisp', 1), entry('gasguzzle')]);
    renderDex();
    expect(
      await screen.findByText('Vistas 2 · Capturadas 1 de 50', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('Gwisp')).toBeInTheDocument();
    expect(screen.getByText('Gasguzzle')).toBeInTheDocument();
    expect(screen.queryByText('Frostkey')).not.toBeInTheDocument();
    expect(screen.queryByText(/Llavecita de hielo/)).not.toBeInTheDocument();
    expect(screen.getAllByText('???')).toHaveLength(48);
    expect(screen.getByLabelText('#022 Criatura desconocida')).toBeInTheDocument();
    // only the caught one carries the mark
    expect(screen.getAllByText('Capturada', { selector: '.sr-only' })).toHaveLength(1);
    // the evolution link to an unseen creature stays hidden
    fireEvent.click(screen.getByText('Gasguzzle'));
    expect(screen.getByText('??? →')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gaswarlord →' })).not.toBeInTheDocument();
  });
});
