import { createSign } from 'node:crypto';

/**
 * The decoded Play Integrity verdict (classic request). Only the fields the game reads; see
 * https://developer.android.com/google/play/integrity/verdicts
 */
export interface IntegrityPayload {
  requestDetails?: { requestPackageName?: string; nonce?: string; timestampMillis?: string };
  appIntegrity?: { appRecognitionVerdict?: string; packageName?: string; versionCode?: string };
  deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
  accountDetails?: { appLicensingVerdict?: string };
  environmentDetails?: { locationSpoofingRiskVerdict?: string[]; playProtectVerdict?: string };
  testingDetails?: { isTestingResponse?: boolean };
}

/** Turns an integrity token from the app into its verdict. Tests pass a fake. */
export type IntegrityDecoder = (packageName: string, token: string) => Promise<IntegrityPayload>;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const SCOPE = 'https://www.googleapis.com/auth/playintegrity';
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/**
 * Google's decodeIntegrityToken with a service account (the JSON key from Google Cloud, held as a
 * secret). Signs its own OAuth assertion with node:crypto, so no Google SDK is needed.
 */
export function googleDecoder(
  serviceAccountJson: string,
  fetchFn: typeof fetch = fetch,
): IntegrityDecoder {
  const sa = JSON.parse(serviceAccountJson) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) throw new Error('not a service account key');
  const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  let access: { token: string; until: number } | null = null;

  async function accessToken(): Promise<string> {
    if (access && Date.now() < access.until - 60_000) return access.token;
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: SCOPE,
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      }),
    );
    const signature = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key);
    const res = await fetchFn(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${head}.${claims}.${b64url(signature)}`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Google OAuth answered ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    access = { token: body.access_token, until: Date.now() + body.expires_in * 1000 };
    return access.token;
  }

  return async (packageName, token) => {
    const res = await fetchFn(
      `https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await accessToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ integrityToken: token }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) throw new Error(`Play Integrity answered ${res.status}`);
    return ((await res.json()) as { tokenPayloadExternal: IntegrityPayload }).tokenPayloadExternal;
  };
}
