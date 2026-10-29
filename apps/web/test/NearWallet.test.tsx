import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from '../src/i18n';
import { createApi, type Profile } from '../src/api';
import { NearWallet, type NearSigner } from '../src/screens/NearWallet';
import { Home } from '../src/screens/Home';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const CHALLENGE = {
  message: 'nyrGo!: vincular esta cuenta de NEAR a tu jugador (testnet). Código ab12cd34.',
  recipient: 'nyrgo',
  nonce: btoa(String.fromCharCode(...new Array(32).fill(7))),
  network: 'testnet',
  expiresAt: '2026-10-29T18:00:00.000Z',
};

beforeEach(() => i18n.changeLanguage('es'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NearWallet', () => {
  it('signs the server’s challenge and sends back exactly what the wallet signed', async () => {
    let linked: unknown = null;
    const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith('/v1/me/wallet') && (init.method ?? 'GET') === 'GET')
        return json(200, { network: 'testnet', wallet: null });
      if (url.endsWith('/v1/me/wallet/challenge')) return json(200, CHALLENGE);
      if (url.endsWith('/v1/me/wallet/link')) {
        linked = JSON.parse(init.body as string);
        return json(200, {
          wallet: { accountId: 'alice.testnet', network: 'testnet', linkedAt: 'now' },
        });
      }
      return json(404, {});
    });
    vi.stubGlobal('fetch', fetch);
    const signer = vi.fn<NearSigner>(async () => ({
      accountId: 'alice.testnet',
      publicKey: 'ed25519:8afEGZFSzAjVA8cQMgCWtVF5rbDMsZB2an2XViVpKSkW',
      signature: 'c2ln',
    }));
    render(<NearWallet api={createApi('http://api.test')} signer={signer} />);

    expect(await screen.findByText(/nunca te pedirá tu frase semilla/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar cartera' }));
    expect(await screen.findByText('Cuenta alice.testnet vinculada.')).toBeInTheDocument();
    expect(signer).toHaveBeenCalledWith(CHALLENGE);
    expect(linked).toEqual({
      accountId: 'alice.testnet',
      publicKey: 'ed25519:8afEGZFSzAjVA8cQMgCWtVF5rbDMsZB2an2XViVpKSkW',
      signature: 'c2ln',
      nonce: CHALLENGE.nonce,
    });
    expect(screen.getByRole('button', { name: 'Desvincular' })).toBeInTheDocument();
  });

  it('explains a refused link and lets the player try again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        if (url.endsWith('/v1/me/wallet') && (init.method ?? 'GET') === 'GET')
          return json(200, { network: 'testnet', wallet: null });
        if (url.endsWith('/v1/me/wallet/challenge')) return json(200, CHALLENGE);
        return json(422, { code: 'wallet_key_not_full_access', title: 'no' });
      }),
    );
    const signer: NearSigner = async () => ({
      accountId: 'a.testnet',
      publicKey: 'k',
      signature: 's',
    });
    render(<NearWallet api={createApi('http://api.test')} signer={signer} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar cartera' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no con una clave de otra aplicación/,
    );
    expect(screen.getByRole('button', { name: 'Conectar cartera' })).toBeEnabled();
  });

  it('says nothing was signed when the player closes the wallet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/challenge')
          ? json(200, CHALLENGE)
          : json(200, { network: 'testnet', wallet: null }),
      ),
    );
    const signer: NearSigner = async () => {
      throw new Error('User rejected');
    };
    render(<NearWallet api={createApi('http://api.test')} signer={signer} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar cartera' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se ha firmado nada.');
  });
});

describe('Profile', () => {
  const profile = (canUseWeb3: boolean): Profile =>
    ({
      id: 'u',
      kind: 'guest',
      email: null,
      ageBand: canUseWeb3 ? '18+' : '16-17',
      region: 'ES',
      displayName: 'Explorer-1',
      level: 1,
      xp: 0,
      gold: 0,
      canUseWeb3,
      createdAt: 'now',
    }) as Profile;

  it('shows the NEAR wallet only to adults', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { network: 'testnet', wallet: null })),
    );
    const api = createApi('http://api.test');
    const { unmount } = render(
      <Home api={api} profile={profile(false)} onChange={() => {}} onSignedOut={() => {}} />,
    );
    expect(screen.queryByRole('heading', { name: 'Cartera NEAR' })).not.toBeInTheDocument();
    unmount();
    render(<Home api={api} profile={profile(true)} onChange={() => {}} onSignedOut={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Cartera NEAR' })).toBeInTheDocument();
  });
});
