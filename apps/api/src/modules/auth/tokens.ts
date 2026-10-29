import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token, URL-safe. Only its hash is ever stored. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

/** Tokens we issue are 43 base64url characters; anything else is rejected before a lookup. */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
