import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { googleDecoder, type IntegrityPayload } from '../src/modules/attest/google.js';
import { judge } from '../src/modules/attest/verdict.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

const PKG = 'fun.nyrgo.app';
const good = (nonce: string, over: Partial<IntegrityPayload> = {}): IntegrityPayload => ({
  requestDetails: { requestPackageName: PKG, nonce, timestampMillis: String(Date.now()) },
  appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED', packageName: PKG },
  deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
  accountDetails: { appLicensingVerdict: 'LICENSED' },
  ...over,
});
const rules = (nonce: string) => ({
  packageName: PKG,
  nonce,
  allowUnrecognizedApp: false,
  nowMs: Date.now(),
});

describe('Play Integrity verdicts', () => {
  it('passes the genuine app on a genuine device, for this request', () => {
    expect(judge(good('n1'), rules('n1')).reason).toBeNull();
  });
  it('refuses anything else, saying why', () => {
    expect(judge(good('other'), rules('n1')).reason).toBe('wrong_nonce');
    expect(
      judge(
        good('n1', {
          requestDetails: {
            requestPackageName: 'evil.app',
            nonce: 'n1',
            timestampMillis: String(Date.now()),
          },
        }),
        rules('n1'),
      ).reason,
    ).toBe('wrong_package');
    expect(
      judge(
        good('n1', {
          requestDetails: {
            requestPackageName: PKG,
            nonce: 'n1',
            timestampMillis: String(Date.now() - 600_000),
          },
        }),
        rules('n1'),
      ).reason,
    ).toBe('stale');
    expect(
      judge(
        good('n1', { appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION' } }),
        rules('n1'),
      ).reason,
    ).toBe('app_not_recognized');
    expect(
      judge(good('n1', { appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION' } }), {
        ...rules('n1'),
        allowUnrecognizedApp: true,
      }).reason,
    ).toBeNull();
    expect(
      judge(
        good('n1', { deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY'] } }),
        rules('n1'),
      ).reason,
    ).toBe('device_not_trusted');
    expect(
      judge(
        good('n1', { environmentDetails: { locationSpoofingRiskVerdict: ['RISK_DETECTED'] } }),
        rules('n1'),
      ).reason,
    ).toBe('location_spoofing');
  });
});

describe('Google decoder', () => {
  it('signs its own OAuth assertion and asks decodeIntegrityToken for the package', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const sa = JSON.stringify({
      client_email: 'checker@project.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    });
    const seen: { url: string; body: string; auth: string | undefined }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({
        url,
        body: String(init.body),
        auth: (init.headers as Record<string, string>).authorization,
      });
      if (url.includes('oauth2')) return Response.json({ access_token: 'at', expires_in: 3600 });
      return Response.json({ tokenPayloadExternal: good('n1') });
    }) as unknown as typeof fetch;
    const decode = googleDecoder(sa, fake);
    const p = await decode(PKG, 'tok');
    expect(p.appIntegrity?.appRecognitionVerdict).toBe('PLAY_RECOGNIZED');
    await decode(PKG, 'tok2'); // the access token is reused
    expect(seen.filter((s) => s.url.includes('oauth2'))).toHaveLength(1);
    const assertion = new URLSearchParams(seen[0]!.body).get('assertion')!;
    const claims = JSON.parse(Buffer.from(assertion.split('.')[1]!, 'base64url').toString());
    expect(claims).toMatchObject({
      iss: 'checker@project.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/playintegrity',
    });
    expect(seen[1]).toMatchObject({
      url: `https://playintegrity.googleapis.com/v1/${PKG}:decodeIntegrityToken`,
      body: JSON.stringify({ integrityToken: 'tok' }),
      auth: 'Bearer at',
    });
  });
});

describe.skipIf(!TEST_DB_URL)('device checks from the Android app', () => {
  let t: TestApp;
  let verdict: (nonce: string) => IntegrityPayload = good;
  let lastNonce = '';
  const sa = JSON.stringify({ client_email: 'x@y.iam.gserviceaccount.com', private_key: 'unused' });

  beforeAll(async () => {
    t = await makeTestApp({
      env: {
        PLAY_INTEGRITY_SERVICE_ACCOUNT: sa,
        PLAY_CLOUD_PROJECT_NUMBER: '123456789012',
        REWARDS_REQUIRE_ATTESTATION: 'true',
      },
      integrityDecoder: async (_pkg, token) => verdict(token === 'genuine-token' ? lastNonce : 'x'),
      // NFTs on, with a chain that must never be reached by an unverified player
      nftChain: {
        contractId: 'creatures.game.testnet',
        mint: async () => {
          throw new Error('must not mint');
        },
        token: async () => null,
        speciesSupply: async () => ({ minted: 0, max: 1000 }),
        tokensFor: async () => [],
        listings: async () => [],
        marketConfig: async () => ({
          treasury: 'r.testnet',
          royalty_bps: 500,
          market_fee_bps: 500,
        }),
      },
    });
  });
  afterAll(() => t.close());

  async function player() {
    const g = await createGuest(t.app);
    const call = (method: 'GET' | 'POST', url: string, payload: object = {}) =>
      injectAs(t.app, {
        method,
        url,
        ...(method === 'POST' ? { payload } : {}),
        headers: cookieHeader(g.token),
      });
    const check = async (token: string) => {
      const n = (await call('POST', '/v1/me/attest/nonce')).json();
      lastNonce = n.nonce;
      return call('POST', '/v1/me/attest', { nonce: n.nonce, token });
    };
    return { id: g.profile.id as string, call, check };
  }

  it('verifies a genuine device for a day, with a single-use nonce', async () => {
    const p = await player();
    const n = (await p.call('POST', '/v1/me/attest/nonce')).json();
    expect(n).toMatchObject({ cloudProjectNumber: '123456789012', packageName: PKG });
    expect((await p.call('GET', '/v1/me/attest')).json()).toMatchObject({
      enabled: true,
      verified: false,
    });
    const ok = await p.check('genuine-token');
    expect(ok.statusCode).toBe(200);
    expect((await p.call('GET', '/v1/me/attest')).json()).toMatchObject({ verified: true });
    // the nonce cannot be used again
    const again = await p.call('POST', '/v1/me/attest', { nonce: lastNonce, token: 'genuine-token' });
    expect(again.json()).toMatchObject({ code: 'attest_failed', detail: 'nonce' });
  });

  it('refuses a tampered device, adds risk, and keeps rewards closed', async () => {
    const p = await player();
    verdict = (nonce) => good(nonce, { deviceIntegrity: { deviceRecognitionVerdict: [] } });
    const res = await p.check('genuine-token');
    verdict = good;
    expect(res.json()).toMatchObject({ code: 'attest_failed', detail: 'device_not_trusted' });
    const { rows } = await t.db.query(`SELECT kind FROM risk_signals WHERE user_id = $1`, [p.id]);
    expect(rows.map((r) => r.kind)).toContain('attestation_failed');
    expect((await p.call('GET', '/v1/me/attest')).json()).toMatchObject({
      verified: false,
      lastReason: 'device_not_trusted',
    });
  });

  it('requires a verified device to take a creature out as an NFT', async () => {
    const p = await player();
    const starter = (await p.call('POST', '/v1/me/starter', { creatureId: 'gwisp' })).json();
    await t.db.query(
      `INSERT INTO wallet_links (user_id, network, account_id, public_key)
       VALUES ($1, 'testnet', $2, 'ed25519:test')`,
      [p.id, `a${p.id.slice(0, 8)}.testnet`],
    );
    const res = await p.call('POST', `/v1/me/creatures/${starter.id}/mint`);
    expect(res.json().code).toBe('attest_required');
  });
});
