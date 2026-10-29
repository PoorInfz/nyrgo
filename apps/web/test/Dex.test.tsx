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
    model: `/creatures/${c.id}.glb`,
  })),
  items: ITEMS,
  recipes: RECIPES,
};

beforeEach(async () => {
  await i18n.changeLanguage('es');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(DEX), { status: 200 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderDex = () => render(<DexScreen api={createApi('http://api.test')} show3d={false} />);

describe('Dex', () => {
  it('lists all 50 creatures and filters by element', async () => {
    renderDex();
    expect(await screen.findByText('50 criaturas')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    fireEvent.click(screen.getByRole('button', { name: 'Gas' }));
    expect(screen.getByText('5 criaturas')).toBeInTheDocument();
    expect(screen.getByText('Gwisp')).toBeInTheDocument();
    expect(screen.queryByText('Frostkey')).not.toBeInTheDocument();
  });

  it('shows a creature with stats, skills, passive, match-ups and evolution', async () => {
    renderDex();
    fireEvent.click(await screen.findByText('Gwisp'));
    const page = screen.getByRole('article');
    expect(within(page).getByRole('heading', { name: 'Gwisp' })).toBeInTheDocument();
    expect(within(page).getByText(/#001 · Común · Inicial/)).toBeInTheDocument();
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
});
