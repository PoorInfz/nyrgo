import { describe, expect, it } from 'vitest';
import {
  COSMETICS,
  COSMETIC_SLOTS,
  COSMETICS_BY_ID,
  DEFAULT_AVATAR,
  invalidLook,
  normaliseLook,
} from '../src/index.js';

describe('cosmetics', () => {
  it('has unique ids, a free choice in every slot and a free default look', () => {
    expect(COSMETICS_BY_ID.size).toBe(COSMETICS.length);
    for (const slot of COSMETIC_SLOTS) {
      expect(COSMETICS.some((c) => c.slot === slot && c.price === 0)).toBe(true);
      const def = COSMETICS_BY_ID.get(DEFAULT_AVATAR[slot])!;
      expect(def).toMatchObject({ slot, price: 0 });
    }
    for (const c of COSMETICS) {
      expect(c.price).toBeGreaterThanOrEqual(0);
      expect(c.id).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('only lets players wear what is free or theirs', () => {
    const none = new Set<string>();
    expect(invalidLook(DEFAULT_AVATAR, none)).toBeNull();
    expect(invalidLook({ ...DEFAULT_AVATAR, hat: 'hat_crown' }, none)).toMatch(/not owned/);
    expect(invalidLook({ ...DEFAULT_AVATAR, hat: 'hat_crown' }, new Set(['hat_crown']))).toBeNull();
    expect(invalidLook({ ...DEFAULT_AVATAR, hat: 'top_hoodie' }, new Set(['top_hoodie']))).toMatch(
      /unknown hat/,
    );
    expect(invalidLook({ ...DEFAULT_AVATAR, wings: 'x' }, none)).toBe('unknown slot');
    const noHat: Record<string, string> = { ...DEFAULT_AVATAR };
    delete noHat.hat;
    expect(invalidLook(noHat, none)).toBe('missing hat');
  });

  it('repairs stored looks', () => {
    expect(normaliseLook(null)).toEqual(DEFAULT_AVATAR);
    expect(normaliseLook({ hat: 'hat_cap', top: 'nope' })).toEqual({
      ...DEFAULT_AVATAR,
      hat: 'hat_cap',
    });
  });
});
