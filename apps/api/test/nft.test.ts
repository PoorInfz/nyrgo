import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChainUnavailable, type NftChain, type TokenMetadata } from '../src/modules/nft/chain.js';
import { syncContent } from '../src/modules/content/sync.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

/** The creatures contract in memory: unique mints, transfers, enumeration by owner. */
class FakeContract implements NftChain {
  readonly contractId = 'creatures.nyrgo.testnet';
  tokens = new Map<string, { owner: string; metadata: TokenMetadata }>();
  mints = 0;
  down = false;
  /** The next mint goes through on chain but the answer never arrives. */
  loseNextAnswer = false;
  private guard() {
    if (this.down) throw new ChainUnavailable('down');
  }
  async mint(tokenId: string, owner: string, metadata: TokenMetadata) {
    this.guard();
    if (this.tokens.has(tokenId)) throw new ChainUnavailable('token_id must be unique');
    this.tokens.set(tokenId, { owner, metadata });
    this.mints++;
    if (this.loseNextAnswer) {
      this.loseNextAnswer = false;
      throw new ChainUnavailable('timeout');
    }
    return { txHash: `tx-${this.mints}` };
  }
  async tokenOwner(id: string) {
    this.guard();
    return this.tokens.get(id)?.owner ?? null;
  }
  async tokensFor(account: string) {
    this.guard();
    return [...this.tokens].filter(([, t]) => t.owner === account).map(([id]) => id);
  }
  transfer(id: string, to: string) {
    this.tokens.get(id)!.owner = to;
  }
}

describe.skipIf(!TEST_DB_URL)('creatures as NFTs', () => {
  let t: TestApp;
  const chain = new FakeContract();

  beforeAll(async () => {
    t = await makeTestApp({ nftChain: chain });
    await syncContent(t.db);
  });
  afterAll(() => t.close());

  const acc = () => `p${Math.random().toString(36).slice(2, 10)}.testnet`;

  async function player(birthYear = 1995) {
    const g = await createGuest(t.app, birthYear);
    const id = g.profile.id as string;
    const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) =>
      injectAs(t.app, { method, url, payload: payload as object, headers: cookieHeader(g.token) });
    const link = (account: string) =>
      t.db.query(
        `INSERT INTO wallet_links (user_id, network, account_id, public_key)
         VALUES ($1, 'testnet', $2, 'ed25519:test')
         ON CONFLICT (user_id) DO UPDATE SET account_id = EXCLUDED.account_id`,
        [id, account],
      );
    const creatures = async () =>
      (await call('GET', '/v1/me/creatures')).json().creatures as {
        id: string;
        onchain: { status: string; account: string } | null;
      }[];
    return { id, call, link, creatures };
  }

  async function withStarter(birthYear = 1995) {
    const p = await player(birthYear);
    const starter = (await p.call('POST', '/v1/me/starter', { creatureId: 'gwisp' })).json();
    return { ...p, creatureId: starter.id as string };
  }

  it('is for adults with a linked NEAR account', async () => {
    const minor = await withStarter(2010);
    const r1 = await minor.call('POST', `/v1/me/creatures/${minor.creatureId}/mint`);
    expect(r1.json().code).toBe('web3_restricted');
    const adult = await withStarter();
    const r2 = await adult.call('POST', `/v1/me/creatures/${adult.creatureId}/mint`);
    expect(r2.json().code).toBe('wallet_required');
  });

  it('mints the creature to the player’s account, once, and it can no longer evolve', async () => {
    const p = await withStarter();
    const account = acc();
    await p.link(account);
    const res = await p.call('POST', `/v1/me/creatures/${p.creatureId}/mint`);
    expect(res.statusCode).toBe(200);
    expect(res.json().creature.onchain).toEqual({ status: 'minted', account });
    const token = chain.tokens.get(p.creatureId)!;
    expect(token.owner).toBe(account);
    expect(token.metadata.title).toBe('Gwisp');
    expect(token.metadata.media).toBe('http://app.test/creatures/gwisp.webp');
    expect(JSON.parse(token.metadata.extra)).toMatchObject({ species: 'gwisp', game: 'nyrGo!' });

    const again = await p.call('POST', `/v1/me/creatures/${p.creatureId}/mint`);
    expect(again.json().code).toBe('creature_onchain');
    const evolve = await p.call('POST', `/v1/me/creatures/${p.creatureId}/evolve`);
    expect(evolve.json().code).toBe('creature_onchain');
  });

  it('follows the token: a gift to a linked player moves the creature to them', async () => {
    const a = await withStarter();
    const b = await player();
    const accA = acc();
    const accB = acc();
    await a.link(accA);
    await b.link(accB);
    await a.call('POST', `/v1/me/creatures/${a.creatureId}/mint`);
    chain.transfer(a.creatureId, accB);

    const forB = await b.creatures();
    expect(forB.map((c) => c.id)).toContain(a.creatureId);
    expect(forB.find((c) => c.id === a.creatureId)!.onchain).toEqual({
      status: 'minted',
      account: accB,
    });
    expect((await a.creatures()).map((c) => c.id)).not.toContain(a.creatureId);
  });

  it('hides a creature sold to an account nobody linked, until someone links it', async () => {
    const a = await withStarter();
    const accA = acc();
    await a.link(accA);
    await a.call('POST', `/v1/me/creatures/${a.creatureId}/mint`);
    const stranger = acc();
    chain.transfer(a.creatureId, stranger);
    await t.app.nftSyncer!.all();
    expect((await a.creatures()).map((c) => c.id)).not.toContain(a.creatureId);

    const c = await player();
    await c.link(stranger);
    expect((await c.creatures()).map((x) => x.id)).toContain(a.creatureId);
  });

  it('leaves the creature in the game when NEAR cannot be reached', async () => {
    const p = await withStarter();
    await p.link(acc());
    chain.down = true;
    const res = await p.call('POST', `/v1/me/creatures/${p.creatureId}/mint`);
    chain.down = false;
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('nft_unavailable');
    const mine = (await p.creatures()).find((c) => c.id === p.creatureId)!;
    expect(mine.onchain).toBeNull();
    expect((await p.call('POST', `/v1/me/creatures/${p.creatureId}/mint`)).statusCode).toBe(200);
  });

  it('never mints twice when the first answer was lost after the mint went through', async () => {
    const p = await withStarter();
    const account = acc();
    await p.link(account);
    const before = chain.mints;
    chain.loseNextAnswer = true;
    expect((await p.call('POST', `/v1/me/creatures/${p.creatureId}/mint`)).statusCode).toBe(503);
    const retry = await p.call('POST', `/v1/me/creatures/${p.creatureId}/mint`);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().creature.onchain).toEqual({ status: 'minted', account });
    expect(chain.mints - before).toBe(1);
  });

  it('goes with the wallet: unlinking hides it, linking again brings it back', async () => {
    const p = await withStarter();
    const account = acc();
    await p.link(account);
    await p.call('POST', `/v1/me/creatures/${p.creatureId}/mint`);
    await p.call('DELETE', '/v1/me/wallet');
    expect((await p.creatures()).map((c) => c.id)).not.toContain(p.creatureId);
    await p.link(account);
    expect((await p.creatures()).map((c) => c.id)).toContain(p.creatureId);
  });

  it('keeps an NFT creature when its last player deletes their account', async () => {
    const p = await withStarter();
    await p.link(acc());
    await p.call('POST', `/v1/me/creatures/${p.creatureId}/mint`);
    expect((await p.call('DELETE', '/v1/me', { confirm: 'DELETE' })).statusCode).toBe(204);
    const { rows } = await t.db.query(`SELECT 1 FROM creature_instances WHERE id = $1`, [
      p.creatureId,
    ]);
    expect(rows).toHaveLength(1);
  });
});
