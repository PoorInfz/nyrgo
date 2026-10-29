import { createHash, createPublicKey, verify } from 'node:crypto';

/**
 * NEP-413 off-chain message signing (https://github.com/near/NEPs/blob/master/neps/nep-0413.md),
 * the way a NEAR wallet proves "this account signed this text" without a transaction.
 *
 * Signed bytes: sha256( borsh(u32 tag) ‖ borsh(Payload) ), tag = 2^31 + 413, where
 * Payload = { message: string, nonce: [u8; 32], recipient: string, callbackUrl: Option<string> }.
 * Checked against near-kit's reference implementation; the borsh encoding is written out here
 * (four primitive types) rather than pulled in as a dependency.
 */

export const NEP413_TAG = 2 ** 31 + 413;

export interface Nep413Payload {
  message: string;
  nonce: Uint8Array;
  recipient: string;
  callbackUrl?: string | null;
}

const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const str = (s: string) => {
  const bytes = Buffer.from(s, 'utf8');
  return Buffer.concat([u32(bytes.length), bytes]);
};

/** The 32-byte hash a NEP-413 signature is over. */
export function nep413Hash(p: Nep413Payload): Buffer {
  if (p.nonce.length !== 32) throw new Error('NEP-413 nonce must be 32 bytes');
  const callback =
    p.callbackUrl === undefined || p.callbackUrl === null
      ? Buffer.from([0])
      : Buffer.concat([Buffer.from([1]), str(p.callbackUrl)]);
  const bytes = Buffer.concat([
    u32(NEP413_TAG),
    str(p.message),
    Buffer.from(p.nonce),
    str(p.recipient),
    callback,
  ]);
  return createHash('sha256').update(bytes).digest();
}

// ---------------------------------------------------------------- key and signature formats

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Decode(s: string): Buffer {
  let n = 0n;
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('not base58');
    n = n * 58n + BigInt(v);
  }
  const out: number[] = [];
  while (n > 0n) {
    out.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const ch of s) {
    if (ch !== '1') break;
    out.unshift(0);
  }
  return Buffer.from(out);
}

export function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)]! + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

/** `ed25519:<base58>` → the 32 raw key bytes; null for anything else (secp256k1 is not accepted). */
export function parsePublicKey(key: string): Buffer | null {
  const m = /^ed25519:([1-9A-HJ-NP-Za-km-z]{32,50})$/.exec(key);
  if (!m) return null;
  try {
    const raw = base58Decode(m[1]!);
    return raw.length === 32 ? raw : null;
  } catch {
    return null;
  }
}

/** Wallets send the 64-byte signature in base64 (the standard) or, some of them, base58. */
export function parseSignature(sig: string): Buffer | null {
  const s = sig.startsWith('ed25519:') ? sig.slice(8) : sig;
  if (/^[A-Za-z0-9+/]{86}==$/.test(s)) {
    const b = Buffer.from(s, 'base64');
    if (b.length === 64) return b;
  }
  try {
    const b = base58Decode(s);
    return b.length === 64 ? b : null;
  } catch {
    return null;
  }
}

/** Verifies an ed25519 NEP-413 signature. Does not check that the key belongs to the account. */
export function verifyNep413(
  payload: Nep413Payload,
  publicKey: string,
  signature: string,
): boolean {
  const raw = parsePublicKey(publicKey);
  const sig = parseSignature(signature);
  if (!raw || !sig) return false;
  const key = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
    format: 'jwk',
  });
  return verify(null, nep413Hash(payload), key, sig);
}

/** NEAR account ids: 2–64 chars, lowercase, digits, `-` `_` separators and `.` sub-accounts. */
export function isNearAccountId(id: string): boolean {
  return (
    id.length >= 2 &&
    id.length <= 64 &&
    /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(id)
  );
}
