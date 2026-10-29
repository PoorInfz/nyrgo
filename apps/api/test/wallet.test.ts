import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  base58Decode,
  base58Encode,
  isNearAccountId,
  nep413Hash,
  parseSignature,
  verifyNep413,
  type Nep413Payload,
} from '../src/modules/wallet/nep413.js';
import { RpcUnavailable, type KeyAccess, type NearRpc } from '../src/modules/wallet/rpc.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

/** A wallet for tests: an ed25519 key pair that signs NEP-413 messages like a real one. */
function testWallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x!, 'base64url');
  const pk = `ed25519:${base58Encode(raw)}`;
  return {
    publicKey: pk,
    sign: (p: Nep413Payload, key: KeyObject = privateKey) =>
      sign(null, nep413Hash(p), key).toString('base64'),
  };
}

describe('NEP-413', () => {
  it('round-trips base58 (with leading zero bytes)', () => {
    const bytes = Buffer.from([0, 0, 1, 2, 250, 255]);
    expect(base58Decode(base58Encode(bytes))).toEqual(bytes);
  });

  it('verifies a signature over exactly the message, nonce and recipient', () => {
    const w = testWallet();
    const p = { message: 'hola', nonce: Buffer.alloc(32, 7), recipient: 'nyrgo' };
    const sig = w.sign(p);
    expect(verifyNep413(p, w.publicKey, sig)).toBe(true);
    expect(verifyNep413({ ...p, message: 'hola!' }, w.publicKey, sig)).toBe(false);
    expect(verifyNep413({ ...p, recipient: 'other' }, w.publicKey, sig)).toBe(false);
    expect(verifyNep413({ ...p, nonce: Buffer.alloc(32, 8) }, w.publicKey, sig)).toBe(false);
    expect(verifyNep413(p, testWallet().publicKey, sig)).toBe(false);
    // some wallets send base58 instead of base64
    expect(verifyNep413(p, w.publicKey, base58Encode(Buffer.from(sig, 'base64')))).toBe(true);
    expect(parseSignature('not a signature')).toBeNull();
  });

  it('hashes tag, message, nonce, recipient and callback in that order', () => {
    const nonce = Buffer.alloc(32, 1);
    const h = nep413Hash({ message: 'a', nonce, recipient: 'b' });
    // borsh: u32 tag (LE) | u32 len "a" | nonce | u32 len "b" | Option::None
    const expected = Buffer.concat([
      Buffer.from([0x9d, 0x01, 0x00, 0x80]),
      Buffer.from([1, 0, 0, 0]),
      Buffer.from('a'),
      nonce,
      Buffer.from([1, 0, 0, 0]),
      Buffer.from('b'),
      Buffer.from([0]),
    ]);
    expect(h).toEqual(createHash('sha256').update(expected).digest());
    expect(nep413Hash({ message: 'a', nonce, recipient: 'b', callbackUrl: 'x' })).not.toEqual(h);
  });

  it("accepts signatures made by NEAR's own library (near-api-js)", async () => {
    const { KeyPair, KeyPairSigner } = await import('near-api-js');
    const signer = new KeyPairSigner(KeyPair.fromRandom('ed25519'));
    const nonce = Buffer.alloc(32, 3);
    const payload = { message: 'nyrGo! test', recipient: 'nyrgo', nonce: new Uint8Array(nonce) };
    const out = await signer.signNep413Message('alice.testnet', payload);
    const sig = Buffer.from(out.signature).toString('base64');
    const pk = out.publicKey.toString();
    expect(verifyNep413({ ...payload, nonce }, pk, sig)).toBe(true);
    expect(verifyNep413({ ...payload, nonce, message: 'nyrGo! test.' }, pk, sig)).toBe(false);
  });

  it('accepts NEAR account ids and nothing else', () => {
    for (const ok of ['alice.testnet', 'a1', 'nyrgo-dev.testnet', 'x_y.near', 'a'.repeat(64)])
      expect(isNearAccountId(ok), ok).toBe(true);
    for (const bad of ['A.testnet', 'a', '.testnet', 'a..b', 'a.', '-a', 'a b', 'a'.repeat(65)])
      expect(isNearAccountId(bad), bad).toBe(false);
  });
});

describe.skipIf(!TEST_DB_URL)('wallet links', () => {
  let t: TestApp;
  const keys = new Map<string, KeyAccess>();
  let rpcDown = false;
  const rpc: NearRpc = {
    async accessKey(accountId, publicKey) {
      if (rpcDown) throw new RpcUnavailable('down');
      return keys.get(`${accountId}|${publicKey}`) ?? 'missing';
    },
  };

  beforeAll(async () => {
    t = await makeTestApp({ nearRpc: rpc });
  });
  afterAll(() => t.close());

  async function player(birthYear = 1995) {
    const g = await createGuest(t.app, birthYear);
    const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) =>
      injectAs(t.app, {
        method,
        url,
        payload: payload as object,
        headers: cookieHeader(g.token),
      });
    return { id: g.profile.id as string, token: g.token, call };
  }

  const accountId = () => `p${Math.random().toString(36).slice(2, 10)}.testnet`;

  /** Asks for a challenge and signs it with the wallet, the way the client does. */
  async function signed(
    p: Awaited<ReturnType<typeof player>>,
    w: ReturnType<typeof testWallet>,
    account: string,
    tweak: Partial<Nep413Payload> = {},
  ) {
    const ch = (await p.call('POST', '/v1/me/wallet/challenge')).json();
    const nonce = Buffer.from(ch.nonce, 'base64');
    const signature = w.sign({ message: ch.message, nonce, recipient: ch.recipient, ...tweak });
    return { accountId: account, publicKey: w.publicKey, signature, nonce: ch.nonce };
  }

  it('is only for adults', async () => {
    const minor = await player(2010);
    for (const [m, url] of [
      ['GET', '/v1/me/wallet'],
      ['POST', '/v1/me/wallet/challenge'],
    ] as const) {
      const res = await minor.call(m, url);
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('web3_restricted');
    }
    const me = (await minor.call('GET', '/v1/me')).json();
    expect(me.canUseWeb3).toBe(false);
  });

  it('links a testnet account on proof of a full-access key, once per challenge', async () => {
    const p = await player();
    const w = testWallet();
    const acc = accountId();
    keys.set(`${acc}|${w.publicKey}`, 'full');

    const ch = (await p.call('POST', '/v1/me/wallet/challenge')).json();
    expect(ch).toMatchObject({ recipient: 'nyrgo', network: 'testnet' });
    expect(Buffer.from(ch.nonce, 'base64')).toHaveLength(32);

    const body = await signed(p, w, acc);
    const res = await p.call('POST', '/v1/me/wallet/link', body);
    expect(res.statusCode).toBe(200);
    expect(res.json().wallet).toMatchObject({ accountId: acc, network: 'testnet' });
    expect((await p.call('GET', '/v1/me/wallet')).json().wallet.accountId).toBe(acc);

    const replay = await p.call('POST', '/v1/me/wallet/link', body);
    expect(replay.json().code).toBe('wallet_challenge_invalid');

    const exported = (await p.call('GET', '/v1/me/data-export')).json();
    expect(exported.wallet).toEqual([expect.objectContaining({ account_id: acc })]);

    expect((await p.call('DELETE', '/v1/me/wallet')).statusCode).toBe(204);
    expect((await p.call('GET', '/v1/me/wallet')).json().wallet).toBeNull();
  });

  it('refuses a signature over anything but the issued message, nonce and recipient', async () => {
    const p = await player();
    const w = testWallet();
    const acc = accountId();
    keys.set(`${acc}|${w.publicKey}`, 'full');
    for (const tweak of [
      { message: 'something else' },
      { recipient: 'evil.example' },
      { nonce: Buffer.alloc(32, 9) },
    ]) {
      const res = await p.call('POST', '/v1/me/wallet/link', await signed(p, w, acc, tweak));
      expect(res.json().code, JSON.stringify(Object.keys(tweak))).toBe('wallet_signature_invalid');
    }
    // signed by one key, claimed for another
    const other = testWallet();
    const body = { ...(await signed(p, w, acc)), publicKey: other.publicKey };
    expect((await p.call('POST', '/v1/me/wallet/link', body)).json().code).toBe(
      'wallet_signature_invalid',
    );
  });

  it('needs a full-access key of that very account', async () => {
    const p = await player();
    const w = testWallet();
    const acc = accountId();
    keys.set(`${acc}|${w.publicKey}`, 'limited');
    const limited = await p.call('POST', '/v1/me/wallet/link', await signed(p, w, acc));
    expect(limited.json().code).toBe('wallet_key_not_full_access');
    const elsewhere = await p.call('POST', '/v1/me/wallet/link', await signed(p, w, accountId()));
    expect(elsewhere.json().code).toBe('wallet_key_not_full_access');
  });

  it("refuses expired challenges and other players' challenges", async () => {
    const a = await player();
    const b = await player();
    const w = testWallet();
    const acc = accountId();
    keys.set(`${acc}|${w.publicKey}`, 'full');

    const body = await signed(a, w, acc);
    expect((await b.call('POST', '/v1/me/wallet/link', body)).json().code).toBe(
      'wallet_challenge_invalid',
    );
    await t.db.query(
      `UPDATE wallet_challenges SET expires_at = now() - interval '1 second' WHERE nonce = $1`,
      [Buffer.from(body.nonce, 'base64')],
    );
    expect((await a.call('POST', '/v1/me/wallet/link', body)).json().code).toBe(
      'wallet_challenge_invalid',
    );
  });

  it('moves an account to whoever proves the key now', async () => {
    const a = await player();
    const b = await player();
    const w = testWallet();
    const acc = accountId();
    keys.set(`${acc}|${w.publicKey}`, 'full');
    expect((await a.call('POST', '/v1/me/wallet/link', await signed(a, w, acc))).statusCode).toBe(
      200,
    );
    expect((await b.call('POST', '/v1/me/wallet/link', await signed(b, w, acc))).statusCode).toBe(
      200,
    );
    expect((await a.call('GET', '/v1/me/wallet')).json().wallet).toBeNull();
    expect((await b.call('GET', '/v1/me/wallet')).json().wallet.accountId).toBe(acc);
  });

  it('keeps the challenge when NEAR cannot be reached, so the player can retry', async () => {
    const p = await player();
    const w = testWallet();
    const acc = accountId();
    keys.set(`${acc}|${w.publicKey}`, 'full');
    const body = await signed(p, w, acc);
    rpcDown = true;
    const down = await p.call('POST', '/v1/me/wallet/link', body);
    rpcDown = false;
    expect(down.statusCode).toBe(503);
    expect(down.json().code).toBe('wallet_unavailable');
    expect((await p.call('POST', '/v1/me/wallet/link', body)).statusCode).toBe(200);
  });

  it('removes the link and challenges with the account', async () => {
    const p = await player();
    const w = testWallet();
    const acc = accountId();
    keys.set(`${acc}|${w.publicKey}`, 'full');
    await p.call('POST', '/v1/me/wallet/link', await signed(p, w, acc));
    const del = await p.call('DELETE', '/v1/me', { confirm: 'DELETE' });
    expect(del.statusCode).toBe(204);
    for (const table of ['wallet_links', 'wallet_challenges']) {
      const { rows } = await t.db.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`,
        [p.id],
      );
      expect(rows[0].n, table).toBe(0);
    }
  });
});
