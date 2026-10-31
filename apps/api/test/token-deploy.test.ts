import { describe, expect, it } from 'vitest';
import { TOKEN, TOKEN_UNIT } from '@nyrgo/shared';
import { deployToken, type TokenTarget } from '../src/modules/token/deploy.js';
import { codeHashOf } from '../src/modules/nft/deploy.js';

const NEAR = 10n ** 24n;
const WASM = new Uint8Array([0, 97, 115, 109, 1]);

function fakeChain() {
  const accounts = new Map<string, { available: bigint; codeHash: string }>([
    ['game.testnet', { available: 10n * NEAR, codeHash: '11111111111111111111111111111111' }],
    ['alice.testnet', { available: NEAR, codeHash: '11111111111111111111111111111111' }],
  ]);
  const balances = new Map<string, bigint>();
  const calls: string[] = [];
  const t: TokenTarget = {
    async account(id) {
      return accounts.get(id) ?? null;
    },
    async createContractAccount(id, deposit) {
      calls.push(`create ${id}`);
      accounts.set(id, { available: deposit, codeHash: '11111111111111111111111111111111' });
    },
    async deploy(id, wasm, init) {
      calls.push(`deploy ${id}`);
      accounts.get(id)!.codeHash = codeHashOf(wasm);
      balances.set(init.owner_id as string, BigInt(init.total_supply as string));
    },
    async view<T>(_id: string, method: string, args: Record<string, unknown>) {
      if (method === 'ft_metadata') return { symbol: TOKEN.symbol } as T;
      if (method === 'ft_total_supply') return (BigInt(TOKEN.supply) * TOKEN_UNIT).toString() as T;
      return (balances.get(args.account_id as string) ?? 0n).toString() as T;
    },
    async send(_c, to, amount) {
      calls.push(`send ${to}`);
      balances.set('game.testnet', balances.get('game.testnet')! - amount);
      balances.set(to, (balances.get(to) ?? 0n) + amount);
    },
  };
  return { t, calls, balances };
}

describe('test token deploy', () => {
  it('creates, deploys with the supply to the game, sends test tokens, and is safe to rerun', async () => {
    const f = fakeChain();
    const opts = {
      game: 'game.testnet',
      contract: 'token.game.testnet',
      wasm: WASM,
      sends: [
        ['alice.testnet', 5_000_000],
        ['nobody.testnet', 1],
      ] as [string, number][],
    };
    const r = await deployToken(f.t, opts);
    expect(r).toEqual({ created: true, deployed: 'new', sent: 1 });
    expect(f.calls).toEqual([
      'create token.game.testnet',
      'deploy token.game.testnet',
      'send alice.testnet',
    ]);
    expect(f.balances.get('alice.testnet')).toBe(5_000_000n * TOKEN_UNIT);

    const again = await deployToken(f.t, { ...opts, sends: [] });
    expect(again).toEqual({ created: false, deployed: 'unchanged', sent: 0 });
  });

  it('changes nothing on a dry run and refuses a token outside the game account', async () => {
    const f = fakeChain();
    const r = await deployToken(f.t, {
      game: 'game.testnet',
      contract: 'token.game.testnet',
      wasm: WASM,
      dryRun: true,
    });
    expect(r).toMatchObject({ created: true, deployed: 'new', sent: 0 });
    expect(f.calls).toEqual([]);
    await expect(
      deployToken(f.t, { game: 'game.testnet', contract: 'token.other.testnet', wasm: WASM }),
    ).rejects.toThrow(/sub-account/);
  });
});
