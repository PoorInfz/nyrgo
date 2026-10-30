import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from '../src/i18n';
import { createApi, type TokenStatus } from '../src/api';
import { TokenCard } from '../src/screens/TokenCard';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const STATUS: TokenStatus = {
  symbol: 'NYRGO',
  enabled: true,
  contractId: 'token.nyrgo.testnet',
  network: 'testnet',
  balance: 24,
  earnedToday: 12,
  dailyCap: 50,
  minClaim: 10,
  canClaim: true,
  blockedBy: null,
  claimableAt: null,
  claims: [],
};

beforeEach(() => i18n.changeLanguage('es'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NYRGO card', () => {
  it('shows the balance and the day, and sends the claim', async () => {
    let status = STATUS;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/v1/me/token/claim') && init?.method === 'POST') {
        status = {
          ...STATUS,
          balance: 0,
          canClaim: false,
          blockedBy: 'token_cooldown',
          claimableAt: '2026-10-31T12:00:00.000Z',
          claims: [
            {
              id: 'c1',
              amount: 24,
              status: 'sent',
              txHash: 'abc',
              createdAt: '2026-10-30T12:00:00.000Z',
            },
          ],
        };
        return json(200, {
          id: 'c1',
          amount: 24,
          account: 'alice.testnet',
          status: 'sent',
          txHash: 'abc',
        });
      }
      return json(200, status);
    });
    vi.stubGlobal('fetch', fetch);
    render(<TokenCard api={createApi('http://api.test')} />);
    expect(await screen.findByText('24 NYRGO')).toBeInTheDocument();
    expect(screen.getByText(/Hoy: 12 de 50 NYRGO/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a mi cartera' }));
    expect(await screen.findByText('24 NYRGO enviados a alice.testnet.')).toBeInTheDocument();
    expect(await screen.findByText(/Podrás volver a reclamar/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ver' })).toHaveAttribute(
      'href',
      'https://testnet.nearblocks.io/txns/abc',
    );
    expect(screen.getByRole('button', { name: 'Enviar a mi cartera' })).toBeDisabled();
  });

  it('explains why a claim is not possible yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { ...STATUS, canClaim: false, blockedBy: 'wallet_required' })),
    );
    render(<TokenCard api={createApi('http://api.test')} />);
    expect(
      await screen.findByText('Vincula tu cartera NEAR para reclamarlos.'),
    ).toBeInTheDocument();
  });

  it('stays hidden while the token is off', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { ...STATUS, enabled: false })),
    );
    const { container } = render(<TokenCard api={createApi('http://api.test')} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });
});
