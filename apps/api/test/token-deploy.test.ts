import { describe, expect, it } from 'vitest';
import {
  TOKEN_DEPOSIT,
  TOKEN_SUPPLY,
  codeHashOf,
  deployToken,
  type DeployTarget,
} from '../src/modules/nft/deploy.js';

const EMPTY = '11111111111111111111111111111111';
const NEAR = 10n ** 24n;

function fakeChain(gameBalance = 10n * NEAR) {
  const accounts = new Map([['game.testnet', { available: gameBalance, codeHash: EMPTY }]]);
  const state = { init: null as Record<string, unknown> | null };
  const calls: string[] = [];
  const t: DeployTarget = {
    async account(id) {
      return accounts.get(id) ?? null;
    },
    async createContractAccount(id, deposit) {
      calls.push(`create ${id}`);
      accounts.get('game.testnet')!.available -= deposit;
      accounts.set(id, { available: deposit, codeHash: EMPTY });
    },
    async deploy(id, wasm, init) {
      calls.push(init ? `deploy+init ${id}` : `deploy ${id}`);
      accounts.get(id)!.codeHash = codeHashOf(wasm);
      if (init) state.init = init;
    },
    async view<T>(_id: string, method: string) {
      const meta = state.init?.metadata as { symbol: string };
      if (method === 'ft_metadata') return meta as T;
      return String(state.init?.total_supply) as T;
    },
    async registerSpecies() {
      throw new Error('not for the token');
    },
  };
  return { t, calls, state };
}

const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 7]);
const opts = { game: 'game.testnet', contract: 'token.game.testnet', wasm };

describe('NYRGO token deploy', () => {
  it('creates the account, deploys and gives the whole fixed supply to the game', async () => {
    const c = fakeChain();
    const r = await deployToken(c.t, opts);
    expect(c.calls).toEqual(['create token.game.testnet', 'deploy+init token.game.testnet']);
    expect(c.state.init).toMatchObject({
      owner_id: 'game.testnet',
      total_supply: TOKEN_SUPPLY.toString(),
      metadata: { spec: 'ft-1.0.0', symbol: 'NYRGO', decimals: 18 },
    });
    expect(r).toMatchObject({
      created: true,
      deployed: 'new',
      gameBalance: TOKEN_SUPPLY.toString(),
    });
    expect(TOKEN_SUPPLY).toBe(1_000_000_000n * 10n ** 18n);
  });

  it('does nothing the second time and only upgrades when asked', async () => {
    const c = fakeChain();
    await deployToken(c.t, opts);
    c.calls.length = 0;
    expect((await deployToken(c.t, opts)).deployed).toBe('unchanged');
    const next = new Uint8Array([...wasm, 1]);
    expect((await deployToken(c.t, { ...opts, wasm: next })).deployed).toBe('differs');
    expect((await deployToken(c.t, { ...opts, wasm: next, upgrade: true })).deployed).toBe(
      'upgraded',
    );
    expect(c.calls).toEqual(['deploy token.game.testnet']);
  });

  it('refuses without enough NEAR or outside the game account', async () => {
    await expect(deployToken(fakeChain(TOKEN_DEPOSIT).t, opts)).rejects.toThrow(/Fund testnet/);
    await expect(
      deployToken(fakeChain().t, { ...opts, contract: 'token.other.testnet' }),
    ).rejects.toThrow(/sub-account/);
  });

  it('changes nothing in a dry run', async () => {
    const c = fakeChain();
    await deployToken(c.t, { ...opts, dryRun: true });
    expect(c.calls).toEqual([]);
  });
});
