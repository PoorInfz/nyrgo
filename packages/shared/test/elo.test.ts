import { describe, expect, it } from 'vitest';
import { eloExpected, eloUpdate } from '../src/combat.js';

describe('arena rating', () => {
  it('expects even odds between equals and favours the higher rating', () => {
    expect(eloExpected(1000, 1000)).toBe(0.5);
    expect(eloExpected(1200, 1000)).toBeGreaterThan(0.75);
  });
  it('moves the challenger by K and the absent defender by half', () => {
    expect(eloUpdate(1000, 1000, 1, 24)).toEqual({ challenger: 1012, defender: 994 });
    expect(eloUpdate(1000, 1000, 0, 24)).toEqual({ challenger: 988, defender: 1006 });
    expect(eloUpdate(1000, 1000, 0.5, 24)).toEqual({ challenger: 1000, defender: 1000 });
  });
  it('gains little for beating a much weaker player', () => {
    const r = eloUpdate(1600, 1000, 1, 24);
    expect(r.challenger - 1600).toBeLessThanOrEqual(1);
  });
});
