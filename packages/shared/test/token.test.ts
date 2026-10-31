import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AVATAR,
  HOLDER_OUTFITS,
  HOLDER_TIERS,
  TOKEN,
  TOKEN_UNIT,
  invalidLook,
  normaliseLook,
  tierFor,
} from '../src/index.js';

describe('test token ranks', () => {
  it('are the shares of the supply the owner asked for, with their boosts', () => {
    expect(HOLDER_TIERS.map((t) => (t.amount / TOKEN.supply) * 100)).toEqual([0.1, 0.3, 0.5, 1, 2]);
    expect(HOLDER_TIERS.map((t) => t.tipBoostPct)).toEqual([10, 15, 25, 50, 100]);
    expect(HOLDER_TIERS.map((t) => t.outfits)).toEqual([false, false, true, true, true]);
  });

  it('gives the highest rank a balance reaches', () => {
    expect(tierFor(0n)).toBeNull();
    expect(tierFor(999_999n * TOKEN_UNIT)).toBeNull();
    expect(tierFor(1_000_000n * TOKEN_UNIT)?.id).toBe('h1');
    expect(tierFor(5_000_000n * TOKEN_UNIT - 1n)?.id).toBe('h2');
    expect(tierFor(25_000_000n * TOKEN_UNIT)?.id).toBe('h5');
  });
});

describe('holder outfits', () => {
  it('can only be worn with a rank that includes them', () => {
    expect(HOLDER_OUTFITS.length).toBeGreaterThanOrEqual(20);
    const look = { ...DEFAULT_AVATAR, outfit: 'skin_knight' };
    expect(invalidLook(look, new Set())).toMatch(/holder outfit/);
    expect(invalidLook(look, new Set(), true)).toBeNull();
  });

  it('keeps older looks without an outfit wearable', () => {
    const old: Record<string, string> = { ...DEFAULT_AVATAR };
    delete old.outfit;
    expect(invalidLook(old, new Set())).toBeNull();
    expect(normaliseLook(old).outfit).toBe('outfit_none');
  });
});
