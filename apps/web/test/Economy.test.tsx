import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
import { createApi, type Dex, type Mission } from '../src/api';
import { Bag } from '../src/screens/Bag';
import { Missions } from '../src/screens/Missions';
import { Collection } from '../src/screens/Collection';

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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function serve(handler: (url: string, init: RequestInit) => Response) {
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) =>
    url.endsWith('/v1/dex') ? json(200, DEX) : handler(url, init),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const calls = (fetch: ReturnType<typeof serve>, part: string) =>
  fetch.mock.calls
    .map((c) => c as unknown as [string, RequestInit])
    .filter(([u]) => u.includes(part));

beforeEach(() => i18n.changeLanguage('es'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PROFILE = {
  id: 'u',
  kind: 'guest',
  email: null,
  ageBand: '18+',
  region: 'ES',
  displayName: 'Explorer',
  level: 3,
  xp: 350,
  gold: 70,
  canUseWeb3: true,
  createdAt: '2026-10-29T09:00:00.000Z',
};

describe('Bag', () => {
  it('shows Gold and items, buys from the shop with an Idempotency-Key and updates both', async () => {
    const fetch = serve((url) => {
      if (url.endsWith('/v1/me/inventory'))
        return json(200, { items: [{ id: 'vault-basic', qty: 2 }] });
      if (url.endsWith('/v1/me')) return json(200, PROFILE);
      if (url.endsWith('/v1/shop'))
        return json(200, {
          items: ITEMS.filter((i) => i.price !== null).map((i) => ({
            id: i.id,
            price: i.price,
            kind: i.kind,
          })),
          maxPerPurchase: 20,
        });
      return json(200, { gold: 50, level: 3, xp: 350, items: [{ id: 'vault-basic', qty: 3 }] });
    });
    render(<Bag api={createApi('http://api.test')} />);
    expect(await screen.findByText('70 Gold', { selector: '.gold-line' })).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();
    // 5 basic vaults cost 100, more than the player has
    const row = within(screen.getByRole('region', { name: 'Tienda' }))
      .getByText('Bóveda básica', { exact: false })
      .closest('li')!;
    const buy1 = row.querySelector('button')!;
    expect(row.querySelectorAll('button')[1]).toBeDisabled();
    await act(async () => {
      fireEvent.click(buy1);
    });
    expect(await screen.findByText('Has comprado 1 × Bóveda básica.')).toBeInTheDocument();
    expect(screen.getByText('50 Gold', { selector: '.gold-line' })).toBeInTheDocument();
    const [, init] = calls(fetch, '/v1/shop/buy')[0]!;
    expect(JSON.parse(String(init.body))).toEqual({ item: 'vault-basic', qty: 1 });
    expect((init.headers as Record<string, string>)['idempotency-key']).toBeTruthy();
  });

  it('locks recipes below their level and without the inputs', async () => {
    serve((url) => {
      if (url.endsWith('/v1/me/inventory')) return json(200, { items: [] });
      if (url.endsWith('/v1/me')) return json(200, { ...PROFILE, level: 1 });
      return json(200, { items: [], maxPerPurchase: 20 });
    });
    render(<Bag api={createApi('http://api.test')} />);
    expect(await screen.findByRole('heading', { name: 'Taller' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nivel 5' })).toBeDisabled();
  });
});

describe('Missions', () => {
  const MISSIONS: Mission[] = [
    {
      id: 'visit-3',
      kind: 'visit',
      target: 3,
      name: { es: 'Visita 3 lugares', en: 'Visit 3 places' },
      progress: 3,
      completed: true,
      rewarded: false,
    },
    {
      id: 'win-2',
      kind: 'win',
      target: 2,
      name: { es: 'Gana 2 combates', en: 'Win 2 battles' },
      progress: 1,
      completed: false,
      rewarded: false,
    },
  ];

  it('shows progress and claims a completed mission', async () => {
    const fetch = serve((url) =>
      url.endsWith('/claim')
        ? json(200, {
            reward: { xp: 500, gold: 150, level: 4, leveledUp: true, goldCapped: 0 },
            missions: [{ ...MISSIONS[0], rewarded: true }, MISSIONS[1]],
          })
        : json(200, { day: '2026-10-29', missions: MISSIONS }),
    );
    render(<Missions api={createApi('http://api.test')} />);
    expect(await screen.findByText('Visita 3 lugares')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Recoger' })).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Recoger' }));
    });
    expect(await screen.findByText('+500 XP · +150 Gold')).toBeInTheDocument();
    expect(screen.getByText('Recogida')).toBeInTheDocument();
    expect(calls(fetch, '/v1/me/missions/visit-3/claim')).toHaveLength(1);
  });
});

describe('Evolution in the collection', () => {
  const owned = (over: Record<string, unknown>) => ({
    id: '55555555-5555-4555-8555-555555555555',
    creatureId: 'gwisp',
    level: 10,
    xp: 1800,
    ivs: { hp: 7, atk: 7, def: 7, spd: 7 },
    stats: { hp: 60, atk: 50, def: 40, spd: 60 },
    hp: 60,
    maxHp: 60,
    acquiredVia: 'starter',
    acquiredAt: '2026-10-29T09:00:00.000Z',
    ...over,
  });

  it('says when it will evolve, and evolves once the level is reached', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let mine = [owned({})];
    const fetch = serve((url) => {
      if (url.endsWith('/evolve')) {
        const evolved = owned({ creatureId: 'gasguzzle', level: 16 });
        return json(200, { from: 'gwisp', creature: evolved, gold: 0 });
      }
      return json(200, { creatures: mine });
    });
    const { unmount } = render(<Collection api={createApi('http://api.test')} />);
    expect(await screen.findByText('Evoluciona a Gasguzzle al nivel 16')).toBeInTheDocument();
    unmount();

    mine = [owned({ level: 16 })];
    render(<Collection api={createApi('http://api.test')} />);
    const button = await screen.findByRole('button', { name: /Evolucionar a Gasguzzle/ });
    expect(button).toHaveTextContent('500 Gold · 3 fragmentos de hash');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(await screen.findByText('¡Gwisp ha evolucionado en Gasguzzle!')).toBeInTheDocument();
    expect(screen.getByText('Gasguzzle')).toBeInTheDocument();
    expect(calls(fetch, '/evolve')).toHaveLength(1);
  });
});

describe('Creatures as NFTs in the collection', () => {
  const creature = (over: Record<string, unknown> = {}) => ({
    id: '66666666-6666-4666-8666-666666666666',
    creatureId: 'gwisp',
    level: 16,
    xp: 4800,
    ivs: { hp: 7, atk: 7, def: 7, spd: 7 },
    stats: { hp: 60, atk: 50, def: 40, spd: 60 },
    hp: 60,
    maxHp: 60,
    acquiredVia: 'starter',
    acquiredAt: '2026-10-29T09:00:00.000Z',
    onchain: null,
    ...over,
  });

  function nftServer(wallet: string | null) {
    return serve((url, init) => {
      if (url.endsWith('/v1/nft'))
        return json(200, { contractId: 'c.testnet', network: 'testnet' });
      if (url.endsWith('/v1/me/wallet'))
        return json(200, {
          network: 'testnet',
          wallet: wallet ? { accountId: wallet, network: 'testnet', linkedAt: 'now' } : null,
        });
      if (url.endsWith('/mint') && init.method === 'POST')
        return json(200, {
          creature: creature({
            onchain: { status: 'minted', account: wallet, edition: 12, supply: 1000 },
          }),
          txHash: 'tx',
          contractId: 'c.testnet',
        });
      return json(200, { creatures: [creature()] });
    });
  }

  it('takes a creature out to the linked wallet after a clear warning', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetch = nftServer('alice.testnet');
    render(<Collection api={createApi('http://api.test')} />);
    const button = await screen.findByRole('button', { name: 'Sacar como NFT' });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(confirm.mock.calls[0]![0]).toMatch(/alice\.testnet.*no podrá evolucionar/s);
    expect(
      await screen.findByText('Gwisp ya es un NFT en tu cartera alice.testnet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('NFT #12/1000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver carta NFT' })).toHaveAttribute(
      'href',
      'http://api.test/v1/nft/cards/66666666-6666-4666-8666-666666666666.png',
    );
    // IVs 7+7+7+7 = 28: grade C
    expect(screen.getByLabelText('Grado C')).toBeInTheDocument();
    expect(screen.getByText('En la cartera alice.testnet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sacar como NFT' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Evolucionar/ })).not.toBeInTheDocument();
    expect(calls(fetch, '/mint')).toHaveLength(1);
  });

  it('offers nothing without a linked wallet', async () => {
    nftServer(null);
    render(<Collection api={createApi('http://api.test')} />);
    expect(await screen.findByText('Gwisp')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sacar como NFT' })).not.toBeInTheDocument();
  });
});
