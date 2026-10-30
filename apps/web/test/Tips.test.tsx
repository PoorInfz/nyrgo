import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from '../src/i18n';
import { createApi, type MyTips } from '../src/api';
import { TipsCard } from '../src/screens/TipsCard';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const TIPS: MyTips = {
  enabled: true,
  network: 'testnet',
  rules: { amountNear: '0.005', maxPerDay: 5, minIntervalMin: 60, minDistanceM: 100 },
  today: 2,
  nextTipAt: '2026-10-30T15:00:00.000Z',
  tips: [
    {
      id: 't1',
      amountNear: '0.005',
      status: 'sent',
      txHash: 'abc',
      createdAt: '2026-10-30T14:00:00.000Z',
    },
  ],
};

beforeEach(() => i18n.changeLanguage('es'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NEAR tips card', () => {
  it('explains the rules and lists the tips with their transactions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, TIPS)),
    );
    render(<TipsCard api={createApi('http://api.test')} />);
    expect(
      await screen.findByText(/ganas 0.005 NEAR, pagados con las comisiones/),
    ).toBeInTheDocument();
    expect(screen.getByText(/a 100 m o más del anterior y 5 al día/)).toBeInTheDocument();
    expect(screen.getByText('Hoy: 2 de 5 tips.')).toBeInTheDocument();
    expect(screen.getByText(/Próximo tip posible/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ver' })).toHaveAttribute(
      'href',
      'https://testnet.nearblocks.io/txns/abc',
    );
  });

  it('stays hidden while tips are off', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { ...TIPS, enabled: false })),
    );
    const { container } = render(<TipsCard api={createApi('http://api.test')} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });
});
