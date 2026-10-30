import { describe, expect, it } from 'vitest';
import {
  CONTRACT_DEPOSIT,
  codeHashOf,
  deployCreatures,
  type DeployTarget,
  type SpeciesSupplyArg,
} from '../src/modules/nft/deploy.js';

const EMPTY = '11111111111111111111111111111111';
const NEAR = 10n ** 24n;

/** An in-memory chain that behaves like the contract for what the deploy touches. */
function fakeChain(gameBalance = 10n * NEAR) {
  const accounts = new Map<string, { available: bigint; codeHash: string }>([
    ['game.testnet', { available: gameBalance, codeHash: EMPTY }],
  ]);
  const state = { owner: null as string | null, species: new Map<string, number>() };
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
      if (init) state.owner = init.owner_id as string;
    },
    async view<T>(_id: string, method: string, args: Record<string, unknown>) {
      if (method === 'game_account') return state.owner as T;
      const max = state.species.get(args.species as string);
      return (max ? { minted: 0, max } : null) as T;
    },
    async registerSpecies(_id, species) {
      calls.push(`register ${species.length}`);
      for (const s of species) {
        if (state.species.has(s.species)) throw new Error('fixed once registered');
        state.species.set(s.species, s.max_supply);
      }
    },
  };
  return { t, calls, accounts, state };
}

const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
const species: SpeciesSupplyArg[] = Array.from({ length: 30 }, (_, i) => ({
  species: `s${i}`,
  max_supply: i < 20 ? 1000 : 10,
}));
const opts = { game: 'game.testnet', contract: 'creatures.game.testnet', wasm, species };

describe('NFT contract deploy', () => {
  it('creates, deploys with init and registers every species in batches', async () => {
    const c = fakeChain();
    const r = await deployCreatures(c.t, opts);
    expect(c.calls).toEqual([
      'create creatures.game.testnet',
      'deploy+init creatures.game.testnet',
      'register 25',
      'register 5',
    ]);
    expect(r).toMatchObject({ created: true, deployed: 'new', registered: 30 });
    expect(c.state.owner).toBe('game.testnet');
    expect(c.accounts.get('creatures.game.testnet')!.available).toBe(CONTRACT_DEPOSIT);
  });

  it('does nothing the second time', async () => {
    const c = fakeChain();
    await deployCreatures(c.t, opts);
    c.calls.length = 0;
    const r = await deployCreatures(c.t, opts);
    expect(c.calls).toEqual([]);
    expect(r).toMatchObject({
      created: false,
      deployed: 'unchanged',
      registered: 0,
      alreadyRegistered: 30,
    });
  });

  it('registers only species added since, and reports changed supplies without touching them', async () => {
    const c = fakeChain();
    await deployCreatures(c.t, { ...opts, species: species.slice(0, 10) });
    c.calls.length = 0;
    const changed = species.map((s, i) => (i === 0 ? { ...s, max_supply: 5 } : s));
    const r = await deployCreatures(c.t, { ...opts, species: changed });
    expect(c.calls).toEqual(['register 20']);
    expect(r.mismatched).toEqual(['s0 (1000 ≠ 5)']);
    expect(c.state.species.get('s0')).toBe(1000);
  });

  it('replaces different code only when asked, keeping the state', async () => {
    const c = fakeChain();
    await deployCreatures(c.t, opts);
    c.calls.length = 0;
    const next = new Uint8Array([...wasm, 1]);
    expect((await deployCreatures(c.t, { ...opts, wasm: next })).deployed).toBe('differs');
    expect(c.calls).toEqual([]);
    expect((await deployCreatures(c.t, { ...opts, wasm: next, upgrade: true })).deployed).toBe(
      'upgraded',
    );
    expect(c.calls).toEqual(['deploy creatures.game.testnet']);
    expect(c.state.species.size).toBe(30);
  });

  it('changes nothing in a dry run', async () => {
    const c = fakeChain();
    const lines: string[] = [];
    await deployCreatures(c.t, { ...opts, dryRun: true, log: (l) => lines.push(l) });
    expect(c.calls).toEqual([]);
    expect(lines.join('\n')).toMatch(/would create creatures\.game\.testnet/);
    expect(lines.join('\n')).toMatch(/would register 30 species/);
  });

  it('refuses without enough balance, foreign owners and non sub-accounts', async () => {
    await expect(deployCreatures(fakeChain(2n * NEAR).t, opts)).rejects.toThrow(/faucet/);
    await expect(
      deployCreatures(fakeChain().t, { ...opts, contract: 'creatures.other.testnet' }),
    ).rejects.toThrow(/sub-account/);
    const c = fakeChain();
    await deployCreatures(c.t, opts);
    c.state.owner = 'someone.testnet';
    await expect(deployCreatures(c.t, opts)).rejects.toThrow(/owned by someone\.testnet/);
    await expect(
      deployCreatures(fakeChain().t, {
        ...opts,
        game: 'nobody.testnet',
        contract: 'c.nobody.testnet',
      }),
    ).rejects.toThrow(/does not exist/);
  });

  it('computes the code hash the way NEAR reports it (base58 sha256)', () => {
    // sha256("") in base58
    expect(codeHashOf(new Uint8Array())).toBe('GKot5hBsd81kMupNCXHaqbhv3huEbxAFMLnpcX2hniwn');
  });
});
