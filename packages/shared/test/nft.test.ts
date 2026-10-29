import { describe, expect, it } from 'vitest';
import { NFT_SUPPLY_BY_RARITY, RARITIES, ivPercent, nftGrade } from '../src/index.js';

describe('creature NFTs', () => {
  it('mints fewer of each species the rarer it is', () => {
    const supply = RARITIES.map((r) => NFT_SUPPLY_BY_RARITY[r]);
    for (let i = 1; i < supply.length; i++) expect(supply[i]).toBeLessThan(supply[i - 1]!);
  });

  it('grades individuals from D to S by their IVs', () => {
    const iv = (n: number) => ({ hp: n, atk: n, def: n, spd: n });
    expect(nftGrade(iv(0))).toBe('D');
    expect(nftGrade(iv(5))).toBe('C');
    expect(nftGrade(iv(8))).toBe('B');
    expect(nftGrade(iv(10))).toBe('A');
    expect(nftGrade(iv(13))).toBe('S');
    expect(ivPercent(iv(15))).toBe(100);
  });

  it('makes the top grades the scarce ones for random IVs', () => {
    // every combination of four IVs, 0–15 each
    const count: Record<string, number> = {};
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 16; b++)
        for (let c = 0; c < 16; c++)
          for (let d = 0; d < 16; d++) {
            const g = nftGrade({ hp: a, atk: b, def: c, spd: d });
            count[g] = (count[g] ?? 0) + 1;
          }
    const share = (g: string) => (count[g] ?? 0) / 16 ** 4;
    expect(share('S')).toBeLessThan(0.02);
    expect(share('A')).toBeLessThan(share('B'));
    expect(share('D')).toBeLessThan(share('C'));
  });
});
