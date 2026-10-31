import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  CONTENT_VERSION,
  CREATURES,
  CREATURES_BY_ID,
  DEFAULT_CONFIG,
  ELEMENTS,
  ELEMENT_INFO,
  ITEMS,
  PASSIVES_BY_ID,
  RECIPES,
  SKILLS,
  STRONG_AGAINST,
  captureChance,
  captureFactor,
  weakAgainst,
} from '@nyrgo/shared';
import i18n from '../src/i18n';
import { createApi, type Dex, type NearbyCreature } from '../src/api';
import { CreatureSheet } from '../src/screens/CreatureSheet';

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
const spawn = (inRange: boolean): NearbyCreature => ({
  id: 's1',
  creatureId: 'oraclion',
  level: 12,
  lat: 37.88,
  lng: -4.78,
  distanceM: inRange ? 20 : 140,
  expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
  inRange,
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/v1/me/inventory')
        ? json({ items: [{ id: 'vault-basic', qty: 15 }] })
        : json({ entries: [] }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('creature details from the map', () => {
  it('shows rarity, the chance each vault has with the server formula, and whether it is new', async () => {
    const onCatch = vi.fn();
    render(
      <CreatureSheet
        api={createApi('http://api.test')}
        dex={DEX}
        spawn={spawn(true)}
        onCatch={onCatch}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Oraclion' })).toBeTruthy();
    expect(screen.getByText('Rare')).toBeTruthy();
    expect(await screen.findByText('New to your Dex!')).toBeTruthy();
    const def = CREATURES_BY_ID.get('oraclion')!;
    const f = captureFactor(def.captureDifficulty, 12);
    const p = (x: number) => `${Math.round(x * 100)} %`;
    const cap = DEFAULT_CONFIG.capture;
    expect(
      screen.getByText(
        `${p(captureChance(cap, 'rare', 1, f, 0))}–${p(captureChance(cap, 'rare', 1, f, 1))}`,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/runs away 20 %/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go for it!' }));
    expect(onCatch).toHaveBeenCalled();
  });

  it('asks to get closer when the creature is out of reach', () => {
    render(
      <CreatureSheet
        api={createApi('http://api.test')}
        dex={DEX}
        spawn={spawn(false)}
        onCatch={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText(/Get closer \(140 m\)/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Go for it!' })).toBeNull();
  });
});
